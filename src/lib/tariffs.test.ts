import { describe, expect, it } from 'vitest'
import type { TrvTariff } from './api.ts'
import {
  calendarDaysInclusive,
  computeBase,
  computeHphc,
  computeTempo,
  coveredDays,
  rangeHphc,
  rangeTempoDaily,
  isInOffPeak,
  isValidWindow,
  minutesOfDay,
  parisParts,
  splitByTempo,
  splitHphc,
  yearLengthFor,
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

const NIGHT: OffPeakWindow[] = [{ from: 22 * 60, to: 6 * 60 }]

describe('computeBase', () => {
  it('abonnement annuel + kWh × prix, en TTC, arrondi au centime', () => {
    const result = computeBase(4500, trv('BASE', { base: 0.1985 }))
    expect(result).toEqual({ subscription: 229.68, energy: 893.25, total: 1122.93 })
  })

  it('les trois colonnes affichées s additionnent toujours', () => {
    const result = computeBase(1000, { ...trv('BASE', { base: 1.009334 }), fixed_ttc: 202.054 })
    expect(result).toEqual({ subscription: 202.05, energy: 1009.33, total: 1211.38 })
  })

  it('refuse un prix absent ou nul plutôt que de facturer 0 €', () => {
    expect(computeBase(4500, trv('BASE', {}))).toBeNull()
    const withNull = trv('BASE', {})
    withNull.prices_ttc = { base: null } as unknown as Record<string, number>
    expect(computeBase(4500, withNull)).toBeNull()
  })
})

describe('computeHphc', () => {
  it('sépare heures pleines et heures creuses', () => {
    const result = computeHphc({ hp: 3000, hc: 1500 }, trv('HPHC', { hp: 0.2081, hc: 0.1635 }))
    const energy = 3000 * 0.2081 + 1500 * 0.1635
    expect(result?.energy).toBeCloseTo(energy, 2)
    expect(result?.total).toBeCloseTo(229.68 + energy, 2)
  })

  it('refuse une grille sans prix heures creuses', () => {
    expect(computeHphc({ hp: 1, hc: 1 }, trv('HPHC', { hp: 0.2 }))).toBeNull()
  })
})

describe('plages heures creuses', () => {
  it('lit « HH:MM » en minutes et refuse le reste', () => {
    expect(minutesOfDay('22:00')).toBe(1320)
    expect(minutesOfDay('6:30')).toBe(390)
    expect(minutesOfDay('24:00')).toBeNull()
    expect(minutesOfDay('')).toBeNull()
  })

  it('une plage vide (début = fin) n est pas valide', () => {
    expect(isValidWindow({ from: 360, to: 360 })).toBe(false)
    expect(isValidWindow({ from: 1320, to: 360 })).toBe(true)
    expect(isValidWindow({ from: Number.NaN, to: 360 })).toBe(false)
  })

  it('gère une plage qui traverse minuit, à la demi-heure', () => {
    expect(isInOffPeak(23 * 60, NIGHT)).toBe(true)
    expect(isInOffPeak(2 * 60, NIGHT)).toBe(true)
    expect(isInOffPeak(6 * 60, NIGHT)).toBe(false)
    expect(isInOffPeak(12 * 60, NIGHT)).toBe(false)
    const halfHours: OffPeakWindow[] = [{ from: 23 * 60 + 30, to: 7 * 60 + 30 }]
    expect(isInOffPeak(23 * 60, halfHours)).toBe(false)
    expect(isInOffPeak(23 * 60 + 30, halfHours)).toBe(true)
    expect(isInOffPeak(7 * 60, halfHours)).toBe(true)
    expect(isInOffPeak(7 * 60 + 30, halfHours)).toBe(false)
  })

  it('une plage vide ne bascule jamais tout en heures creuses', () => {
    expect(isInOffPeak(12 * 60, [{ from: 360, to: 360 }])).toBe(false)
  })

  it('gère plusieurs plages dont une en journée', () => {
    const two: OffPeakWindow[] = [
      { from: 2 * 60, to: 7 * 60 },
      { from: 13 * 60, to: 16 * 60 },
    ]
    expect(isInOffPeak(14 * 60, two)).toBe(true)
    expect(isInOffPeak(60, two)).toBe(false)
  })
})

describe('parisParts', () => {
  it('donne le jour civil et la minute de Paris, en été comme en hiver', () => {
    expect(parisParts('2026-01-05T23:30:00Z')).toEqual({ day: '2026-01-06', minutes: 30 })
    expect(parisParts('2026-07-05T22:15:00Z')).toEqual({ day: '2026-07-06', minutes: 15 })
  })

  it('le jour du passage à l heure d hiver, 02:30 existe deux fois et reste 02:30', () => {
    expect(parisParts('2026-10-25T00:30:00Z').minutes).toBe(150)
    expect(parisParts('2026-10-25T01:30:00Z').minutes).toBe(150)
  })
})

describe('splitHphc', () => {
  it('répartit les kWh selon la plage saisie, en heure de Paris', () => {
    const readings = [
      { ts: '2026-01-05T12:00:00+01:00', kwh: 1 },
      { ts: '2026-01-05T22:30:00+01:00', kwh: 2 },
      { ts: '2026-01-06T05:30:00+01:00', kwh: 3 },
      { ts: '2026-01-06T06:00:00+01:00', kwh: 4 },
    ]
    expect(splitHphc(readings, NIGHT)).toEqual({ hp: 5, hc: 5 })
  })
})

describe('splitByTempo', () => {
  it('répartit les kWh par couleur du jour et heures creuses réglementaires, jour par jour', () => {
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
    const split = splitByTempo(readings, calendar)
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
    const split = splitByTempo([{ ts: '2026-01-07T12:00:00+01:00', kwh: 5 }], new Map())
    expect(split.uncoveredKwh).toBe(5)
    expect(Object.values(split.buckets).every((v) => v === 0)).toBe(true)
  })

  it("lit l'heure en heure de Paris, pas en UTC", () => {
    // 23 h UTC = 0 h Paris le lendemain (heure d'hiver) : le jour et la plage HC changent
    const split = splitByTempo(
      [{ ts: '2026-01-05T23:30:00Z', kwh: 1 }],
      new Map([['2026-01-06', 'WHITE' as const]]),
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

describe('fourchettes sur données quotidiennes', () => {
  it('HP/HC : du tout-heures-creuses au tout-heures-pleines, colonnes additives', () => {
    const r = rangeHphc(1000, trv('HPHC', { hp: 0.2081, hc: 0.1635 }))
    expect(r).toEqual({
      subscription: 229.68,
      energyMin: 163.5,
      energyMax: 208.1,
      totalMin: 393.18,
      totalMax: 437.78,
    })
    expect(rangeHphc(1000, trv('HPHC', { hp: 0.2081 }))).toBeNull()
  })

  it('Tempo : la couleur du jour est connue, la part HP/HC ne l est pas', () => {
    const prices = {
      hp_bleu: 0.16,
      hc_bleu: 0.13,
      hp_blanc: 0.19,
      hc_blanc: 0.15,
      hp_rouge: 0.73,
      hc_rouge: 0.16,
    }
    const calendar = new Map([
      ['2026-01-05', 'BLUE' as const],
      ['2026-01-06', 'RED' as const],
    ])
    const result = rangeTempoDaily(
      [
        { day: '2026-01-05', kwh: 10 },
        { day: '2026-01-06', kwh: 10 },
        { day: '2026-01-07', kwh: 5 },
      ],
      calendar,
      trv('TEMPO', prices),
    )
    if (result === null) throw new Error('fourchette attendue')
    // min : 10 × 0,13 + 10 × 0,16 = 2,9 ; max : 10 × 0,16 + 10 × 0,73 = 8,9
    expect(result.range.energyMin).toBeCloseTo(2.9, 2)
    expect(result.range.energyMax).toBeCloseTo(8.9, 2)
    expect(result.uncoveredKwh).toBe(5)
    expect(rangeTempoDaily([{ day: '2026-01-05', kwh: 1 }], calendar, trv('TEMPO', {}))).toBeNull()
  })

  it('Tempo : les bornes restent exactes jour par jour même si une grille inversait HC et HP', () => {
    const odd = {
      hp_bleu: 0.16,
      hc_bleu: 0.13,
      hp_blanc: 0.19,
      hc_blanc: 0.15,
      hp_rouge: 0.2,
      hc_rouge: 0.73,
    }
    const calendar = new Map([
      ['2026-01-05', 'BLUE' as const],
      ['2026-01-06', 'RED' as const],
    ])
    const result = rangeTempoDaily(
      [
        { day: '2026-01-05', kwh: 10 },
        { day: '2026-01-06', kwh: 10 },
      ],
      calendar,
      trv('TEMPO', odd),
    )
    // min : 10 × 0,13 + 10 × 0,20 = 3,30 ; max : 10 × 0,16 + 10 × 0,73 = 8,90
    expect(result?.range.energyMin).toBeCloseTo(3.3, 2)
    expect(result?.range.energyMax).toBeCloseTo(8.9, 2)
  })

  it('compte les jours civils inclus entre deux dates', () => {
    expect(calendarDaysInclusive('2026-01-01', '2026-01-01')).toBe(1)
    expect(calendarDaysInclusive('2026-01-01', '2026-09-02')).toBe(245)
    expect(calendarDaysInclusive('2026-03-28', '2026-03-30')).toBe(3)
  })
})

describe('période couverte', () => {
  it('compte la durée réelle, fractionnaire, entre début du premier pas et fin du dernier', () => {
    expect(coveredDays('2026-01-05T00:00:00Z', '2026-01-06T00:00:00Z')).toBe(1)
    expect(coveredDays('2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z')).toBe(365)
    expect(coveredDays('2026-01-05T10:30:00Z', '2026-01-06T17:30:00Z')).toBeCloseTo(31 / 24, 6)
  })

  it('l année de référence vaut 366 jours si la période contient un 29 février', () => {
    expect(yearLengthFor('2028-01-01T00:00:00Z', '2028-12-31T00:00:00Z')).toBe(366)
    expect(yearLengthFor('2026-01-01T00:00:00Z', '2026-12-31T00:00:00Z')).toBe(365)
    expect(yearLengthFor('2028-03-01T00:00:00Z', '2029-02-28T00:00:00Z')).toBe(365)
  })
})
