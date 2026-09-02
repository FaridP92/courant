/** Statistiques d'une série de consommation, null-honnêtes (les trous ne
 * deviennent jamais des zéros, une série vide ne produit aucune statistique). */

export interface SeriesStats {
  average: number
  peak: { value: number; ts: string }
  low: { value: number; ts: string }
  count: number
}

export function seriesStats(
  points: readonly { ts: string; consommation: number | null }[],
): SeriesStats | null {
  let sum = 0
  let count = 0
  let peak: SeriesStats['peak'] | null = null
  let low: SeriesStats['low'] | null = null
  for (const p of points) {
    if (p.consommation === null) continue
    sum += p.consommation
    count += 1
    if (peak === null || p.consommation > peak.value) peak = { value: p.consommation, ts: p.ts }
    if (low === null || p.consommation < low.value) low = { value: p.consommation, ts: p.ts }
  }
  if (count === 0 || peak === null || low === null) return null
  return { average: sum / count, peak, low, count }
}

/** Coupe la queue de valeurs nulles (typiquement la fenêtre de prévisions pures
 * de v_national_24h) : les trous internes restent, la fin muette disparaît. */
export function trimTrailingGaps<T extends { consommation: number | null }>(
  points: readonly T[],
): T[] {
  let end = points.length
  while (end > 0) {
    const p = points[end - 1]
    if (p !== undefined && p.consommation !== null) break
    end -= 1
  }
  return points.slice(0, end)
}

/** Fenêtre glissante ancrée sur le dernier point de la série (jamais sur l'horloge
 * du rendu : une source en retard garde une fenêtre honnête). */
export function windowFromLast<T extends { ts: string }>(points: readonly T[], hours: number): T[] {
  const last = points[points.length - 1]
  if (last === undefined) return []
  const floor = Date.parse(last.ts) - hours * 3600 * 1000
  return points.filter((p) => Date.parse(p.ts) >= floor)
}

/** Une plage continue de dépassement d'un seuil, bornée par des mesures réelles. */
export interface ExceedanceBand {
  from: string
  to: string
  /** Valeur la plus haute atteinte dans la plage. */
  peak: number
  /** Nombre de pas mesurés au-dessus du seuil. */
  count: number
}

/** Plages où la valeur dépasse strictement le seuil. Un trou (null) referme la plage
 * en cours : on ne relie jamais deux dépassements par-dessus une donnée absente. */
export function exceedanceBands(
  points: readonly { ts: string; value: number | null }[],
  threshold: number,
): ExceedanceBand[] {
  const bands: ExceedanceBand[] = []
  let current: ExceedanceBand | null = null
  for (const point of points) {
    if (point.value === null || point.value <= threshold) {
      current = null
      continue
    }
    if (current === null) {
      current = { from: point.ts, to: point.ts, peak: point.value, count: 1 }
      bands.push(current)
      continue
    }
    current.to = point.ts
    current.peak = Math.max(current.peak, point.value)
    current.count += 1
  }
  return bands
}
