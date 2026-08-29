import { describe, expect, it } from 'vitest'
import type { EcowattDay, TempoSnapshot } from './api.ts'
import {
  ecowattDaySummary,
  ecowattNote,
  formatDayShort,
  formatRanges,
  hourRanges,
  parisDayIso,
  tempoNote,
} from './signals.ts'

const hoursOf = (hvalues: readonly number[]) => hvalues.map((hvalue, pas) => ({ pas, hvalue }))

const day = (iso: string, dvalue: 1 | 2 | 3, hvalues: readonly number[]): EcowattDay => ({
  day: iso,
  dvalue,
  message: 'x',
  generated_at: '2026-08-28T22:00:00+02:00',
  hours: hoursOf(hvalues),
})

const GREEN_24 = Array.from({ length: 24 }, () => 1)
const DECARB_24 = Array.from({ length: 24 }, () => 0)

describe('parisDayIso', () => {
  it("suit le fuseau Europe/Paris, pas l'UTC : 23h30 UTC un samedi est déjà dimanche à Paris", () => {
    expect(parisDayIso(new Date('2026-08-29T23:30:00Z'))).toBe('2026-08-30')
    expect(parisDayIso(new Date('2026-08-29T12:00:00Z'))).toBe('2026-08-29')
  })
})

describe('formatDayShort', () => {
  it("abrège en français sans point : 'sam 30'", () => {
    expect(formatDayShort('2026-08-30')).toBe('dim 30')
    expect(formatDayShort('2026-08-29')).toBe('sam 29')
  })
})

describe('hourRanges', () => {
  it('regroupe les pas contigus qui matchent en plages [from, to) exclusives', () => {
    const hours = hoursOf([1, 1, 2, 2, 2, 1, 1, 3, 1])
    expect(hourRanges(hours, (v) => v >= 2)).toEqual([
      { from: 2, to: 5 },
      { from: 7, to: 8 },
    ])
  })

  it('rend une liste vide sans correspondance ou sans heures', () => {
    expect(hourRanges(hoursOf([1, 1]), (v) => v >= 2)).toEqual([])
    expect(hourRanges(null, (v) => v >= 2)).toEqual([])
  })

  it('ne suppose jamais 24 pas : le jour courant peut être partiel (contrat RTE)', () => {
    // pas 7 à 9 uniquement, comme l'exemple officiel du guide v5
    const partial = [7, 8, 9].map((pas) => ({ pas, hvalue: 3 }))
    expect(hourRanges(partial, (v) => v >= 2)).toEqual([{ from: 7, to: 10 }])
  })
})

describe('formatRanges', () => {
  it('formate en français avec minuit aux bornes', () => {
    expect(formatRanges([{ from: 18, to: 20 }])).toBe('entre 18 h et 20 h')
    expect(formatRanges([{ from: 0, to: 3 }])).toBe('entre minuit et 3 h')
    expect(formatRanges([{ from: 20, to: 24 }])).toBe('entre 20 h et minuit')
    expect(formatRanges([{ from: 0, to: 24 }])).toBe('toute la journée')
  })

  it('enchaîne plusieurs plages avec « puis »', () => {
    expect(
      formatRanges([
        { from: 8, to: 13 },
        { from: 18, to: 20 },
      ]),
    ).toBe('entre 8 h et 13 h puis entre 18 h et 20 h')
  })
})

describe('ecowattNote', () => {
  const today = '2026-08-29'

  it('signale le premier jour tendu avec ses heures, en nommant Demain quand il tombe demain', () => {
    const days = [
      day('2026-08-29', 1, GREEN_24),
      day('2026-08-30', 2, [...GREEN_24.slice(0, 18), 2, 2, ...GREEN_24.slice(20)]),
      day('2026-08-31', 1, GREEN_24),
    ]
    expect(ecowattNote(days, today)).toBe(
      'Demain : système électrique tendu entre 18 h et 20 h, les éco-gestes comptent.',
    )
  })

  it('un jour rouge parle de coupures et nomme le jour de la semaine au-delà de demain', () => {
    const days = [
      day('2026-08-29', 1, GREEN_24),
      day('2026-08-31', 3, [...GREEN_24.slice(0, 7), 3, 3, 3, ...GREEN_24.slice(10)]),
    ]
    expect(ecowattNote(days, today)).toBe(
      'Lundi : système électrique très tendu entre 7 h et 10 h, des coupures sont possibles sans baisse de la consommation.',
    )
  })

  it("un jour rouge aux heures mixtes n'annonce en très tendu que les heures rouges", () => {
    // heures orange 7-9 h + rouges 18-20 h : la note ne doit pas sur-alerter les heures orange
    const days = [
      day('2026-08-30', 3, [
        ...GREEN_24.slice(0, 7),
        2,
        2,
        ...GREEN_24.slice(9, 18),
        3,
        3,
        ...GREEN_24.slice(20),
      ]),
    ]
    expect(ecowattNote(days, today)).toBe(
      'Demain : système électrique très tendu entre 18 h et 20 h, des coupures sont possibles sans baisse de la consommation.',
    )
  })

  it("sans tension, met en avant l'électricité bas carbone du jour (hvalue 0, contrat v5)", () => {
    const days = [day('2026-08-29', 1, [1, ...DECARB_24.slice(1)]), day('2026-08-30', 1, GREEN_24)]
    expect(ecowattNote(days, today)).toBe(
      "Aujourd'hui : électricité particulièrement bas carbone entre 1 h et minuit.",
    )
  })

  it('sans tension ni fenêtre bas carbone : message vert simple', () => {
    const days = [day('2026-08-29', 1, GREEN_24), day('2026-08-30', 1, GREEN_24)]
    expect(ecowattNote(days, today)).toBe('Aucune tension attendue sur les prochains jours.')
  })

  it("un seul jour reçu : la promesse se limite à aujourd'hui, pas aux jours suivants", () => {
    const days = [day('2026-08-29', 1, GREEN_24)]
    expect(ecowattNote(days, today)).toBe("Aucune tension attendue aujourd'hui.")
  })

  it('rend null sans données : la section affichera son indisponibilité, jamais un vert inventé', () => {
    expect(ecowattNote([], today)).toBeNull()
  })
})

describe('tempoNote', () => {
  const base: TempoSnapshot = {
    today: '2026-08-29',
    season_start: '2025-09-01',
    today_color: 'BLUE',
    today_updated_at: '2026-08-28T08:20:00+00:00',
    tomorrow_color: 'BLUE',
    tomorrow_updated_at: '2026-08-29T08:20:00+00:00',
    red_days_used: 22,
    white_days_used: 43,
    blue_days_used: 298,
  }

  it('annonce la couleur de demain avec son implication tarifaire', () => {
    expect(tempoNote({ ...base, tomorrow_color: 'RED' })).toBe(
      'Demain jour rouge : électricité plus chère de 6 h à 22 h pour les abonnés Tempo.',
    )
    expect(tempoNote({ ...base, tomorrow_color: 'WHITE' })).toBe(
      'Demain jour blanc : tarif intermédiaire pour les abonnés Tempo.',
    )
    expect(tempoNote({ ...base, tomorrow_color: 'BLUE' })).toBe(
      'Demain jour bleu : le tarif le plus avantageux pour les abonnés Tempo.',
    )
  })

  it("demain non publié : on dit quand RTE publie, on n'invente pas de couleur", () => {
    // 10 h 20 : heure constatée sur les updated_date réels, alignée avec la migration 0015
    expect(tempoNote({ ...base, tomorrow_color: null })).toBe(
      'Couleur de demain publiée par RTE vers 10 h 20.',
    )
  })
})

describe('ecowattDaySummary', () => {
  it('décrit chaque niveau présent avec ses plages, du plus critique au bas carbone', () => {
    const d = day('2026-08-30', 2, [
      ...Array.from({ length: 7 }, () => 1),
      3,
      3,
      2,
      2,
      ...Array.from({ length: 7 }, () => 1),
      0,
      0,
      0,
      ...Array.from({ length: 3 }, () => 1),
    ])
    expect(ecowattDaySummary(d)).toBe(
      'très tendu entre 7 h et 9 h · tendu entre 9 h et 11 h · bas carbone entre 18 h et 21 h',
    )
  })

  it('un jour tout vert le dit simplement', () => {
    expect(ecowattDaySummary(day('2026-08-30', 1, GREEN_24))).toBe('vert toute la journée')
  })

  it('un jour partiel reste honnête sur la couverture', () => {
    const partial: EcowattDay = {
      ...day('2026-08-29', 1, []),
      hours: [7, 8, 9].map((pas) => ({ pas, hvalue: 1 })),
    }
    expect(ecowattDaySummary(partial)).toBe('vert sur les heures publiées')
  })

  it('un jour partiel AVEC tension dit aussi ce qui manque', () => {
    const partial: EcowattDay = {
      ...day('2026-08-29', 3, []),
      hours: Array.from({ length: 12 }, (_, pas) => ({ pas, hvalue: pas === 9 ? 3 : 1 })),
    }
    expect(ecowattDaySummary(partial)).toBe(
      'très tendu entre 9 h et 10 h · reste du jour non publié',
    )
  })

  it('aucune heure publiée : on le dit, sans inventer', () => {
    expect(ecowattDaySummary({ ...day('2026-08-29', 1, []), hours: null })).toBe(
      'heures non publiées',
    )
  })
})
