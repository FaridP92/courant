/**
 * Lecture locale des exports de l'espace client Enedis (ADR-0009). Le fichier ne
 * quitte jamais le navigateur. Deux natures de données, deux formats de fichier :
 *  - la courbe de charge (puissance moyenne par pas de 30 min, horodatage = FIN du
 *    pas) : l'énergie est réattribuée au DÉBUT du pas, pour que plages heures
 *    creuses et calendrier Tempo tombent sur la bonne heure et le bon jour ;
 *  - la consommation quotidienne (kWh par jour civil), qui ne permet pas de séparer
 *    heures pleines et heures creuses : l'UI affiche alors des bornes, pas une valeur.
 * Fichiers : CSV (« ; », décimales françaises) ou classeur .xlsx (feuille « Export
 * Consommation ... » avec préambule PRM / Type de comptage puis en-tête de colonnes).
 * Tout ce qui empêche un calcul exact est refusé : on n'estime pas.
 */
import type { DailyReading, Reading } from './tariffs.ts'
import { calendarDaysInclusive } from './tariffs.ts'
import { looksLikeXlsx, readXlsx, XlsxError, type CellValue, type InflateRaw } from './xlsx.ts'

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

export interface EnedisDaily {
  kind: 'daily'
  /** Un total par jour civil Paris, trié. */
  days: DailyReading[]
  totalKwh: number
  firstDay: string
  lastDay: string
  /** Jours civils entre le premier et le dernier inclus : la période de l'abonnement. */
  dayCount: number
  skippedRows: number
}

export type EnedisData = EnedisCurve | EnedisDaily

export type EnedisParseOutcome = { ok: true; result: EnedisData } | { ok: false; reason: string }

type Unit = 'W' | 'Wh' | 'kWh'

const NEED_EXPORT =
  "Ce fichier n'est pas un export Enedis reconnu : courbe de charge (puissance moyenne par pas de " +
  '30 min) ou consommation quotidienne (kWh par jour). Depuis l’espace client Enedis : ' +
  'Suivre mes mesures, puis Télécharger mes données.'

const refuse = (reason: string): EnedisParseOutcome => ({ ok: false, reason })

const text = (cell: CellValue | undefined): string =>
  cell === null || cell === undefined ? '' : String(cell).trim()

const normalize = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const parseNumber = (cell: CellValue | undefined): number | null => {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null
  const cleaned = text(cell).replace(/\s/g, '').replace(',', '.')
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

const unitInHeader = (header: string): Unit | null => {
  const match = /\(\s*(?:en\s+)?(k?wh?)\s*\)/i.exec(header)
  return match?.[1] === undefined ? null : unitFrom(match[1])
}

/** Valeur associée à un libellé de préambule. Classeur Enedis : « Type de comptage : »
 * puis la valeur dans la cellule suivante. CSV : une ligne de libellés sans deux-points,
 * la valeur dans la même colonne de la ligne suivante. */
function preambleValue(rows: readonly CellValue[][], before: number, label: string): string | null {
  for (let i = 0; i < before; i += 1) {
    const row = rows[i] ?? []
    const idx = row.findIndex((c) => normalize(text(c)).startsWith(label))
    if (idx === -1) continue
    const cell = text(row[idx])
    const value = /:\s*$/.test(cell)
      ? row.slice(idx + 1).find((c) => text(c) !== '')
      : rows[i + 1]?.[idx]
    return value === undefined || text(value) === '' ? null : text(value)
  }
  return null
}

/** « dd/mm/yyyy », « yyyy-mm-dd » ou numéro de série Excel → « YYYY-MM-DD ». */
function parseDay(cell: CellValue | undefined): string | null {
  if (typeof cell === 'number' && Number.isFinite(cell)) {
    // les dates Excel comptent les jours depuis le 30/12/1899
    const ms = Date.UTC(1899, 11, 30) + Math.round(cell) * 86_400_000
    return new Date(ms).toISOString().slice(0, 10)
  }
  const s = text(cell)
  const fr = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s)
  if (fr !== null) return `${fr[3] ?? ''}-${fr[2] ?? ''}-${fr[1] ?? ''}`
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(s)
  if (iso !== null) return iso[1] ?? null
  return null
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

function parseCurve(
  rows: readonly CellValue[][],
  headerIndex: number,
  tsCol: number,
  valueCol: number,
  unit: Unit,
): EnedisParseOutcome {
  const raw: { endMs: number; value: number }[] = []
  // la grille temporelle se déduit de TOUS les horodatages lisibles, même quand la
  // valeur manque : une mesure absente ne doit pas faire croire à un pas plus long
  const gridMs = new Set<number>()
  let skippedRows = 0
  for (const row of rows.slice(headerIndex + 1)) {
    if (row.every((c) => text(c) === '')) continue
    const endMs = Date.parse(text(row[tsCol]))
    const value = parseNumber(row[valueCol])
    if (!Number.isNaN(endMs)) gridMs.add(endMs)
    if (Number.isNaN(endMs) || value === null || value < 0) {
      skippedRows += 1
      continue
    }
    raw.push({ endMs, value })
  }
  if (raw.length === 0) return refuse(NEED_EXPORT)
  raw.sort((a, b) => a.endMs - b.endMs)

  // doublons d'horodatage : une seule mesure par pas, les autres sont comptées
  const unique: { endMs: number; value: number }[] = []
  for (const r of raw) {
    if (unique[unique.length - 1]?.endMs === r.endMs) skippedRows += 1
    else unique.push(r)
  }
  if (unique.length < 2) return refuse('Trop peu de mesures exploitables pour calculer un coût.')

  const grid = [...gridMs].sort((a, b) => a - b)
  const stepMs = dominantGap(grid)
  if (stepMs === null || stepMs <= 0 || stepMs > 60 * 60 * 1000) return refuse(NEED_EXPORT)
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
  if (first === undefined || last === undefined) return refuse(NEED_EXPORT)
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

function parseDaily(
  rows: readonly CellValue[][],
  headerIndex: number,
  dayCol: number,
  valueCol: number,
  unit: Unit,
): EnedisParseOutcome {
  if (unit === 'W') return refuse(NEED_EXPORT)
  const byDay = new Map<string, number>()
  let skippedRows = 0
  for (const row of rows.slice(headerIndex + 1)) {
    if (row.every((c) => text(c) === '')) continue
    const day = parseDay(row[dayCol])
    const value = parseNumber(row[valueCol])
    if (day === null || value === null || value < 0 || byDay.has(day)) {
      skippedRows += 1
      continue
    }
    byDay.set(day, unit === 'Wh' ? value / 1000 : value)
  }
  const days: DailyReading[] = [...byDay.entries()]
    .map(([day, kwh]) => ({ day, kwh }))
    .sort((a, b) => (a.day < b.day ? -1 : 1))
  const first = days[0]
  const last = days[days.length - 1]
  if (first === undefined || last === undefined) return refuse(NEED_EXPORT)
  const totalKwh = days.reduce((s, d) => s + d.kwh, 0)
  if (!(totalKwh > 0)) return refuse('Aucune consommation positive dans ce fichier.')
  return {
    ok: true,
    result: {
      kind: 'daily',
      days,
      totalKwh,
      firstDay: first.day,
      lastDay: last.day,
      dayCount: calendarDaysInclusive(first.day, last.day),
      skippedRows,
    },
  }
}

/** Cœur commun : des lignes de cellules, quelle que soit leur origine (CSV ou classeur). */
export function parseEnedisRows(rows: readonly CellValue[][]): EnedisParseOutcome {
  const normalized = rows.map((row) => row.map((c) => normalize(text(c))))
  const curveHeader = normalized.findIndex((row) => row.some((c) => c.startsWith('horodate')))
  const dailyHeader = normalized.findIndex(
    (row) => row.includes('date') && row.some((c) => c.includes('valeur')),
  )
  const headerIndex = curveHeader !== -1 ? curveHeader : dailyHeader
  if (headerIndex === -1) return refuse(NEED_EXPORT)

  const kind =
    preambleValue(rows, headerIndex, 'type de comptage') ??
    preambleValue(rows, headerIndex, 'type de donnees')
  if (kind !== null && normalize(kind).includes('production')) {
    return refuse('Ce fichier contient une production, pas une consommation.')
  }
  if (kind !== null && curveHeader === -1 && !normalize(kind).includes('quotidien')) {
    return refuse(NEED_EXPORT)
  }

  const header = normalized[headerIndex] ?? []
  const headerText = (rows[headerIndex] ?? []).map(text).join(';')
  const valueCol = header.findIndex((c) => c.includes('puissance') || c.includes('valeur'))
  const unit = unitInHeader(headerText) ?? unitFrom(preambleValue(rows, headerIndex, 'unite') ?? '')
  if (unit === null || valueCol === -1) return refuse(NEED_EXPORT)

  if (curveHeader !== -1) {
    const tsCol = header.findIndex((c) => c.startsWith('horodate'))
    return parseCurve(rows, headerIndex, tsCol, valueCol, unit)
  }
  return parseDaily(rows, headerIndex, header.indexOf('date'), valueCol, unit)
}

export function parseEnedisCsv(rawText: string): EnedisParseOutcome {
  const lines = rawText.replace(/^\uFEFF/, '').split(/\r?\n/)
  const rows: CellValue[][] = lines.map((line) => line.split(';').map((c) => c.trim()))
  return parseEnedisRows(rows)
}

export async function parseEnedisXlsx(
  buffer: ArrayBuffer,
  inflateRaw?: InflateRaw,
): Promise<EnedisParseOutcome> {
  let sheets
  try {
    sheets = await readXlsx(buffer, inflateRaw)
  } catch (error) {
    return refuse(error instanceof XlsxError ? error.message : NEED_EXPORT)
  }
  let specific: EnedisParseOutcome | null = null
  for (const sheet of sheets) {
    const outcome = parseEnedisRows(sheet.rows)
    if (outcome.ok) return outcome
    // une feuille reconnue mais refusée pour une raison précise vaut mieux que le message générique
    if (outcome.reason !== NEED_EXPORT) specific ??= outcome
  }
  return specific ?? refuse(NEED_EXPORT)
}

/** Point d'entrée depuis un fichier lu en mémoire : classeur si signature zip, sinon texte. */
export async function parseEnedisBuffer(buffer: ArrayBuffer): Promise<EnedisParseOutcome> {
  if (looksLikeXlsx(buffer)) return parseEnedisXlsx(buffer)
  return parseEnedisCsv(new TextDecoder('utf-8').decode(buffer))
}
