import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Sans les globals Vitest, le cleanup automatique de Testing Library
// ne s'enregistre pas : on le fait explicitement.
afterEach(() => {
  cleanup()
})

// jsdom n'implémente pas matchMedia (usePrefersReducedMotion) : stub inerte,
// "aucune préférence de mouvement réduit" par défaut.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList
}

// jsdom peut ne pas exposer localStorage selon l'origine du document (useTheme) :
// stub mémoire, vidé entre les tests par les tests eux-mêmes.
if (
  typeof window !== 'undefined' &&
  (window as { localStorage?: Storage }).localStorage === undefined
) {
  const store = new Map<string, string>()
  const memoryStorage: Storage = {
    get length() {
      return store.size
    },
    clear: () => {
      store.clear()
    },
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => {
      store.delete(key)
    },
    setItem: (key, value) => {
      store.set(key, value)
    },
  }
  Object.defineProperty(window, 'localStorage', { value: memoryStorage, configurable: true })
}
