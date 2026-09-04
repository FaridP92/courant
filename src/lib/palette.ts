/**
 * Miroir JavaScript des tokens de src/styles/tokens.css pour ECharts et les SVG,
 * dans les deux thèmes. Source de vérité : tokens.css (palettes filières validées,
 * docs/design/palette-validation.md). Toute évolution se fait dans tokens.css PUIS ici.
 * Les exports nommés (surfaces, ink, accent, FUELS...) sont ceux du thème JOUR, le
 * défaut ; les graphes reçoivent la palette de leur thème via paletteFor(theme).
 */
import type { Theme } from '../hooks/useTheme.ts'

export interface FuelSeries {
  key:
    'nucleaire' | 'hydraulique' | 'gaz' | 'eolien' | 'solaire' | 'bioenergies' | 'charbon' | 'fioul'
  label: string
  color: string
}

export interface Palette {
  surfaces: {
    abyss: string
    panel: string
    raised: string
    line: string
    lineStrong: string
    grid: string
  }
  ink: { hi: string; mid: string; low: string }
  accent: string
  forecastToday: string
  forecastDayBefore: string
  /** Fond des infobulles ECharts (opaque à 94 %). */
  tooltipBackground: string
  /** Flux d'import sur la carte : gris-bleu, jamais le rouge (règle 9). */
  importFlow: string
  /** Fond des régions sans donnée : neutre, jamais un faux zéro. */
  neutralArea: string
  /** Teinte RGB (sans alpha) des voiles d'écart et de la choroplèthe séquentielle. */
  accentRgb: string
  /** Teinte RGB (sans alpha) des régions importatrices sur la carte. */
  importFlowRgb: string
  /** Ordre d'empilement validé (paires adjacentes contrôlées au daltonisme). */
  fuels: readonly FuelSeries[]
}

const FUEL_LABELS: readonly { key: FuelSeries['key']; label: string }[] = [
  { key: 'nucleaire', label: 'Nucléaire' },
  { key: 'hydraulique', label: 'Hydraulique' },
  { key: 'gaz', label: 'Gaz' },
  { key: 'eolien', label: 'Éolien' },
  { key: 'solaire', label: 'Solaire' },
  { key: 'bioenergies', label: 'Bioénergies' },
  { key: 'charbon', label: 'Charbon' },
  { key: 'fioul', label: 'Fioul' },
]

const fuels = (colors: readonly string[]): readonly FuelSeries[] =>
  FUEL_LABELS.map((f, i) => ({ ...f, color: colors[i] ?? '#000000' }))

const light: Palette = {
  surfaces: {
    abyss: '#f4f6fa',
    panel: '#ffffff',
    raised: '#f0f3f8',
    line: '#e3e8ef',
    lineStrong: '#c9d3df',
    grid: '#eef1f6',
  },
  ink: { hi: '#0b1b2b', mid: '#4b5b6e', low: '#5f6f82' },
  accent: '#1f5af5',
  forecastToday: '#5b8def',
  forecastDayBefore: '#8593a5',
  tooltipBackground: 'rgba(255, 255, 255, 0.96)',
  importFlow: '#6b8798',
  neutralArea: '#e6ebf2',
  accentRgb: '31, 90, 245',
  importFlowRgb: '107, 135, 152',
  fuels: fuels([
    '#c8930c',
    '#2e7bc9',
    '#c7477a',
    '#1b9aae',
    '#d4791a',
    '#0f7a48',
    '#3f4e5e',
    '#8e63b5',
  ]),
}

const dark: Palette = {
  surfaces: {
    abyss: '#0a1216',
    panel: '#101b21',
    raised: '#16242c',
    line: '#223440',
    lineStrong: '#31485a',
    grid: '#1a2932',
  },
  ink: { hi: '#eaf3f6', mid: '#9db4be', low: '#7b96a4' },
  accent: '#2ee6ff',
  forecastToday: '#77b6c6',
  forecastDayBefore: '#7b96a4',
  tooltipBackground: 'rgba(10, 18, 22, 0.94)',
  importFlow: '#678c9f',
  neutralArea: '#12212a',
  accentRgb: '46, 230, 255',
  importFlowRgb: '103, 140, 159',
  fuels: fuels([
    '#b58c15',
    '#287ab5',
    '#c65860',
    '#2ca893',
    '#c06a01',
    '#0f8354',
    '#9e6d04',
    '#986eb9',
  ]),
}

export const PALETTES: Record<Theme, Palette> = { light, dark }

export function paletteFor(theme: Theme): Palette {
  return PALETTES[theme]
}

/* Exports nommés : le thème jour, défaut de l'application et des tests. */
export const surfaces = light.surfaces
export const ink = light.ink
export const accent = light.accent
export const forecastToday = light.forecastToday
export const forecastDayBefore = light.forecastDayBefore
export const FUELS: readonly FuelSeries[] = light.fuels
