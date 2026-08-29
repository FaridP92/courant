/**
 * Constructeurs d'options ECharts, purs et testables.
 * La colonne du temps validée en Phase 0 : le graphe héro (conso vs prévisions) et le mix
 * partagent le même axe temporel ; le crosshair est synchronisé via echarts.connect
 * (groupe "time-column") et un repère vertical marque le dernier point complet.
 * Honnêteté : le repère ne s'appelle MAINTENANT que si la donnée est quasi courante,
 * sinon il affiche son horodatage ; la série Réalisé et les aires du mix ne relient
 * jamais les trous (connectNulls false), seules les prévisions, continues par nature,
 * sont tracées d'un trait.
 */
import type { NationalPoint } from '../../lib/api.ts'
import { formatGigawatts, formatParisClock } from '../../lib/format.ts'
import {
  accent,
  forecastDayBefore,
  forecastToday,
  FUELS,
  ink,
  surfaces,
} from '../../lib/palette.ts'

type TimeValue = [number, number | null]

interface EndLabel {
  show: true
  formatter: string
  color: string
  fontFamily: string
  fontSize: number
  textBorderColor?: string
  textBorderWidth?: number
}

interface LineSeries {
  name: string
  type: 'line'
  data: TimeValue[]
  showSymbol: false
  connectNulls: boolean
  lineStyle: { color: string; width: number; type?: 'solid' | 'dashed' | 'dotted' }
  itemStyle: { color: string }
  emphasis: { disabled: true }
  stack?: string
  areaStyle?: { color: string; opacity: number }
  z?: number
  endLabel?: EndLabel
  markLine?: {
    symbol: 'none'
    silent: true
    label: {
      show: boolean
      formatter?: string
      color?: string
      fontFamily?: string
      fontSize?: number
    }
    lineStyle: { color: string; type: 'dashed'; width: number }
    data: { xAxis: number }[]
  }
}

export interface TimeColumnChartOption {
  animation: boolean
  grid: { left: number; right: number; top: number; bottom: number }
  xAxis: object
  yAxis: object
  tooltip: object
  dataZoom: object[]
  series: LineSeries[]
}

/** Même prédicat de complétude que v_national_latest : conso, nucléaire et CO2 renseignés. */
export function lastCompletePoint(points: readonly NationalPoint[]): NationalPoint | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i]
    if (p === undefined) continue
    if (p.consommation !== null && p.nucleaire !== null && p.taux_co2 !== null) return p
  }
  return null
}

/** Libellé du repère : MAINTENANT seulement si le point est quasi courant, sinon son heure. */
export function cursorLabel(lastTs: string, now: Date): string {
  const gapMinutes = (now.getTime() - Date.parse(lastTs)) / 60000
  return gapMinutes <= 30 ? 'MAINTENANT' : `DONNÉES ${formatParisClock(lastTs)}`
}

/** Bornes de l'axe héro en GW, pour annoncer la troncature d'échelle dans l'UI. */
export function heroScaleBoundsGw(points: readonly NationalPoint[]): {
  min: number
  max: number
} | null {
  const values: number[] = []
  for (const p of points) {
    for (const v of [p.consommation, p.prevision_j, p.prevision_j1]) {
      if (v !== null) values.push(v)
    }
  }
  if (values.length === 0) return null
  const vMin = Math.min(...values)
  const vMax = Math.max(...values)
  return {
    min: Math.max(0, Math.floor((vMin - 2000) / 5000) * 5000) / 1000,
    max: (Math.ceil((vMax + 2000) / 5000) * 5000) / 1000,
  }
}

const toPairs = (points: readonly NationalPoint[], field: keyof NationalPoint): TimeValue[] =>
  points.map((p) => [Date.parse(p.ts), p[field] as number | null])

export function timeAxis(): object {
  return {
    type: 'time',
    axisLine: { lineStyle: { color: surfaces.line } },
    axisLabel: {
      color: ink.low,
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: 10,
      hideOverlap: true,
      formatter: (ms: number) => `${formatParisClock(new Date(ms)).slice(0, 2)}h`,
    },
    splitLine: { show: false },
  }
}

export function gwAxis(extra: object = {}): object {
  return {
    type: 'value',
    axisLabel: {
      color: ink.low,
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: 10,
      formatter: (mw: number) => String(Math.round(mw / 1000)),
    },
    splitLine: { lineStyle: { color: surfaces.grid } },
    name: 'GW',
    nameTextStyle: { color: ink.low, fontFamily: 'IBM Plex Mono, monospace', fontSize: 10 },
    ...extra,
  }
}

export function gwTooltip(extra: object = {}): object {
  return {
    trigger: 'axis',
    confine: true,
    backgroundColor: 'rgba(10, 18, 22, 0.94)',
    borderColor: surfaces.line,
    textStyle: { color: ink.mid, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 },
    valueFormatter: (value: unknown) =>
      typeof value === 'number' ? `${formatGigawatts(value)} GW` : 'indisponible',
    axisPointer: {
      type: 'line',
      lineStyle: { color: accent, opacity: 0.4 },
      label: {
        backgroundColor: surfaces.raised,
        color: ink.hi,
        formatter: ({ value }: { value: number | string }) =>
          typeof value === 'number' ? formatParisClock(new Date(value)) : value,
      },
    },
    ...extra,
  }
}

const monoEndLabel = (text: string, color: string): EndLabel => ({
  show: true,
  formatter: text,
  color,
  fontFamily: 'IBM Plex Mono, monospace',
  fontSize: 9.5,
})

type CursorMarkLine = NonNullable<LineSeries['markLine']>

function cursorMarkLine(lastTs: string, label: string | null): CursorMarkLine {
  return {
    symbol: 'none',
    silent: true,
    label:
      label === null
        ? { show: false }
        : {
            show: true,
            formatter: label,
            color: accent,
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 9,
          },
    lineStyle: { color: accent, type: 'dashed', width: 1 },
    data: [{ xAxis: Date.parse(lastTs) }],
  }
}

/** Zoom interne : molette et pincement sur l'axe du temps, sans barre visible. */
export const insideZoom = (): object[] => [
  {
    type: 'inside',
    xAxisIndex: 0,
    filterMode: 'none',
    zoomOnMouseWheel: true,
    moveOnMouseMove: true,
  },
]

export function buildHeroChartOption(
  points: readonly NationalPoint[],
  now: Date = new Date(),
): TimeColumnChartOption {
  const last = lastCompletePoint(points)
  const realized: LineSeries = {
    name: 'Réalisé',
    type: 'line',
    data: toPairs(points, 'consommation'),
    showSymbol: false,
    connectNulls: false,
    lineStyle: { color: accent, width: 2.2 },
    itemStyle: { color: accent },
    emphasis: { disabled: true },
    z: 3,
  }
  if (last) {
    realized.markLine = cursorMarkLine(last.ts, cursorLabel(last.ts, now))
  }
  return {
    animation: false,
    grid: { left: 46, right: 40, top: 28, bottom: 26 },
    xAxis: timeAxis(),
    yAxis: gwAxis({
      min: ({ min }: { min: number }) => Math.max(0, Math.floor((min - 2000) / 5000) * 5000),
      max: ({ max }: { max: number }) => Math.ceil((max + 2000) / 5000) * 5000,
    }),
    tooltip: gwTooltip(),
    dataZoom: insideZoom(),
    series: [
      realized,
      {
        name: 'Prévision J',
        type: 'line',
        data: toPairs(points, 'prevision_j'),
        showSymbol: false,
        connectNulls: true,
        lineStyle: { color: forecastToday, width: 1.6, type: 'dotted' },
        itemStyle: { color: forecastToday },
        emphasis: { disabled: true },
        endLabel: monoEndLabel('J', forecastToday),
        z: 2,
      },
      {
        name: 'Prévision J-1',
        type: 'line',
        data: toPairs(points, 'prevision_j1'),
        showSymbol: false,
        connectNulls: true,
        lineStyle: { color: forecastDayBefore, width: 1.6, type: 'dashed' },
        itemStyle: { color: forecastDayBefore },
        emphasis: { disabled: true },
        endLabel: monoEndLabel('J-1', forecastDayBefore),
        z: 1,
      },
    ],
  }
}

export function buildMixChartOption(
  points: readonly NationalPoint[],
  hiddenKeys: ReadonlySet<string> = new Set(),
): TimeColumnChartOption {
  const last = lastCompletePoint(points)
  const visibleFuels = FUELS.filter((fuel) => !hiddenKeys.has(fuel.key))
  // labels directs exigés par la palette validée : nucléaire + la 2e filière dominante
  let secondKey: string | null = null
  if (last) {
    let best = -1
    for (const fuel of visibleFuels) {
      if (fuel.key === 'nucleaire') continue
      const value = last[fuel.key]
      if (value !== null && value > best) {
        best = value
        secondKey = fuel.key
      }
    }
  }
  return {
    animation: false,
    grid: { left: 46, right: 82, top: 12, bottom: 26 },
    xAxis: timeAxis(),
    yAxis: gwAxis(),
    tooltip: gwTooltip({ order: 'seriesDesc' }),
    dataZoom: insideZoom(),
    series: visibleFuels.map((fuel, index) => {
      const series: LineSeries = {
        name: fuel.label,
        type: 'line',
        stack: 'mix',
        data: toPairs(points, fuel.key),
        showSymbol: false,
        connectNulls: false,
        // liseré de 2 px couleur surface : l'écart entre aires exigé par la palette validée
        lineStyle: { color: surfaces.panel, width: 2 },
        itemStyle: { color: fuel.color },
        areaStyle: { color: fuel.color, opacity: 0.92 },
        emphasis: { disabled: true },
      }
      if (fuel.key === 'nucleaire' || fuel.key === secondKey) {
        series.endLabel = {
          ...monoEndLabel(fuel.label, ink.hi),
          textBorderColor: surfaces.abyss,
          textBorderWidth: 2,
        }
      }
      if (index === 0 && last) {
        series.markLine = cursorMarkLine(last.ts, null)
      }
      return series
    }),
  }
}
