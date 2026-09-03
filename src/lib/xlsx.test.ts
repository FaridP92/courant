import { describe, expect, it, vi } from 'vitest'
import { enedisCurveXlsx, enedisDailyXlsx } from './__fixtures__/enedisXlsx.ts'
import { inflateWithStreams, looksLikeXlsx, readXlsx, XlsxError } from './xlsx.ts'

describe('readXlsx', () => {
  it('lit les feuilles, les chaînes partagées et les nombres, aux vraies positions de ligne', async () => {
    const sheets = await readXlsx(enedisDailyXlsx())
    expect(sheets.map((s) => s.name)).toEqual(["Page d'accueil", 'Export Consommation Quotidienne'])
    const daily = sheets[1]
    // les lignes vides ne sont pas écrites dans le classeur : l'attribut r fait foi
    expect(daily?.rows[7]?.[0]).toBe('Point Référence Mesure (PRM) : ')
    expect(daily?.rows[7]?.[3]).toBe('Consommation Quotidienne')
    expect(daily?.rows[13]).toEqual(['Date', 'Valeur (en kWh)'])
    expect(daily?.rows[14]).toEqual(['01/01/2026', 6.329])
    expect(daily?.rows[16]).toEqual(['03/01/2026', 'NA'])
  })

  it('passe par la décompression injectée et donne le même résultat que la native', async () => {
    const spy = vi.fn(inflateWithStreams)
    const [native, injected] = await Promise.all([
      readXlsx(enedisCurveXlsx()),
      readXlsx(enedisCurveXlsx(), spy),
    ])
    expect(spy).toHaveBeenCalled()
    expect(injected).toEqual(native)
    expect(native[1]?.rows[14]).toEqual(['2026-01-05T00:30:00+01:00', 1200])
  })

  it("refuse ce qui n'est pas un classeur", async () => {
    const junk = new TextEncoder().encode('Horodate;Valeur\n2026-01-05T00:30:00+01:00;1200').buffer
    expect(looksLikeXlsx(junk)).toBe(false)
    expect(looksLikeXlsx(enedisDailyXlsx())).toBe(true)
    await expect(readXlsx(junk)).rejects.toBeInstanceOf(XlsxError)
  })
})
