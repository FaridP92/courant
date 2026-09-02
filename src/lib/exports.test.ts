import { describe, expect, it } from 'vitest'
import type { NationalPoint, RegionalLatest, RegionalPoint } from './api.ts'
import {
  mapExportRows,
  nationalExportRows,
  regionalExportRows,
  territoryExportRows,
} from './exports.ts'

const nationalPoint = (overrides: Partial<NationalPoint> = {}): NationalPoint => ({
  ts: '2026-01-15T18:00:00+00:00',
  maturity: 'C',
  consommation: 61200,
  prevision_j1: 58800,
  prevision_j: 60900,
  nucleaire: 42000,
  hydraulique: 8000,
  pompage: -500,
  eolien: 6000,
  solaire: 1000,
  gaz: 2500,
  fioul: 100,
  charbon: 200,
  bioenergies: 1100,
  ech_physiques: -1900,
  taux_co2: 32,
  ...overrides,
})

const regionalLatest = (overrides: Partial<RegionalLatest> = {}): RegionalLatest => ({
  region_code: '84',
  region_name: 'Auvergne-Rhône-Alpes',
  ts: '2026-01-15T18:00:00+00:00',
  maturity: 'R',
  consommation: 6000,
  thermique: 100,
  nucleaire: 3000,
  eolien: 400,
  solaire: 100,
  hydraulique: 300,
  pompage: -50,
  bioenergies: 60,
  ech_physiques: -500,
  ...overrides,
})

describe('nationalExportRows', () => {
  it('emporte la maturité : le fichier explique de lui-même ce que le filtre a écarté', () => {
    const rows = nationalExportRows([nationalPoint()])

    expect(rows[0]?.maturite).toBe('C')
    expect(rows[0]?.consommation_mw).toBe(61200)
  })

  it('un point masqué par un critère sort vide, jamais à zéro', () => {
    const rows = nationalExportRows([nationalPoint({ consommation: null, taux_co2: null })])

    expect(rows[0]?.consommation_mw).toBeNull()
    expect(rows[0]?.taux_co2_g_kwh).toBeNull()
    // l'horodatage et la maturité restent lisibles : la ligne dit pourquoi elle est vide
    expect(rows[0]?.ts).toBe('2026-01-15T18:00:00+00:00')
    expect(rows[0]?.maturite).toBe('C')
  })
})

describe('regionalExportRows', () => {
  it('nomme le territoire de chaque ligne', () => {
    const point: RegionalPoint = {
      region_code: '84',
      region_name: 'Auvergne-Rhône-Alpes',
      ts: '2026-01-15T18:00:00+00:00',
      consommation: 5200,
      thermique: 200,
      nucleaire: 3000,
      eolien: 400,
      solaire: 100,
      hydraulique: 800,
      pompage: -50,
      bioenergies: 100,
      ech_physiques: 600,
    }

    expect(regionalExportRows([point])[0]).toMatchObject({
      territoire: 'Auvergne-Rhône-Alpes',
      consommation_mw: 5200,
    })
  })
})

describe('territoryExportRows', () => {
  it('nomme le territoire même quand la série ne porte que la consommation', () => {
    const rows = territoryExportRows(
      [{ ts: '2026-01-15T18:00:00+00:00', consommation: 900 }],
      'Métropole de Lyon',
    )

    expect(rows[0]).toEqual({
      territoire: 'Métropole de Lyon',
      ts: '2026-01-15T18:00:00+00:00',
      consommation_mw: 900,
    })
  })
})

describe('mapExportRows', () => {
  it('ajoute les grandeurs dérivées que la carte sait afficher', () => {
    const rows = mapExportRows([regionalLatest()])

    // production 3960 sur 6000 consommés : autonomie 66 %, renouvelables 860 / 3960 = 22 %
    expect(rows[0]?.autonomie_pct).toBe(66)
    expect(rows[0]?.part_renouvelable_pct).toBe(22)
    expect(rows[0]?.solde_export_mw).toBe(500)
  })

  it('laisse vide une grandeur incalculable, jamais un zéro', () => {
    const rows = mapExportRows([regionalLatest({ eolien: null })])

    expect(rows[0]?.part_renouvelable_pct).toBeNull()
    expect(rows[0]?.autonomie_pct).toBeNull()
    expect(rows[0]?.consommation_mw).toBe(6000)
  })
})
