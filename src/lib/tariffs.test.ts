import { describe, expect, it } from 'vitest'
import type { TrvTariff } from './api.ts'
import {
  computeBase,
  computeHphc,
  computeTempo,
  isInOffPeak,
  splitByTempo,
  type OffPeakWindow,
} from './tariffs.ts'

const trv = (option: TrvTariff['option'], prices: Record<string, number>): TrvTariff => ({
  option,
  p_souscrite: 6,
  date_debut: '2026-08-01',
  fixed_ht: 170.88,
  fixed_ttc: 229.68,
  prices_ht: prices,
  prices_ttc: prices,
  source_url: 'https://www.cre.fr/x.csv',
  updated_at: '2026-09-01T00:00:00Z',
})

describe('computeBase', () => {
  it('abonnement annuel + kWh × prix, en TTC, arrondi au centime', () => {
    const result = computeBase(4500, trv('BASE', { base: 0.1985 }))
    expect(result).toEqual({ subscription: 229.68, energy: 893.25, total: 1122.93 })
  })
})

describe('computeHphc', () => {
  it('sépare heures pleines et heures creuses', () => {
    const result = computeHphc({ hp: 3000, hc: 1500 }, trv('HPHC', { hp: 0.2081, hc: 0.1635 }))
    const energy = 3000 * 0.2081 + 1500 * 0.1635
    expect(result?.energy).toBeCloseTo(energy, 2)
    expect(result?.total).toBeCloseTo(229.68 + energy, 2)
  })
})

describe('isInOffPeak', () => {
  const windows: OffPeakWindow[] = [{ from: 22, to: 6 }]
  it('gère une plage qui traverse minuit', () => {
    expect(isInOffPeak(23, windows)).toBe(true)
    expect(isInOffPeak(2, windows)).toBe(true)
    expect(isInOffPeak(6, windows)).toBe(false)
    expect(isInOffPeak(12, windows)).toBe(false)
  })
  it('gère plusieurs plages dont une en journée', () => {
    const two: OffPeakWindow[] = [
      { from: 2, to: 7 },
      { from: 13, to: 16 },
    ]
    expect(isInOffPeak(14, two)).toBe(true)
    expect(isInOffPeak(1, two)).toBe(false)
  })
})

describe('splitByTempo', () => {
  it('répartit les kWh par couleur du jour et heures creuses, jour par jour', () => {
    const readings = [
      // lundi bleu : 1 kWh en HP (12 h), 2 kWh en HC (23 h)
      { ts: '2026-01-05T12:00:00+01:00', kwh: 1 },
      { ts: '2026-01-05T23:00:00+01:00', kwh: 2 },
      // mardi rouge : 3 kWh en HP
      { ts: '2026-01-06T18:00:00+01:00', kwh: 3 },
    ]
    const calendar = new Map([
      ['2026-01-05', 'BLUE' as const],
      ['2026-01-06', 'RED' as const],
    ])
    const split = splitByTempo(readings, calendar, [{ from: 22, to: 6 }])
    expect(split.buckets).toEqual({
      hp_bleu: 1,
      hc_bleu: 2,
      hp_blanc: 0,
      hc_blanc: 0,
      hp_rouge: 3,
      hc_rouge: 0,
    })
    expect(split.uncoveredKwh).toBe(0)
  })

  it('compte à part les kWh des jours sans couleur connue, sans les inventer', () => {
    const split = splitByTempo([{ ts: '2026-01-07T12:00:00+01:00', kwh: 5 }], new Map(), [
      { from: 22, to: 6 },
    ])
    expect(split.uncoveredKwh).toBe(5)
    expect(Object.values(split.buckets).every((v) => v === 0)).toBe(true)
  })

  it("lit l'heure en heure de Paris, pas en UTC", () => {
    // 23 h UTC = 0 h Paris le lendemain (heure d'hiver) : le jour et la plage HC changent
    const split = splitByTempo(
      [{ ts: '2026-01-05T23:30:00Z', kwh: 1 }],
      new Map([['2026-01-06', 'WHITE' as const]]),
      [{ from: 22, to: 6 }],
    )
    expect(split.buckets.hc_blanc).toBe(1)
  })
})

describe('computeTempo', () => {
  it('applique les six prix aux six paniers', () => {
    const prices = {
      hp_bleu: 0.1609,
      hc_bleu: 0.1296,
      hp_blanc: 0.1894,
      hc_blanc: 0.1486,
      hp_rouge: 0.7562,
      hc_rouge: 0.1568,
    }
    const result = computeTempo(
      { hp_bleu: 1000, hc_bleu: 500, hp_blanc: 200, hc_blanc: 100, hp_rouge: 50, hc_rouge: 20 },
      trv('TEMPO', prices),
    )
    const expected =
      1000 * 0.1609 + 500 * 0.1296 + 200 * 0.1894 + 100 * 0.1486 + 50 * 0.7562 + 20 * 0.1568
    expect(result?.energy).toBeCloseTo(expected, 2)
    expect(result?.total).toBeCloseTo(229.68 + expected, 2)
  })

  it('refuse un tarif dont il manque un prix : null plutôt qu un total faux', () => {
    expect(
      computeTempo(
        { hp_bleu: 1, hc_bleu: 1, hp_blanc: 1, hc_blanc: 1, hp_rouge: 1, hc_rouge: 1 },
        trv('TEMPO', { hp_bleu: 0.16 }),
      ),
    ).toBeNull()
  })
})
