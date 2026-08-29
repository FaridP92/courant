import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', onChange)
  return () => {
    mql.removeEventListener('change', onChange)
  }
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches
}

/** Réactif : un changement du réglage système en cours de session coupe les animations
 * immédiatement, pas au prochain rendu fortuit. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
