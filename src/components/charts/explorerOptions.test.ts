import { describe, expect, it } from 'vitest'
import type { RegionalPoint } from '../../lib/api.ts'
import {
  buildRegionalMixOption,
  buildTerritoryConsoOption,
  REGIONAL_FUELS,
} from './explorerOptions.ts'

const regionalPoint = (ts: string, overrides: Partial<RegionalPoint> = {}): RegionalPoint => ({
  region_code: '84',
  region_name: 'Auvergne-Rhône-Alpes',
  ts,
  consommation: 5000,
  thermique: 200,
  nucleaire: 3000,
  eolien: 400,
  solaire: 100,
  hydraulique: 800,
  pompage: -50,
  bioenergies: 100,
  ech_physiques: -600,
  ...overrides,
})

describe('buildTerritoryConsoOption', () => {
  it('trace la consommation sans jamais relier les trous', () => {
    const option = buildTerritoryConsoOption([
      { ts: '2026-08-29T10:00:00+00:00', consommation: 5000 },
      { ts: '2026-08-29T10:30:00+00:00', consommation: null },
      { ts: '2026-08-29T11:00:00+00:00', consommation: 5200 },
    ])
    const series = option.series[0]
    expect(series?.connectNulls).toBe(false)
    expect(series?.data).toEqual([
      [Date.parse('2026-08-29T10:00:00+00:00'), 5000],
      [Date.parse('2026-08-29T10:30:00+00:00'), null],
      [Date.parse('2026-08-29T11:00:00+00:00'), 5200],
    ])
  })
})

describe('buildRegionalMixOption', () => {
  it('empile les six filières régionales dans un ordre stable, couleurs de la palette', () => {
    const option = buildRegionalMixOption([regionalPoint('2026-08-29T10:00:00+00:00')])
    expect(option.series.map((s) => s.name)).toEqual(REGIONAL_FUELS.map((f) => f.label))
    for (const series of option.series) {
      expect(series.stack).toBe('mix')
      expect(series.connectNulls).toBe(false)
    }
  })

  it('le pompage (stockage, négatif) ne fait pas partie du mix empilé', () => {
    expect(REGIONAL_FUELS.map((f): string => f.key)).not.toContain('pompage')
  })
})
