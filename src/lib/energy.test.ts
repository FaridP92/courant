import { describe, expect, it } from 'vitest'
import {
  exchangeBalanceMw,
  forecastDeviation,
  nationalAutonomy,
  nuclearShare,
  productionTotalMw,
  regionalAutonomy,
  regionalProductionTotalMw,
  regionalRenewableShare,
  renewablesShare,
} from './energy.ts'
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

describe('sélecteurs régionaux', () => {
  const region = {
    consommation: 5000,
    thermique: 200,
    nucleaire: 3000,
    eolien: 400,
    solaire: 100,
    hydraulique: 800,
    bioenergies: 100,
  }

  it('regionalProductionTotalMw somme les six filières, null si une manque', () => {
    expect(regionalProductionTotalMw(region)).toBe(4600)
    expect(regionalProductionTotalMw({ ...region, thermique: null })).toBeNull()
  })

  it("regionalRenewableShare rapporte l'hydraulique, l'éolien, le solaire et les bioénergies au total", () => {
    // (800 + 400 + 100 + 100) / 4600
    expect(regionalRenewableShare(region)).toBeCloseTo(1400 / 4600)
    expect(regionalRenewableShare({ ...region, eolien: null })).toBeNull()
  })

  it('regionalAutonomy rapporte la production à la consommation, null-honnête', () => {
    expect(regionalAutonomy(region)).toBeCloseTo(4600 / 5000)
    expect(regionalAutonomy({ ...region, consommation: null })).toBeNull()
    expect(regionalAutonomy({ ...region, consommation: 0 })).toBeNull()
  })

  it('une région peut produire plus qu elle ne consomme : la fraction dépasse 1', () => {
    expect(regionalAutonomy({ ...region, consommation: 2300 })).toBeCloseTo(2)
  })
})

describe('nationalAutonomy', () => {
  it('rapporte la production totale à la consommation, null si conso non positive', () => {
    const point = {
      consommation: 50000,
      nucleaire: 30000,
      hydraulique: 8000,
      eolien: 6000,
      solaire: 4000,
      gaz: 1000,
      fioul: 0,
      charbon: 0,
      bioenergies: 1000,
    } as unknown as NationalPoint & { consommation: number }
    expect(nationalAutonomy(point)).toBeCloseTo(1)
    expect(nationalAutonomy({ ...point, consommation: 0 })).toBeNull()
  })
})

describe('forecastDeviation', () => {
  it("mesure l'écart au J-1 en valeur absolue, quel qu'en soit le sens", () => {
    // 68828 réalisés pour 65000 prévus : 5,9 % au-dessus
    expect(forecastDeviation({ ...point, prevision_j1: 65000 })).toBeCloseTo(0.0589, 4)
    // sous-consommation : l'écart reste positif, c'est son ampleur qui compte
    expect(forecastDeviation({ ...point, consommation: 60000, prevision_j1: 65000 })).toBeCloseTo(
      0.0769,
      4,
    )
  })

  it('rend null quand la comparaison est impossible, jamais zéro', () => {
    expect(forecastDeviation({ ...point, prevision_j1: null })).toBeNull()
    expect(forecastDeviation({ ...point, consommation: null })).toBeNull()
    expect(forecastDeviation({ ...point, prevision_j1: 0 })).toBeNull()
  })
})
