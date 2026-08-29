import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadCsv, toCsv } from './csv.ts'

describe('toCsv', () => {
  it('produit un CSV point-virgule avec BOM UTF-8 et en-têtes', () => {
    const csv = toCsv([
      { ts: '2026-01-15T18:00:00Z', consommation: 61200 },
      { ts: '2026-01-15T18:15:00Z', consommation: null },
    ])
    expect(csv.startsWith('\ufeff')).toBe(true)
    const lines = csv.slice(1).split('\n')
    expect(lines[0]).toBe('ts;consommation')
    expect(lines[1]).toBe('2026-01-15T18:00:00Z;61200')
    // null exporté vide, jamais en zéro inventé
    expect(lines[2]).toBe('2026-01-15T18:15:00Z;')
  })

  it('échappe les guillemets et les séparateurs', () => {
    const csv = toCsv([{ name: 'Provence-Alpes-Côte d\'Azur; "Sud"' }])
    expect(csv).toContain('"Provence-Alpes-Côte d\'Azur; ""Sud"""')
  })

  it('renvoie une chaîne vide sans lignes', () => {
    expect(toCsv([])).toBe('')
  })
})

describe('downloadCsv', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("clique une ancre attachée au document et ne révoque le blob qu'après coup", () => {
    vi.useFakeTimers()
    const createObjectURL = vi.fn(() => 'blob:courant-test')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    let connectedAtClick = false
    let downloadAtClick = ''
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      // Safari et Firefox ignorent le clic d'une ancre hors du document
      connectedAtClick = this.isConnected
      downloadAtClick = this.download
    })

    downloadCsv([{ ts: '2026-01-15T18:00:00Z', consommation: 61200 }], 'courant-test.csv')

    expect(click).toHaveBeenCalledOnce()
    expect(connectedAtClick).toBe(true)
    expect(downloadAtClick).toBe('courant-test.csv')
    // l'ancre est nettoyée après le clic
    expect(document.querySelector('a[download]')).toBeNull()
    // révoquer en synchrone annulerait le téléchargement en cours dans certains navigateurs
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:courant-test')
  })
})
