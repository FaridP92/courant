import { describe, expect, it } from 'vitest'
import { parseEnedisCsv } from './enedisCsv.ts'

const CURVE_30MIN = [
  'Identifiant PRM;12345678901234;Type de donnees;Courbe de charge;',
  'horodate ISO fin de pas;puissance moyenne (W)',
  '2026-01-05T00:30:00+01:00;1200',
  '2026-01-05T01:00:00+01:00;800',
  '2026-01-05T01:30:00+01:00;600',
].join('\r\n')

describe('parseEnedisCsv', () => {
  it('lit la courbe de charge 30 min : puissance moyenne (W) → kWh, horodatée au début du pas', () => {
    const outcome = parseEnedisCsv(CURVE_30MIN)
    if (!outcome.ok) throw new Error(outcome.reason)
    expect(outcome.result.kind).toBe('curve')
    expect(outcome.result.stepMinutes).toBe(30)
    // 1200 W pendant 30 min = 0,6 kWh, sur le pas qui COMMENCE à 00:00
    expect(outcome.result.readings[0]).toEqual({ ts: '2026-01-04T23:00:00.000Z', kwh: 0.6 })
    expect(outcome.result.readings).toHaveLength(3)
    expect(outcome.result.totalKwh).toBeCloseTo(0.6 + 0.4 + 0.3, 6)
    expect(outcome.result.skippedRows).toBe(0)
    expect(outcome.result.from).toBe('2026-01-04T23:00:00.000Z')
  })

  it('tolère les décimales françaises et ignore les lignes vides ou malformées en les comptant', () => {
    const text = [
      'horodate ISO fin de pas;puissance moyenne (W)',
      '2026-01-05T00:30:00+01:00;1200,5',
      '',
      'pas une ligne',
      '2026-01-05T01:00:00+01:00;',
      '2026-01-05T01:30:00+01:00;600',
    ].join('\n')
    const outcome = parseEnedisCsv(text)
    if (!outcome.ok) throw new Error(outcome.reason)
    expect(outcome.result.readings).toHaveLength(2)
    expect(outcome.result.skippedRows).toBe(2)
    expect(outcome.result.readings[0]?.kwh).toBeCloseTo(0.60025, 6)
  })

  it("refuse un fichier dont l'unité est inconnue plutôt que de deviner", () => {
    const outcome = parseEnedisCsv('Horodate;Valeur\n2026-01-05T00:00:00+01:00;12345')
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.reason).toMatch(/courbe de charge/)
  })

  it('refuse un fichier vide ou sans en-tête reconnu', () => {
    expect(parseEnedisCsv('').ok).toBe(false)
    expect(parseEnedisCsv('a;b;c\n1;2;3').ok).toBe(false)
  })

  it("refuse une courbe d'un seul point : impossible de connaître le pas", () => {
    const outcome = parseEnedisCsv(
      'horodate ISO fin de pas;puissance moyenne (W)\n2026-01-05T00:30:00+01:00;1200',
    )
    expect(outcome.ok).toBe(false)
  })
})
