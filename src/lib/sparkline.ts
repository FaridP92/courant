/**
 * Mini-courbes SVG des cartes KPI : un chemin, zéro dépendance.
 * Les valeurs null (télémétrie en retard) sont simplement omises, jamais interpolées,
 * et l'aire de remplissage se referme à l'abscisse du dernier point réel : on ne
 * dessine jamais de pente inventée jusqu'au bord de la boîte.
 */

export interface SparklineBox {
  width: number
  height: number
}

export interface SparklinePaths {
  linePath: string
  areaPath: string
}

export function buildSparkline(
  values: readonly (number | null)[],
  box: SparklineBox,
): SparklinePaths | null {
  const points = values
    .map((value, index) => ({ value, index }))
    .filter((p): p is { value: number; index: number } => p.value !== null)
  if (points.length < 2) return null

  const min = Math.min(...points.map((p) => p.value))
  const max = Math.max(...points.map((p) => p.value))
  const span = max - min || 1
  const pad = span * 0.15

  const x = (index: number) => (index / (values.length - 1)) * box.width
  const y = (value: number) => box.height - ((value - min + pad) / (span + 2 * pad)) * box.height

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.index).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join('')

  const firstPoint = points[0]
  const lastPoint = points[points.length - 1]
  if (firstPoint === undefined || lastPoint === undefined) return null
  const firstX = x(firstPoint.index).toFixed(1)
  const lastX = x(lastPoint.index).toFixed(1)
  const areaPath = `${linePath}L${lastX} ${String(box.height)}L${firstX} ${String(box.height)}Z`

  return { linePath, areaPath }
}
