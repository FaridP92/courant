/**
 * Mises en évidence du graphe de consommation : plages où une grandeur dépasse le
 * seuil choisi. Calculées une fois, elles servent à la fois au graphe (zones ombrées)
 * et à sa légende (compte et pointe), qui ne peuvent donc pas se contredire.
 * Mettre en évidence n'est pas filtrer : la série garde tous ses points.
 */
import type { NationalPoint } from './api.ts'
import { forecastDeviation } from './energy.ts'
import { exceedanceBands, type ExceedanceBand } from './stats.ts'

export interface HeroThresholds {
  /** Intensité carbone, en g/kWh. */
  readonly co2: number | null
  /** Écart au programme J-1, en fraction (0,05 vaut 5 %). */
  readonly deviation: number | null
}

export interface HighlightSet {
  readonly co2: readonly ExceedanceBand[]
  readonly deviation: readonly ExceedanceBand[]
}

export const NO_HIGHLIGHTS: HighlightSet = { co2: [], deviation: [] }

export function heroHighlights(
  points: readonly NationalPoint[],
  thresholds: HeroThresholds,
): HighlightSet {
  return {
    co2:
      thresholds.co2 === null
        ? []
        : exceedanceBands(
            points.map((p) => ({ ts: p.ts, value: p.taux_co2 })),
            thresholds.co2,
          ),
    deviation:
      thresholds.deviation === null
        ? []
        : exceedanceBands(
            points.map((p) => ({ ts: p.ts, value: forecastDeviation(p) })),
            thresholds.deviation,
          ),
  }
}

export interface HighlightSummary {
  /** Pas mesurés au-dessus du seuil. */
  readonly steps: number
  /** Valeur la plus haute atteinte, dans l'unité de la grandeur. */
  readonly peak: number
}

export function highlightSummary(bands: readonly ExceedanceBand[]): HighlightSummary {
  return {
    steps: bands.reduce((total, band) => total + band.count, 0),
    peak: bands.reduce((peak, band) => Math.max(peak, band.peak), 0),
  }
}
