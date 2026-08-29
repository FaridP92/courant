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
