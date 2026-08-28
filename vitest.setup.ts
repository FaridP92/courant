import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Sans les globals Vitest, le cleanup automatique de Testing Library
// ne s'enregistre pas : on le fait explicitement.
afterEach(() => {
  cleanup()
})
