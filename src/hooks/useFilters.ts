import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { DEFAULT_FILTERS, parseFilters, serializeFilters, type Filters } from '../lib/filters.ts'

/**
 * Les filtres vivent dans l'URL (ADR-0006) : un lien porte la vue entière, le retour
 * arrière défait un critère, et un rechargement retrouve exactement le même écran.
 * pushState ne prévient aucun abonné : cet événement interne complète popstate.
 */
const FILTERS_EVENT = 'courant:filters'

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener('popstate', onStoreChange)
  window.addEventListener(FILTERS_EVENT, onStoreChange)
  return () => {
    window.removeEventListener('popstate', onStoreChange)
    window.removeEventListener(FILTERS_EVENT, onStoreChange)
  }
}

const getSearch = (): string => window.location.search
/** Pas de rendu serveur ici : la valeur ne sert qu'aux environnements sans window. */
const getServerSearch = (): string => ''

const currentUrl = (): string =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`

export interface FiltersController {
  readonly filters: Filters
  /** Applique un correctif sur les filtres lus dans l'URL, jamais sur un état obsolète. */
  readonly setFilters: (patch: Partial<Filters>) => void
  readonly reset: () => void
}

export function useFilters(): FiltersController {
  const search = useSyncExternalStore(subscribe, getSearch, getServerSearch)
  const filters = useMemo(() => parseFilters(search), [search])

  const apply = useCallback((next: Filters) => {
    const query = serializeFilters(next)
    const target = `${window.location.pathname}${query === '' ? '' : `?${query}`}${window.location.hash}`
    // une URL inchangée n'empile pas d'entrée : le retour arrière reste utile
    if (target === currentUrl()) return
    window.history.pushState(null, '', target)
    window.dispatchEvent(new Event(FILTERS_EVENT))
  }, [])

  const setFilters = useCallback(
    (patch: Partial<Filters>) => {
      apply({ ...parseFilters(window.location.search), ...patch })
    },
    [apply],
  )

  const reset = useCallback(() => {
    apply(DEFAULT_FILTERS)
  }, [apply])

  return { filters, setFilters, reset }
}
