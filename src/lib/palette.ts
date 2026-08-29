/**
 * Miroir JavaScript des tokens de src/styles/tokens.css pour ECharts et les SVG.
 * Source de vérité : tokens.css (palette filières validée, docs/design/palette-validation.md).
 * Toute évolution se fait dans tokens.css PUIS ici, à l'identique.
 */

export const surfaces = {
  abyss: '#0a1216',
  panel: '#101b21',
  raised: '#16242c',
  line: '#223440',
  grid: '#1a2932',
} as const

export const ink = {
  hi: '#eaf3f6',
  mid: '#9db4be',
  low: '#7b96a4',
} as const

export const accent = '#2ee6ff'
export const forecastToday = '#77b6c6'
export const forecastDayBefore = '#7b96a4'

export interface FuelSeries {
  key:
    'nucleaire' | 'hydraulique' | 'gaz' | 'eolien' | 'solaire' | 'bioenergies' | 'charbon' | 'fioul'
  label: string
  color: string
}

/** Ordre d'empilement validé (paires adjacentes contrôlées au daltonisme). */
export const FUELS: readonly FuelSeries[] = [
  { key: 'nucleaire', label: 'Nucléaire', color: '#b58c15' },
  { key: 'hydraulique', label: 'Hydraulique', color: '#287ab5' },
  { key: 'gaz', label: 'Gaz', color: '#c65860' },
  { key: 'eolien', label: 'Éolien', color: '#2ca893' },
  { key: 'solaire', label: 'Solaire', color: '#c06a01' },
  { key: 'bioenergies', label: 'Bioénergies', color: '#0f8354' },
  { key: 'charbon', label: 'Charbon', color: '#9e6d04' },
  { key: 'fioul', label: 'Fioul', color: '#986eb9' },
] as const
