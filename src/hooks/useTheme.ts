import { useCallback, useSyncExternalStore } from 'react'

/**
 * Thème jour / nuit. Le jour est le défaut (lisible, accueillant) ; la nuit reste
 * disponible pour qui la préfère. Le choix est mémorisé en localStorage et posé
 * sur <html data-theme> : les tokens CSS et les palettes de graphes en dépendent.
 * Sans choix explicite, la préférence système « sombre » est respectée.
 */
export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'courant-theme'

const listeners = new Set<() => void>()

const readStored = (): Theme | null => {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

const systemTheme = (): Theme =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'

export function resolveTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  return readStored() ?? systemTheme()
}

/** Applique le thème au document ; à appeler au démarrage avant le premier rendu. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

function setTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // stockage indisponible (navigation privée) : le choix vaut pour la session
  }
  applyTheme(theme)
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const snapshot = (): Theme => {
  const current = document.documentElement.dataset.theme
  return current === 'dark' || current === 'light' ? current : resolveTheme()
}

export function useTheme(): { theme: Theme; toggle: () => void; set: (theme: Theme) => void } {
  const theme = useSyncExternalStore(subscribe, snapshot, (): Theme => 'light')
  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme])
  return { theme, toggle, set: setTheme }
}
