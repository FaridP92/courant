/**
 * Options ECharts de l'Explorateur, pures et testables.
 * Réutilise les axes/tooltip/zoom de la colonne du temps (chartOptions.ts) ;
 * mix régional : six filières, thermique agrégé (ADR-0004), pompage exclu
 * (stockage négatif, pas une production).
 */
import type { RegionalPoint } from '../../lib/api.ts'
import type { Theme } from '../../hooks/useTheme.ts'
import { paletteFor, type FuelSeries } from '../../lib/palette.ts'
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

/** Filières régionales empilées, du socle aux appoints (libellés éCO2mix). */
export interface RegionalFuel {
  key: keyof Pick<
    RegionalPoint,
    'nucleaire' | 'hydraulique' | 'eolien' | 'solaire' | 'bioenergies' | 'thermique'
  >
  label: string
  color: string
}

const REGIONAL_ORDER: readonly {
  key: RegionalFuel['key']
  label: string
  from: FuelSeries['key']
}[] = [
  { key: 'nucleaire', label: 'Nucléaire', from: 'nucleaire' },
  { key: 'hydraulique', label: 'Hydraulique', from: 'hydraulique' },
  { key: 'eolien', label: 'Éolien', from: 'eolien' },
  { key: 'solaire', label: 'Solaire', from: 'solaire' },
  { key: 'bioenergies', label: 'Bioénergies', from: 'bioenergies' },
  { key: 'thermique', label: 'Thermique', from: 'gaz' },
]

export function regionalFuels(theme: Theme = 'light'): readonly RegionalFuel[] {
  const fuels = paletteFor(theme).fuels
  return REGIONAL_ORDER.map((f) => ({
    key: f.key,
    label: f.label,
    color: fuels.find((fuel) => fuel.key === f.from)?.color ?? '#000000',
  }))
}

/** Compatibilité : la liste du thème jour. */
export const REGIONAL_FUELS: readonly RegionalFuel[] = regionalFuels('light')

export interface TerritoryCurve {
  name: string
  points: readonly { ts: string; consommation: number | null }[]
}

/** Couleurs des courbes superposées : l'accent pour le territoire principal, puis
 * une teinte de la palette validée (fioul) et l'encre forte. Aucune filière n'est
 * tracée dans ce graphe, donc aucune couleur n'y porte déjà un autre sens. */
export function curveColors(theme: Theme = 'light'): readonly string[] {
  const palette = paletteFor(theme)
  return [
    palette.accent,
    palette.fuels.find((f) => f.key === 'fioul')?.color ?? palette.ink.mid,
    palette.ink.hi,
  ]
}

export function curveColor(index: number, theme: Theme = 'light'): string {
  return curveColors(theme)[index] ?? paletteFor(theme).ink.mid
}

export function buildTerritoryConsoOption(
  curves: readonly TerritoryCurve[],
  theme: Theme = 'light',
): ExplorerChartOption {
  const palette = paletteFor(theme)
  // l'aire ne se remplit que pour une courbe seule : superposées, elles se cacheraient
  const filled = curves.length === 1
  return {
    animation: false,
    grid: { left: 46, right: 18, top: 16, bottom: 26 },
    xAxis: timeAxis(palette),
    yAxis: gwAxis({}, palette),
    tooltip: gwTooltip({}, palette),
    dataZoom: insideZoom(),
    series: curves.map((curve, index) => {
      const color = curveColor(index, theme)
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

export function buildRegionalMixOption(
  points: readonly RegionalPoint[],
  theme: Theme = 'light',
): ExplorerChartOption {
  const palette = paletteFor(theme)
  return {
    animation: false,
    grid: { left: 46, right: 18, top: 16, bottom: 26 },
    xAxis: timeAxis(palette),
    yAxis: gwAxis({}, palette),
    tooltip: gwTooltip({ order: 'seriesDesc' }, palette),
    dataZoom: insideZoom(),
    series: regionalFuels(theme).map((fuel) => ({
      name: fuel.label,
      type: 'line' as const,
      stack: 'mix',
      data: points.map((p) => [Date.parse(p.ts), p[fuel.key]] as TimeValue),
      showSymbol: false as const,
      connectNulls: false,
      // liseré couleur surface : l'écart entre aires de la palette validée
      lineStyle: { color: palette.surfaces.panel, width: 2 },
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
