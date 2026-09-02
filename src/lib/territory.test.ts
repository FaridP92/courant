import { describe, expect, it } from 'vitest'
import {
  FRANCE,
  FRANCE_REF,
  parseTerritoryRef,
  resolveTerritory,
  territoryKey,
  territoryLabel,
} from './territory.ts'

const regions = [
  { code: '11', name: 'Île-de-France' },
  { code: '84', name: 'Auvergne-Rhône-Alpes' },
]
const metropoles = [{ code: '200046977', name: 'Métropole de Lyon' }]

describe('territoryKey', () => {
  it('donne une clé stable, utilisable telle quelle dans une URL', () => {
    expect(territoryKey(FRANCE)).toBe('france')
    expect(territoryKey({ kind: 'region', code: '84' })).toBe('region:84')
    expect(territoryKey({ kind: 'metropole', code: '200046977', name: 'Lyon' })).toBe(
      'metropole:200046977',
    )
  })
})

describe('parseTerritoryRef', () => {
  it('relit les clés produites par territoryKey', () => {
    expect(parseTerritoryRef('france')).toEqual(FRANCE_REF)
    expect(parseTerritoryRef('region:84')).toEqual({ kind: 'region', code: '84' })
    expect(parseTerritoryRef('metropole:200046977')).toEqual({
      kind: 'metropole',
      code: '200046977',
    })
  })

  it('refuse ce qui ne ressemble pas à un code de territoire', () => {
    for (const value of [
      '',
      'region',
      'region:',
      'departement:75',
      'region:84;drop',
      'region:../../etc',
      `region:${'9'.repeat(40)}`,
    ]) {
      expect(parseTerritoryRef(value)).toBeNull()
    }
  })
})

describe('resolveTerritory', () => {
  it('retrouve le libellé humain du territoire', () => {
    expect(resolveTerritory({ kind: 'region', code: '84' }, regions, metropoles)).toEqual({
      kind: 'region',
      code: '84',
      name: 'Auvergne-Rhône-Alpes',
    })
    expect(resolveTerritory({ kind: 'metropole', code: '200046977' }, regions, metropoles)).toEqual(
      {
        kind: 'metropole',
        code: '200046977',
        name: 'Métropole de Lyon',
      },
    )
    expect(resolveTerritory(FRANCE_REF, regions, metropoles)).toEqual(FRANCE)
  })

  it('garde le territoire demandé quand les libellés ne sont pas encore chargés', () => {
    const pending = resolveTerritory({ kind: 'region', code: '84' }, [], [])

    // le code reste : la série se charge, seul le libellé attend
    expect(pending).toEqual({ kind: 'region', code: '84', name: '' })
    expect(territoryLabel(pending)).toBe('Région 84')
  })
})

describe('territoryLabel', () => {
  it('nomme le territoire, avec un repli honnête sur son code', () => {
    expect(territoryLabel(FRANCE)).toBe('France entière')
    expect(territoryLabel({ kind: 'region', code: '11', name: 'Île-de-France' })).toBe(
      'Île-de-France',
    )
    expect(territoryLabel({ kind: 'metropole', code: '200046977', name: '' })).toBe(
      'Métropole 200046977',
    )
  })
})
