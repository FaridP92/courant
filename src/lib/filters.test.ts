import { describe, expect, it } from 'vitest'
import type { NationalPoint } from './api.ts'
import { FRANCE_REF } from './territory.ts'
import {
  applyFilters,
  DEFAULT_FILTERS,
  isDefaultFilters,
  parseFilters,
  serializeFilters,
  toggleWithFloor,
  type Filters,
} from './filters.ts'

const point = (ts: string, maturity: NationalPoint['maturity'], consommation: number) =>
  ({
    ts,
    maturity,
    consommation,
    prevision_j1: consommation - 1000,
    prevision_j: consommation - 400,
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
  }) satisfies NationalPoint

describe('parseFilters', () => {
  it('sans paramètre, rend les filtres par défaut', () => {
    expect(parseFilters('')).toEqual(DEFAULT_FILTERS)
    expect(parseFilters('?')).toEqual(DEFAULT_FILTERS)
  })

  it('lit le territoire demandé', () => {
    expect(parseFilters('?territory=region:84').territory).toEqual({ kind: 'region', code: '84' })
    expect(parseFilters('?territory=metropole:200046977').territory).toEqual({
      kind: 'metropole',
      code: '200046977',
    })
  })

  it('un territoire illisible retombe sur la France, sans lever', () => {
    expect(parseFilters('?territory=departement:75').territory).toEqual(FRANCE_REF)
    expect(parseFilters('?territory=').territory).toEqual(FRANCE_REF)
  })

  it('lit la métrique de la carte, et ignore une métrique inconnue', () => {
    expect(parseFilters('?map=autonomie').mapMetric).toBe('autonomie')
    expect(parseFilters('?map=densite').mapMetric).toBe('consommation')
  })

  it('lit la période, les filières et la maturité', () => {
    const filters = parseFilters('?range=7d&fuels=nucleaire,eolien&maturity=C,D')

    expect(filters.range).toBe('7d')
    expect([...filters.fuels]).toEqual(['nucleaire', 'eolien'])
    expect([...filters.maturity]).toEqual(['C', 'D'])
  })

  it("accepte une chaîne sans point d'interrogation", () => {
    expect(parseFilters('range=30d').range).toBe('30d')
  })

  it('ignore les valeurs inconnues sans jamais lever', () => {
    const filters = parseFilters('?range=1an&fuels=nucleaire,uranium&maturity=Z&inconnu=1')

    expect(filters.range).toBe('24h')
    expect([...filters.fuels]).toEqual(['nucleaire'])
    // une maturité entièrement inconnue vaut aucun filtre, pas une série vide
    expect([...filters.maturity]).toEqual([...DEFAULT_FILTERS.maturity])
  })

  it('un ensemble vide retombe sur le défaut : jamais un tableau de bord muet', () => {
    expect([...parseFilters('?fuels=').fuels]).toEqual([...DEFAULT_FILTERS.fuels])
    expect([...parseFilters('?maturity=').maturity]).toEqual([...DEFAULT_FILTERS.maturity])
  })
})

describe('serializeFilters', () => {
  it("n'écrit rien quand les filtres valent le défaut", () => {
    expect(serializeFilters(DEFAULT_FILTERS)).toBe('')
    expect(isDefaultFilters(DEFAULT_FILTERS)).toBe(true)
  })

  it("n'écrit que ce qui s'écarte du défaut, sans échappement inutile", () => {
    const filters: Filters = {
      ...DEFAULT_FILTERS,
      range: '7d',
      fuels: new Set(['eolien', 'nucleaire']),
    }

    // ordre d'empilement des filières, pas ordre d'insertion : l'URL reste stable
    expect(serializeFilters(filters)).toBe('range=7d&fuels=nucleaire,eolien')
    expect(isDefaultFilters(filters)).toBe(false)
  })

  it('écrit la métrique de la carte quand elle quitte la consommation', () => {
    expect(serializeFilters({ ...DEFAULT_FILTERS, mapMetric: 'echanges' })).toBe('map=echanges')
    expect(serializeFilters({ ...DEFAULT_FILTERS, mapMetric: 'consommation' })).toBe('')
  })

  it('écrit le territoire quand il quitte la France entière', () => {
    expect(
      serializeFilters({ ...DEFAULT_FILTERS, territory: { kind: 'region', code: '84' } }),
    ).toBe('territory=region:84')
    expect(serializeFilters({ ...DEFAULT_FILTERS, territory: FRANCE_REF })).toBe('')
  })

  it("fait l'aller-retour sans perte", () => {
    const filters: Filters = {
      range: '30d',
      territory: { kind: 'metropole', code: '200046977' },
      mapMetric: 'renouvelables',
      fuels: new Set(['nucleaire', 'solaire']),
      maturity: new Set(['R']),
    }

    expect(parseFilters(`?${serializeFilters(filters)}`)).toEqual(filters)
  })
})

describe('toggleWithFloor', () => {
  it('ajoute et retire une valeur', () => {
    expect([...toggleWithFloor(new Set(['R', 'C']), 'C')]).toEqual(['R'])
    expect([...toggleWithFloor(new Set(['R']), 'C')]).toEqual(['R', 'C'])
  })

  it('refuse de retirer la dernière valeur : une vue reste toujours affichée', () => {
    const last = new Set(['R'])

    expect(toggleWithFloor(last, 'R')).toBe(last)
  })
})

describe('applyFilters', () => {
  const points: NationalPoint[] = [
    point('2026-01-15T17:30:00+00:00', 'D', 60100),
    point('2026-01-15T17:45:00+00:00', 'C', 60800),
    point('2026-01-15T18:00:00+00:00', 'R', 61200),
  ]

  it('sans filtre de maturité, rend la série intacte', () => {
    const filtered = applyFilters(points, DEFAULT_FILTERS)

    expect(filtered.points).toEqual(points)
    expect(filtered.kept).toBe(3)
    expect(filtered.total).toBe(3)
  })

  it('masque les points écartés au lieu de les supprimer : le trou reste un trou', () => {
    const filtered = applyFilters(points, { ...DEFAULT_FILTERS, maturity: new Set(['R']) })

    // même longueur, même axe du temps : aucune continuité inventée entre 17:30 et 18:00
    expect(filtered.points).toHaveLength(3)
    expect(filtered.points.map((p) => p.ts)).toEqual(points.map((p) => p.ts))
    expect(filtered.points[0]?.consommation).toBeNull()
    expect(filtered.points[0]?.taux_co2).toBeNull()
    expect(filtered.points[0]?.maturity).toBe('D')
    expect(filtered.points[2]?.consommation).toBe(61200)
    expect(filtered.kept).toBe(1)
    expect(filtered.total).toBe(3)
  })

  it("ne compte comme retenu qu'un point qui porte vraiment une mesure", () => {
    const withGap: NationalPoint[] = [
      ...points,
      { ...point('2026-01-15T18:15:00+00:00', 'R', 0), consommation: null },
    ]

    expect(applyFilters(withGap, DEFAULT_FILTERS).kept).toBe(3)
    expect(applyFilters(withGap, DEFAULT_FILTERS).total).toBe(4)
  })

  it('une série vide reste vide, sans exception', () => {
    expect(applyFilters([], DEFAULT_FILTERS)).toEqual({ points: [], kept: 0, total: 0 })
  })
})
