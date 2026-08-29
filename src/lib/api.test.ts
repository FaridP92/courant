import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchEcowatt,
  fetchMetropoles6h,
  fetchMetropoleSeries,
  fetchNationalLatest,
  fetchNationalRange,
  fetchRegionalSeries,
} from './api.ts'
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config.ts'

const latestRow = {
  ts: '2026-01-15T22:30:00+00:00',
  maturity: 'C',
  consommation: 60873,
  prevision_j1: 60700,
  prevision_j: 60100,
  nucleaire: 49765,
  hydraulique: 5465,
  pompage: -2642,
  eolien: 16814,
  solaire: 0,
  gaz: 2886,
  fioul: 68,
  charbon: 409,
  bioenergies: 1225,
  ech_physiques: -13007,
  taux_co2: 25,
  updated_at: '2026-08-28T21:55:33+00:00',
}

function stubFetch(payload: unknown, ok = true) {
  const stub = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(payload),
  })
  vi.stubGlobal('fetch', stub)
  return stub
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchNationalLatest', () => {
  it('interroge la vue publique avec la clé publishable et renvoie la ligne', async () => {
    const stub = stubFetch([latestRow])
    const latest = await fetchNationalLatest()
    expect(latest).toEqual(latestRow)
    const [url, init] = stub.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${SUPABASE_URL}/rest/v1/v_national_latest?select=*`)
    expect(new Headers(init.headers).get('apikey')).toBe(SUPABASE_PUBLISHABLE_KEY)
  })

  it('renvoie null quand la vue est vide : à l’UI d’afficher l’indisponibilité, jamais des zéros', async () => {
    stubFetch([])
    expect(await fetchNationalLatest()).toBeNull()
  })

  it('propage une erreur HTTP au lieu de la masquer', async () => {
    stubFetch({ message: 'oops' }, false)
    await expect(fetchNationalLatest()).rejects.toThrow(/500/)
  })
})

describe('fetchNationalRange', () => {
  it('demande la série ordonnée par ts croissant', async () => {
    const stub = stubFetch([latestRow])
    const points = await fetchNationalRange('24h')
    expect(points).toHaveLength(1)
    const [url] = stub.mock.calls[0] as [string]
    expect(url).toBe(`${SUPABASE_URL}/rest/v1/v_national_24h?select=*&order=ts.asc&limit=200`)
  })
})

describe('fetchRegionalSeries et fetchMetropoleSeries', () => {
  it('filtre par territoire, trie en descendant côté serveur et remet la série à l endroit', async () => {
    const stub = stubFetch([
      { ts: '2026-08-29T18:00:00+00:00' },
      { ts: '2026-08-29T17:00:00+00:00' },
    ])
    const regional = await fetchRegionalSeries('84', '7d')
    await fetchMetropoleSeries('200046977')
    const [url1] = stub.mock.calls[0] as [string]
    const [url2] = stub.mock.calls[1] as [string]
    expect(url1).toBe(
      `${SUPABASE_URL}/rest/v1/v_regional_7d?select=*&region_code=eq.84&order=ts.desc&limit=1000`,
    )
    expect(url2).toBe(
      `${SUPABASE_URL}/rest/v1/v_metropoles_7d?select=*&epci_code=eq.200046977&order=ts.desc&limit=1000`,
    )
    // une troncature au plafond perdrait les points anciens, jamais les récents
    expect(regional.map((p) => p.ts)).toEqual([
      '2026-08-29T17:00:00+00:00',
      '2026-08-29T18:00:00+00:00',
    ])
  })
})

describe('fetchEcowatt', () => {
  it('écarte les jours au dvalue hors contrat plutôt que de laisser passer une tuile vide', async () => {
    const valid = { day: '2026-08-29', dvalue: 2, message: 'x', generated_at: 'g', hours: [] }
    stubFetch([{ ...valid, day: '2026-08-28', dvalue: 7 }, valid])
    const days = await fetchEcowatt()
    expect(days).toHaveLength(1)
    expect(days[0]?.dvalue).toBe(2)
  })
})

describe('fetchMetropoles6h', () => {
  it("impose l'ordre chronologique côté requête : le front ne dépend pas de l'ordre interne de la vue", async () => {
    const stub = stubFetch([])
    await fetchMetropoles6h()
    const [url] = stub.mock.calls[0] as [string]
    expect(url).toBe(`${SUPABASE_URL}/rest/v1/v_metropoles_6h?select=*&order=ts.asc&limit=1000`)
  })
})
