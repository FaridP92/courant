import type { MetropolePoint } from './api.ts'

const DISPLAY_COUNT = 6

export interface MetroSeries {
  code: string
  name: string
  latest: number
  values: (number | null)[]
}

/** Regroupe la fenêtre 6 h par métropole et garde les plus consommatrices.
 * La clé est l'EPCI (un libellé peut changer en cours de fenêtre) et chaque série
 * est retriée par horodatage : PostgREST ne garantit pas l'ordre de la réponse. */
export function groupMetropoles(points: readonly MetropolePoint[]): MetroSeries[] {
  const byMetro = new Map<string, { name: string; rows: { ts: number; value: number | null }[] }>()
  for (const point of points) {
    const entry = byMetro.get(point.epci_code) ?? { name: point.name, rows: [] }
    entry.name = point.name
    entry.rows.push({ ts: Date.parse(point.ts), value: point.consommation })
    byMetro.set(point.epci_code, entry)
  }
  const result: MetroSeries[] = []
  for (const [code, { name, rows }] of byMetro) {
    rows.sort((a, b) => a.ts - b.ts)
    const values = rows.map((r) => r.value)
    const latest = [...values].reverse().find((v) => v !== null)
    if (latest === undefined) continue
    result.push({ code, name, latest, values })
  }
  return result.sort((a, b) => b.latest - a.latest).slice(0, DISPLAY_COUNT)
}
