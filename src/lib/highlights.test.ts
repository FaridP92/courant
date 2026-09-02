import { describe, expect, it } from 'vitest'
import type { NationalPoint } from './api.ts'
import { heroHighlights, highlightSummary } from './highlights.ts'

const point = (ts: string, overrides: Partial<NationalPoint> = {}): NationalPoint => ({
  ts,
  maturity: 'R',
  consommation: 60000,
  prevision_j1: 60000,
  prevision_j: 60000,
  nucleaire: 42000,
  hydraulique: 8000,
  pompage: -500,
  eolien: 6000,
  solaire: 1000,
  gaz: 2500,
  fioul: 100,
  charbon: 200,
  bioenergies: 1100,
  ech_physiques: -900,
  taux_co2: 30,
  ...overrides,
})

const series: NationalPoint[] = [
  point('2026-01-15T10:00:00+00:00'),
  // 6 % au-dessus du programme, et 62 g/kWh
  point('2026-01-15T10:15:00+00:00', { consommation: 63600, taux_co2: 62 }),
  point('2026-01-15T10:30:00+00:00', { consommation: 66000, taux_co2: 71 }),
  point('2026-01-15T10:45:00+00:00'),
]

describe('heroHighlights', () => {
  it('sans seuil, aucune mise en évidence', () => {
    expect(heroHighlights(series, { co2: null, deviation: null })).toEqual({
      co2: [],
      deviation: [],
    })
  })

  it('calcule les deux grandeurs indépendamment', () => {
    const highlights = heroHighlights(series, { co2: 50, deviation: 0.05 })

    expect(highlights.co2).toHaveLength(1)
    expect(highlightSummary(highlights.co2)).toEqual({ steps: 2, peak: 71 })
    // 6 % puis 10 % d'écart : deux pas au-dessus du seuil de 5 %
    expect(highlightSummary(highlights.deviation).steps).toBe(2)
    expect(highlightSummary(highlights.deviation).peak).toBeCloseTo(0.1, 4)
  })

  it("un seuil posé sur une grandeur laisse l'autre intacte", () => {
    const highlights = heroHighlights(series, { co2: 50, deviation: null })

    expect(highlights.co2).toHaveLength(1)
    expect(highlights.deviation).toEqual([])
  })

  it('une série sans prévision ne produit aucun écart, jamais un écart nul', () => {
    const withoutForecast = series.map((p) => ({ ...p, prevision_j1: null }))

    expect(heroHighlights(withoutForecast, { co2: null, deviation: 0.02 }).deviation).toEqual([])
  })
})

describe('highlightSummary', () => {
  it('résume des plages absentes sans lever', () => {
    expect(highlightSummary([])).toEqual({ steps: 0, peak: 0 })
  })
})
