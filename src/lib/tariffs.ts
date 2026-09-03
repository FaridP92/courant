/**
 * Calculs tarifaires « Compare ta conso » (ADR-0009), exécutés dans le navigateur.
 * Tout est TTC, arrondi au centime. Aucune estimation sur profil type : si un prix
 * manque ou si la donnée ne permet pas un calcul exact, on renvoie null et l'UI le dit.
 */
import type { TempoColor, TrvTariff } from './api.ts'

export interface CostBreakdown {
  /** Abonnement annuel TTC. */
  subscription: number
  /** Coût des kWh TTC. */
  energy: number
  total: number
}

/** Plage d'heures creuses [from, to) en heures de Paris ; peut traverser minuit. */
export interface OffPeakWindow {
  from: number
  to: number
}

/** Une énergie consommée sur un pas, horodatée au DÉBUT du pas (ISO). */
export interface Reading {
  ts: string
  kwh: number
}

export type TempoBucket = 'hp_bleu' | 'hc_bleu' | 'hp_blanc' | 'hc_blanc' | 'hp_rouge' | 'hc_rouge'
export type TempoBuckets = Record<TempoBucket, number>

export const EMPTY_TEMPO_BUCKETS: TempoBuckets = {
  hp_bleu: 0,
  hc_bleu: 0,
  hp_blanc: 0,
  hc_blanc: 0,
  hp_rouge: 0,
  hc_rouge: 0,
}

const round2 = (n: number): number => Math.round(n * 100) / 100

function breakdown(subscription: number, energy: number): CostBreakdown {
  return {
    subscription: round2(subscription),
    energy: round2(energy),
    total: round2(subscription + energy),
  }
}

export function computeBase(kwh: number, tariff: TrvTariff): CostBreakdown | null {
  const price = tariff.prices_ttc.base
  if (price === undefined) return null
  return breakdown(tariff.fixed_ttc, kwh * price)
}

export function computeHphc(
  split: { hp: number; hc: number },
  tariff: TrvTariff,
): CostBreakdown | null {
  const hp = tariff.prices_ttc.hp
  const hc = tariff.prices_ttc.hc
  if (hp === undefined || hc === undefined) return null
  return breakdown(tariff.fixed_ttc, split.hp * hp + split.hc * hc)
}

export function computeTempo(buckets: TempoBuckets, tariff: TrvTariff): CostBreakdown | null {
  let energy = 0
  for (const key of Object.keys(EMPTY_TEMPO_BUCKETS) as TempoBucket[]) {
    const price = tariff.prices_ttc[key]
    if (price === undefined) return null
    energy += buckets[key] * price
  }
  return breakdown(tariff.fixed_ttc, energy)
}

export function isInOffPeak(hour: number, windows: readonly OffPeakWindow[]): boolean {
  return windows.some((w) =>
    w.from < w.to ? hour >= w.from && hour < w.to : hour >= w.from || hour < w.to,
  )
}

const parisDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const parisHour = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: 'numeric',
  hourCycle: 'h23',
})

/** Jour civil et heure de Paris d'un horodatage : le calendrier Tempo et les
 * plages HC vivent dans ce fuseau, jamais en UTC. L'heure se lit par
 * formatToParts : le format texte ajoute « h » en français. */
export function parisParts(ts: string): { day: string; hour: number } {
  const date = new Date(ts)
  const hourPart = parisHour.formatToParts(date).find((p) => p.type === 'hour')
  return { day: parisDay.format(date), hour: Number(hourPart?.value ?? Number.NaN) }
}

export function sumKwh(readings: readonly Reading[]): number {
  return readings.reduce((s, r) => s + r.kwh, 0)
}

export function splitHphc(
  readings: readonly Reading[],
  windows: readonly OffPeakWindow[],
): { hp: number; hc: number } {
  let hp = 0
  let hc = 0
  for (const r of readings) {
    if (isInOffPeak(parisParts(r.ts).hour, windows)) hc += r.kwh
    else hp += r.kwh
  }
  return { hp, hc }
}

const BUCKET_BY_COLOR: Record<TempoColor, { hp: TempoBucket; hc: TempoBucket }> = {
  BLUE: { hp: 'hp_bleu', hc: 'hc_bleu' },
  WHITE: { hp: 'hp_blanc', hc: 'hc_blanc' },
  RED: { hp: 'hp_rouge', hc: 'hc_rouge' },
}

/** Répartit les kWh dans les six paniers Tempo depuis le calendrier RÉEL des
 * couleurs. Les jours sans couleur connue sont comptés à part : jamais estimés. */
export function splitByTempo(
  readings: readonly Reading[],
  calendar: ReadonlyMap<string, TempoColor>,
  windows: readonly OffPeakWindow[],
): { buckets: TempoBuckets; uncoveredKwh: number } {
  const buckets: TempoBuckets = { ...EMPTY_TEMPO_BUCKETS }
  let uncoveredKwh = 0
  for (const r of readings) {
    const { day, hour } = parisParts(r.ts)
    const color = calendar.get(day)
    if (color === undefined) {
      uncoveredKwh += r.kwh
      continue
    }
    const target = BUCKET_BY_COLOR[color]
    buckets[isInOffPeak(hour, windows) ? target.hc : target.hp] += r.kwh
  }
  return { buckets, uncoveredKwh }
}
