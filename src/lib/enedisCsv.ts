/**
 * Lecture locale de l'export « courbe de charge » de l'espace client Enedis
 * (ADR-0009). Le fichier ne quitte jamais le navigateur. Format constaté sur
 * les exports manuels : une ligne d'en-tête « horodate ISO fin de pas ;
 * puissance moyenne (W) », puis une ligne par pas (30 min en général) avec
 * l'horodatage de FIN de pas et la puissance moyenne en watts.
 * Énergie du pas = puissance × durée ; on réattribue chaque énergie au DÉBUT
 * du pas pour que les plages heures creuses et le calendrier Tempo tombent
 * sur la bonne heure et le bon jour.
 * Toute unité non reconnue est refusée : on n'estime pas.
 */
import type { Reading } from './tariffs.ts'

export interface EnedisCurve {
  kind: 'curve'
  stepMinutes: number
  readings: Reading[]
  totalKwh: number
  from: string
  to: string
  skippedRows: number
}

export type EnedisParseOutcome = { ok: true; result: EnedisCurve } | { ok: false; reason: string }

const NEED_CURVE =
  "Ce fichier n'est pas une courbe de charge Enedis (puissance moyenne par pas de 30 min). " +
  "Depuis l'espace client Enedis, téléchargez vos données au pas de 30 minutes."

const parseNumber = (raw: string): number | null => {
  const cleaned = raw.trim().replace(/\s/g, '').replace(',', '.')
  if (cleaned === '') return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

export function parseEnedisCsv(text: string): EnedisParseOutcome {
  const lines = text.split(/\r?\n/)
  const headerIndex = lines.findIndex((line) => /horodate/i.test(line))
  if (headerIndex === -1) return { ok: false, reason: NEED_CURVE }
  const header = lines[headerIndex] ?? ''
  if (!/puissance/i.test(header) || !/\(W\)/i.test(header)) {
    return { ok: false, reason: NEED_CURVE }
  }

  const raw: { endMs: number; watts: number }[] = []
  // la grille temporelle se déduit de TOUS les horodatages lisibles, même quand la
  // valeur manque : une mesure absente ne doit pas faire croire à un pas plus long
  const gridMs: number[] = []
  let skippedRows = 0
  for (const line of lines.slice(headerIndex + 1)) {
    if (line.trim() === '') continue
    const [tsCell, valueCell] = line.split(';')
    const endMs = tsCell === undefined ? Number.NaN : Date.parse(tsCell.trim())
    const watts = valueCell === undefined ? null : parseNumber(valueCell)
    if (!Number.isNaN(endMs)) gridMs.push(endMs)
    if (Number.isNaN(endMs) || watts === null) {
      skippedRows += 1
      continue
    }
    raw.push({ endMs, watts })
  }
  if (raw.length < 2) {
    return { ok: false, reason: 'Trop peu de mesures exploitables pour calculer un coût.' }
  }
  raw.sort((a, b) => a.endMs - b.endMs)
  gridMs.sort((a, b) => a - b)

  // le pas est le plus petit écart entre deux horodatages consécutifs (30 min attendu)
  let stepMs = Number.POSITIVE_INFINITY
  for (let i = 1; i < gridMs.length; i += 1) {
    const current = gridMs[i]
    const previous = gridMs[i - 1]
    if (current === undefined || previous === undefined) continue
    const gap = current - previous
    if (gap > 0 && gap < stepMs) stepMs = gap
  }
  if (!Number.isFinite(stepMs) || stepMs > 60 * 60 * 1000) {
    return { ok: false, reason: NEED_CURVE }
  }
  const stepHours = stepMs / 3_600_000

  const readings: Reading[] = raw.map((r) => ({
    ts: new Date(r.endMs - stepMs).toISOString(),
    kwh: (r.watts * stepHours) / 1000,
  }))
  const first = readings[0]
  const last = readings[readings.length - 1]
  if (first === undefined || last === undefined) {
    return { ok: false, reason: 'Trop peu de mesures exploitables pour calculer un coût.' }
  }
  return {
    ok: true,
    result: {
      kind: 'curve',
      stepMinutes: Math.round(stepMs / 60_000),
      readings,
      totalKwh: readings.reduce((s, r) => s + r.kwh, 0),
      from: first.ts,
      to: last.ts,
      skippedRows,
    },
  }
}
