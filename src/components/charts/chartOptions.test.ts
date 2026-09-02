import { describe, expect, it } from 'vitest'
import type { NationalPoint } from '../../lib/api.ts'
import { FUELS } from '../../lib/palette.ts'
import {
  buildHeroChartOption,
  buildMixChartOption,
  cursorLabel,
  heroScaleBoundsGw,
  lastCompletePoint,
} from './chartOptions.ts'

function point(ts: string, overrides: Partial<NationalPoint> = {}): NationalPoint {
  return {
    ts,
    maturity: 'R',
    consommation: 60000,
    prevision_j1: 59000,
    prevision_j: 59500,
    nucleaire: 42000,
    hydraulique: 8000,
    pompage: -500,
    eolien: 6000,
    solaire: 1000,
    gaz: 2500,
    fioul: 100,
    charbon: 200,
    bioenergies: 1100,
    ech_physiques: -900,
    taux_co2: 30,
    ...overrides,
  }
}

const series24h: NationalPoint[] = [
  point('2026-08-29T10:00:00+00:00'),
  point('2026-08-29T10:15:00+00:00', { consommation: 61000 }),
  // télémétrie en retard : les derniers quarts d'heure arrivent troués
  point('2026-08-29T10:30:00+00:00', { consommation: null, nucleaire: null, taux_co2: null }),
]

describe('lastCompletePoint', () => {
  it('exige le même prédicat que v_national_latest : conso, nucléaire et CO2', () => {
    expect(lastCompletePoint(series24h)?.ts).toBe('2026-08-29T10:15:00+00:00')
    const consoSeule = [...series24h, point('2026-08-29T10:45:00+00:00', { nucleaire: null })]
    expect(lastCompletePoint(consoSeule)?.ts).toBe('2026-08-29T10:15:00+00:00')
  })

  it('renvoie null sur une série vide', () => {
    expect(lastCompletePoint([])).toBeNull()
  })
})

describe('cursorLabel : le repère ne ment jamais', () => {
  it('dit MAINTENANT quand le point est quasi courant', () => {
    expect(cursorLabel('2026-08-29T10:15:00+00:00', new Date('2026-08-29T10:27:00+00:00'))).toBe(
      'MAINTENANT',
    )
  })

  it("s'horodate quand la source est en retard", () => {
    expect(cursorLabel('2026-08-29T03:45:00+00:00', new Date('2026-08-29T08:39:00+00:00'))).toBe(
      'DONNÉES 05:45',
    )
  })
})

describe('buildHeroChartOption', () => {
  const now = new Date('2026-08-29T10:20:00+00:00')
  const option = buildHeroChartOption(series24h, now)

  it('trace trois séries : réalisé et deux prévisions', () => {
    expect(option.series.map((s) => s.name)).toEqual(['Réalisé', 'Prévision J', 'Prévision J-1'])
  })

  it('garde les trous du réalisé à null et ne les relie pas (connectNulls false)', () => {
    const realized = option.series[0]
    expect(realized?.data.at(-1)?.[1]).toBeNull()
    expect(realized?.connectNulls).toBe(false)
  })

  it('pose le repère sur le dernier point complet', () => {
    const markLine = option.series[0]?.markLine
    expect(markLine?.data[0]?.xAxis).toBe(Date.parse('2026-08-29T10:15:00+00:00'))
    expect(markLine?.label.formatter).toBe('MAINTENANT')
  })

  it('distingue les prévisions par le motif, pas seulement la couleur, avec labels directs', () => {
    const [, forecastToday, forecastDayBefore] = option.series
    expect(forecastToday?.lineStyle.type).toBe('dotted')
    expect(forecastDayBefore?.lineStyle.type).toBe('dashed')
    expect(forecastToday?.endLabel?.formatter).toBe('J')
    expect(forecastDayBefore?.endLabel?.formatter).toBe('J-1')
  })
})

describe('heroScaleBoundsGw', () => {
  it('annonce la troncature d’échelle appliquée par l’axe', () => {
    expect(heroScaleBoundsGw(series24h)).toEqual({ min: 55, max: 65 })
    expect(heroScaleBoundsGw([])).toBeNull()
  })
})

describe('buildMixChartOption', () => {
  const option = buildMixChartOption(series24h)

  it('empile les huit filières dans l’ordre validé de la palette', () => {
    expect(option.series.map((s) => s.name)).toEqual(FUELS.map((f) => f.label))
    expect(new Set(option.series.map((s) => s.stack)).size).toBe(1)
  })

  it('utilise les couleurs validées, un liseré surface et aucun trou relié', () => {
    option.series.forEach((s, i) => {
      expect(s.itemStyle.color).toBe(FUELS[i]?.color)
      expect(s.lineStyle.width).toBe(2)
      expect(s.connectNulls).toBe(false)
    })
  })

  it('pose des labels directs sur le nucléaire et la 2e filière dominante (hydraulique ici)', () => {
    const labelled = option.series.filter((s) => s.endLabel !== undefined).map((s) => s.name)
    expect(labelled).toEqual(['Nucléaire', 'Hydraulique'])
  })

  it('active le zoom interne sur les deux vues', () => {
    expect(buildHeroChartOption(series24h).dataZoom).toHaveLength(1)
    expect(option.dataZoom).toHaveLength(1)
  })

  it('masque les filières demandées et recalcule les labels dominants', () => {
    const filtered = buildMixChartOption(series24h, new Set(['hydraulique']))
    expect(filtered.series.map((s) => s.name)).not.toContain('Hydraulique')
    const labelled = filtered.series.filter((s) => s.endLabel !== undefined).map((s) => s.name)
    expect(labelled).toEqual(['Nucléaire', 'Éolien'])
  })

  it('reporte le repère du dernier point complet sur le mix aussi, sans libellé', () => {
    const markLine = option.series[0]?.markLine
    expect(markLine?.data[0]?.xAxis).toBe(Date.parse('2026-08-29T10:15:00+00:00'))
    expect(markLine?.label.show).toBe(false)
  })
})

describe('buildHeroChartOption : seuil CO2 en mise en évidence', () => {
  const carbonSeries: NationalPoint[] = [
    point('2026-08-29T10:00:00+00:00', { taux_co2: 30 }),
    point('2026-08-29T10:15:00+00:00', { taux_co2: 62 }),
    point('2026-08-29T10:30:00+00:00', { taux_co2: 71 }),
    point('2026-08-29T10:45:00+00:00', { taux_co2: 28 }),
  ]

  const markAreaOf = (option: ReturnType<typeof buildHeroChartOption>) =>
    (option.series[0] as { markArea?: { data: { xAxis: number }[][] } }).markArea

  it('sans seuil, aucune zone : la courbe reste nue', () => {
    expect(markAreaOf(buildHeroChartOption(carbonSeries))).toBeUndefined()
  })

  it('avec un seuil, ombre les plages dépassées, bornées par des mesures réelles', () => {
    const option = buildHeroChartOption(carbonSeries, new Date('2026-08-29T10:45:00+00:00'), 50)
    const area = markAreaOf(option)

    expect(area?.data).toHaveLength(1)
    expect(area?.data[0]?.[0]?.xAxis).toBe(Date.parse('2026-08-29T10:15:00+00:00'))
    expect(area?.data[0]?.[1]?.xAxis).toBe(Date.parse('2026-08-29T10:30:00+00:00'))
  })

  it('les points restent tous là : la mise en évidence ne retire aucune mesure', () => {
    const option = buildHeroChartOption(carbonSeries, new Date('2026-08-29T10:45:00+00:00'), 50)

    expect((option.series[0] as { data: unknown[] }).data).toHaveLength(carbonSeries.length)
  })
})
