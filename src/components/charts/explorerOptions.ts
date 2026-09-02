/**
 * Options ECharts de l'Explorateur, pures et testables.
 * Réutilise les axes/tooltip/zoom de la colonne du temps (chartOptions.ts) ;
 * mix régional : six filières, thermique agrégé (ADR-0004), pompage exclu
 * (stockage négatif, pas une production).
 */
import type { RegionalPoint } from '../../lib/api.ts'
import { accent, FUELS, ink, surfaces } from '../../lib/palette.ts'
import { gwAxis, gwTooltip, insideZoom, timeAxis } from './chartOptions.ts'

type TimeValue = [number, number | null]

interface ExplorerSeries {
  name: string
  type: 'line'
  data: TimeValue[]
  showSymbol: false
  connectNulls: boolean
  lineStyle: { color: string; width: number }
  itemStyle: { color: string }
  emphasis: { disabled: true }
  stack?: string
  areaStyle?: { color: string; opacity: number }
}

export interface ExplorerChartOption {
  animation: boolean
  grid: { left: number; right: number; top: number; bottom: number }
  xAxis: object
  yAxis: object
  tooltip: object
  dataZoom: object[]
  series: ExplorerSeries[]
}

const fuelColor = (key: string, fallback: string): string =>
  FUELS.find((f) => f.key === key)?.color ?? fallback

/** Filières régionales empilées, du socle aux appoints (libellés éCO2mix). */
export const REGIONAL_FUELS: readonly {
  key: keyof Pick<
    RegionalPoint,
    'nucleaire' | 'hydraulique' | 'eolien' | 'solaire' | 'bioenergies' | 'thermique'
  >
  label: string
  color: string
}[] = [
  { key: 'nucleaire', label: 'Nucléaire', color: fuelColor('nucleaire', '#b58c15') },
  { key: 'hydraulique', label: 'Hydraulique', color: fuelColor('hydraulique', '#287ab5') },
  { key: 'eolien', label: 'Éolien', color: fuelColor('eolien', '#2ca893') },
  { key: 'solaire', label: 'Solaire', color: fuelColor('solaire', '#c06a01') },
  { key: 'bioenergies', label: 'Bioénergies', color: fuelColor('bioenergies', '#0f8354') },
  { key: 'thermique', label: 'Thermique', color: fuelColor('gaz', '#c65860') },
]

export interface TerritoryCurve {
  name: string
  points: readonly { ts: string; consommation: number | null }[]
}

/** Couleurs des courbes superposées : l'accent pour le territoire principal, puis
 * deux teintes de la palette validée. Aucune filière n'est tracée dans ce graphe,
 * donc aucune couleur n'y porte déjà un autre sens. */
export const CURVE_COLORS: readonly string[] = [accent, '#986eb9', ink.hi]

export function curveColor(index: number): string {
  return CURVE_COLORS[index] ?? ink.mid
}

export function buildTerritoryConsoOption(curves: readonly TerritoryCurve[]): ExplorerChartOption {
  // l'aire ne se remplit que pour une courbe seule : superposées, elles se cacheraient
  const filled = curves.length === 1
  return {
    animation: false,
    grid: { left: 46, right: 18, top: 16, bottom: 26 },
    xAxis: timeAxis(),
    yAxis: gwAxis(),
    tooltip: gwTooltip(),
    dataZoom: insideZoom(),
    series: curves.map((curve, index) => {
      const color = curveColor(index)
      const series: ExplorerSeries = {
        name: curve.name,
        type: 'line',
        data: curve.points.map((p) => [Date.parse(p.ts), p.consommation] as TimeValue),
        showSymbol: false,
        connectNulls: false,
        lineStyle: { color, width: 2 },
        itemStyle: { color },
        emphasis: { disabled: true },
      }
      if (filled) series.areaStyle = { color, opacity: 0.08 }
      return series
    }),
  }
}

export function buildRegionalMixOption(points: readonly RegionalPoint[]): ExplorerChartOption {
  return {
    animation: false,
    grid: { left: 46, right: 18, top: 16, bottom: 26 },
    xAxis: timeAxis(),
    yAxis: gwAxis(),
    tooltip: gwTooltip({ order: 'seriesDesc' }),
    dataZoom: insideZoom(),
    series: REGIONAL_FUELS.map((fuel) => ({
      name: fuel.label,
      type: 'line' as const,
      stack: 'mix',
      data: points.map((p) => [Date.parse(p.ts), p[fuel.key]] as TimeValue),
      showSymbol: false as const,
      connectNulls: false,
      // liseré couleur surface : l'écart entre aires de la palette validée
      lineStyle: { color: surfaces.panel, width: 2 },
      itemStyle: { color: fuel.color },
      areaStyle: { color: fuel.color, opacity: 0.92 },
      emphasis: { disabled: true as const },
    })),
  }
}

/** Libellé d'accessibilité du graphe conso, dérivé des données. */
export function territoryChartAriaLabel(curves: readonly TerritoryCurve[]): string {
  const [first, ...others] = curves
  if (first === undefined) return 'Courbe de consommation, aucune donnée affichée.'
  const compared =
    others.length === 0
      ? ''
      : ` Comparée à ${others.map((c) => `${c.name} (${String(c.points.length)} points)`).join(' et ')}.`
  return `Courbe de consommation de ${first.name}, ${String(first.points.length)} points affichés.${compared} Zoom possible à la molette.`
}
