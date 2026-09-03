/**
 * Lecture locale de l'export « courbe de charge » de l'espace client Enedis
 * (ADR-0009). Le fichier ne quitte jamais le navigateur.
 * Deux dispositions rencontrées :
 *  - une ligne d'en-tête « horodate ISO fin de pas ; puissance moyenne (W) » ;
 *  - un préambule (Identifiant PRM ; Type de donnees ; ... ; Unite) suivi d'une
 *    ligne de valeurs, puis « Horodate ; Valeur ».
 * Dans les deux cas l'horodatage est la FIN du pas. Énergie du pas = puissance ×
 * durée ; chaque énergie est réattribuée au DÉBUT du pas pour que les plages
 * heures creuses et le calendrier Tempo tombent sur la bonne heure et le bon jour.
 * Tout ce qui empêche un calcul exact (unité inconnue, pas irrégulier, aucune
 * mesure positive) est refusé : on n'estime pas.
 */
import type { Reading } from './tariffs.ts'

export interface EnedisCurve {
  kind: 'curve'
  stepMinutes: number
  readings: Reading[]
  totalKwh: number
  /** Début du premier pas (ISO). */
  from: string
  /** Fin du dernier pas (ISO) : from → to est la durée réellement couverte. */
  to: string
  /** Lignes illisibles, négatives ou en double, écartées et comptées. */
  skippedRows: number
}

export type EnedisParseOutcome = { ok: true; result: EnedisCurve } | { ok: false; reason: string }

type Unit = 'W' | 'Wh' | 'kWh'

const NEED_CURVE =
  "Ce fichier n'est pas une courbe de charge Enedis (puissance moyenne par pas de 30 min). " +
  "Depuis l'espace client Enedis, téléchargez vos données au pas de 30 minutes."

const refuse = (reason: string): EnedisParseOutcome => ({ ok: false, reason })

const cells = (line: string): string[] => line.split(';').map((c) => c.trim())

const normalize = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

const parseNumber = (raw: string): number | null => {
  const cleaned = raw.trim().replace(/\s/g, '').replace(',', '.')
  if (cleaned === '') return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

const unitFrom = (raw: string): Unit | null => {
  const u = raw.trim().toLowerCase()
  if (u === 'w') return 'W'
  if (u === 'wh') return 'Wh'
  if (u === 'kwh') return 'kWh'
  return null
}

/** Unité et nature de la série, lues dans l'en-tête ou dans le préambule. */
function detectSeries(
  lines: readonly string[],
  headerIndex: number,
): { unit: Unit | null; isCurve: boolean } {
  const header = lines[headerIndex] ?? ''
  const inHeader = /\((k?wh?)\)/i.exec(header)
  if (inHeader?.[1] !== undefined) {
    const unit = unitFrom(inHeader[1])
    return { unit, isCurve: unit !== null }
  }
  // préambule : une ligne de noms (dont « Unite », « Type de donnees ») puis ses valeurs
  for (let i = 0; i < headerIndex; i += 1) {
    const names = cells(lines[i] ?? '').map(normalize)
    const unitIdx = names.indexOf('unite')
    if (unitIdx === -1) continue
    const values = cells(lines[i + 1] ?? '')
    const typeIdx = names.indexOf('type de donnees')
    const type = typeIdx === -1 ? null : normalize(values[typeIdx] ?? '')
    return {
      unit: unitFrom(values[unitIdx] ?? ''),
      isCurve: type === null || type.includes('courbe de charge'),
    }
  }
  return { unit: null, isCurve: false }
}

/** Écart le plus fréquent entre horodatages consécutifs. */
function dominantGap(sorted: readonly number[]): number | null {
  const counts = new Map<number, number>()
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = (sorted[i] ?? 0) - (sorted[i - 1] ?? 0)
    counts.set(gap, (counts.get(gap) ?? 0) + 1)
  }
  let best: number | null = null
  let bestCount = 0
  for (const [gap, count] of counts) {
    if (count > bestCount) {
      best = gap
      bestCount = count
    }
  }
  return best
}

export function parseEnedisCsv(rawText: string): EnedisParseOutcome {
  const lines = rawText.replace(/^\uFEFF/, '').split(/\r?\n/)
  const headerIndex = lines.findIndex((line) =>
    cells(line).some((c) => normalize(c).startsWith('horodate')),
  )
  if (headerIndex === -1) return refuse(NEED_CURVE)

  const headerCells = cells(lines[headerIndex] ?? '').map(normalize)
  const tsCol = headerCells.findIndex((c) => c.startsWith('horodate'))
  let valueCol = headerCells.findIndex((c) => c.includes('puissance') || c.includes('valeur'))
  if (valueCol === -1 && headerCells.length === 2) valueCol = tsCol === 0 ? 1 : 0
  if (valueCol === -1) return refuse(NEED_CURVE)

  const { unit, isCurve } = detectSeries(lines, headerIndex)
  if (unit === null || !isCurve) return refuse(NEED_CURVE)

  const raw: { endMs: number; value: number }[] = []
  // la grille temporelle se déduit de TOUS les horodatages lisibles, même quand la
  // valeur manque : une mesure absente ne doit pas faire croire à un pas plus long
  const gridMs = new Set<number>()
  let skippedRows = 0
  for (const line of lines.slice(headerIndex + 1)) {
    if (line.trim() === '') continue
    const row = cells(line)
    const endMs = Date.parse(row[tsCol] ?? '')
    const value = parseNumber(row[valueCol] ?? '')
    if (!Number.isNaN(endMs)) gridMs.add(endMs)
    if (Number.isNaN(endMs) || value === null || value < 0) {
      skippedRows += 1
      continue
    }
    raw.push({ endMs, value })
  }
  if (raw.length === 0) return refuse(NEED_CURVE)
  raw.sort((a, b) => a.endMs - b.endMs)

  // doublons d'horodatage : une seule mesure par pas, les autres sont comptées
  const unique: { endMs: number; value: number }[] = []
  for (const r of raw) {
    if (unique[unique.length - 1]?.endMs === r.endMs) skippedRows += 1
    else unique.push(r)
  }
  if (unique.length < 2) {
    return refuse('Trop peu de mesures exploitables pour calculer un coût.')
  }

  const grid = [...gridMs].sort((a, b) => a - b)
  const stepMs = dominantGap(grid)
  if (stepMs === null || stepMs <= 0 || stepMs > 60 * 60 * 1000) return refuse(NEED_CURVE)
  // un écart plus court que le pas trahit un fichier composite : refuser plutôt que
  // d'appliquer un pas faux à toutes les mesures
  for (let i = 1; i < grid.length; i += 1) {
    if ((grid[i] ?? 0) - (grid[i - 1] ?? 0) < stepMs) {
      return refuse(
        'Le pas de temps de ce fichier est irrégulier : impossible de calculer une énergie fiable.',
      )
    }
  }

  const stepHours = stepMs / 3_600_000
  const toKwh = (value: number): number => {
    if (unit === 'W') return (value * stepHours) / 1000
    if (unit === 'Wh') return value / 1000
    return value
  }
  const readings: Reading[] = unique.map((r) => ({
    ts: new Date(r.endMs - stepMs).toISOString(),
    kwh: toKwh(r.value),
  }))
  const totalKwh = readings.reduce((s, r) => s + r.kwh, 0)
  if (!(totalKwh > 0)) return refuse('Aucune consommation positive dans ce fichier.')

  const first = readings[0]
  const last = unique[unique.length - 1]
  if (first === undefined || last === undefined) return refuse(NEED_CURVE)
  return {
    ok: true,
    result: {
      kind: 'curve',
      stepMinutes: Math.round(stepMs / 60_000),
      readings,
      totalKwh,
      from: first.ts,
      to: new Date(last.endMs).toISOString(),
      skippedRows,
    },
  }
}
