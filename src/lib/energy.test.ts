import { describe, expect, it } from 'vitest'
import { exchangeBalanceMw, nuclearShare, productionTotalMw, renewablesShare } from './energy.ts'
import type { NationalPoint } from './api.ts'

const point: NationalPoint = {
  ts: '2026-01-15T18:00:00+00:00',
  maturity: 'C',
  consommation: 68828,
  prevision_j1: 68300,
  prevision_j: 68900,
  nucleaire: 49930,
  hydraulique: 9000,
  pompage: -1200,
  eolien: 17397,
  solaire: 0,
  gaz: 3000,
  fioul: 70,
  charbon: 400,
  bioenergies: 1200,
  ech_physiques: -13007,
  taux_co2: 36,
}

describe('productionTotalMw', () => {
  it('somme les huit filières de production, pompage exclu', () => {
    // 49930 + 9000 + 17397 + 0 + 3000 + 70 + 400 + 1200 (le pompage est un usage, pas une production)
    expect(productionTotalMw(point)).toBe(80997)
  })

  it('renvoie null si une filière manque : pas de total partiel présenté comme exact', () => {
    expect(productionTotalMw({ ...point, charbon: null })).toBeNull()
  })
})

describe('parts du mix', () => {
  it('part du nucléaire dans la production', () => {
    expect(nuclearShare(point)).toBeCloseTo(49930 / 80997, 5)
  })

  it('part des renouvelables : hydraulique + éolien + solaire + bioénergies', () => {
    expect(renewablesShare(point)).toBeCloseTo((9000 + 17397 + 0 + 1200) / 80997, 5)
  })

  it('null en cascade quand la télémétrie est incomplète (jamais de part faussée)', () => {
    expect(nuclearShare({ ...point, solaire: null })).toBeNull()
    expect(renewablesShare({ ...point, fioul: null })).toBeNull()
  })
})

describe('exchangeBalanceMw', () => {
  it('convention ODRÉ : ech_physiques négatif = la France exporte, on renvoie le solde export-positif', () => {
    expect(exchangeBalanceMw(point)).toBe(13007)
    expect(exchangeBalanceMw({ ...point, ech_physiques: 2500 })).toBe(-2500)
  })

  it('null si les échanges sont absents : jamais "+0,0 GW" inventé', () => {
    expect(exchangeBalanceMw({ ...point, ech_physiques: null })).toBeNull()
  })
})
