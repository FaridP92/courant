/**
 * Calculs tarifaires « Compare ta conso » (ADR-0009), exécutés dans le navigateur.
 * Tout est TTC, arrondi au centime. Aucune estimation sur profil type : si un prix
 * manque ou si la donnée ne permet pas un calcul exact, on renvoie null et l'UI le dit.
 */
import type { PriceGrid, TempoColor } from './api.ts'

export interface CostBreakdown {
  /** Abonnement TTC sur la période calculée. */
  subscription: number
  /** Coût des kWh TTC. */
  energy: number
  total: number
}

/** Plage d'heures creuses [from, to) en minutes depuis minuit, heure de Paris ;
 * peut traverser minuit. Une plage vide (from === to) n'est pas valide. */
export interface OffPeakWindow {
  from: number
  to: number
}

const MINUTES_PER_DAY = 24 * 60

/** Heures creuses de l'option Tempo : fixées par le tarif réglementé, 22 h à 6 h. */
export const TEMPO_OFF_PEAK: readonly OffPeakWindow[] = [{ from: 22 * 60, to: 6 * 60 }]

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

/** Les deux postes sont arrondis d'abord, le total est leur somme : les trois
 * colonnes affichées s'additionnent toujours. */
function breakdown(subscription: number, energy: number): CostBreakdown {
  const sub = round2(subscription)
  const nrg = round2(energy)
  return { subscription: sub, energy: nrg, total: round2(sub + nrg) }
}

/** Un prix absent, null ou non fini vaut « pas de calcul », jamais 0. */
function priceOf(tariff: PriceGrid, key: string): number | null {
  const price: unknown = tariff.prices_ttc[key]
  return typeof price === 'number' && Number.isFinite(price) ? price : null
}

export function computeBase(kwh: number, tariff: PriceGrid): CostBreakdown | null {
  const price = priceOf(tariff, 'base')
  if (price === null) return null
  return breakdown(tariff.fixed_ttc, kwh * price)
}

export function computeHphc(
  split: { hp: number; hc: number },
  tariff: PriceGrid,
): CostBreakdown | null {
  const hp = priceOf(tariff, 'hp')
  const hc = priceOf(tariff, 'hc')
  if (hp === null || hc === null) return null
  return breakdown(tariff.fixed_ttc, split.hp * hp + split.hc * hc)
}

export function computeTempo(buckets: TempoBuckets, tariff: PriceGrid): CostBreakdown | null {
  let energy = 0
  for (const key of Object.keys(EMPTY_TEMPO_BUCKETS) as TempoBucket[]) {
    const price = priceOf(tariff, key)
    if (price === null) return null
    energy += buckets[key] * price
  }
  return breakdown(tariff.fixed_ttc, energy)
}

/** « HH:MM » en minutes depuis minuit, null si illisible. */
export function minutesOfDay(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (match === null) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

export function isValidWindow(window: OffPeakWindow): boolean {
  const inDay = (m: number) => Number.isInteger(m) && m >= 0 && m < MINUTES_PER_DAY
  return inDay(window.from) && inDay(window.to) && window.from !== window.to
}

export function isInOffPeak(minutes: number, windows: readonly OffPeakWindow[]): boolean {
  return windows.some((w) => {
    if (!isValidWindow(w)) return false
    return w.from < w.to ? minutes >= w.from && minutes < w.to : minutes >= w.from || minutes < w.to
  })
}

const parisDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const parisClock = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
})

/** Jour civil et minute de la journée en heure de Paris : le calendrier Tempo et
 * les plages HC vivent dans ce fuseau, jamais en UTC. Lecture par formatToParts :
 * le format texte français ajoute « h » et des séparateurs. */
export function parisParts(ts: string): { day: string; minutes: number } {
  const date = new Date(ts)
  let hour = Number.NaN
  let minute = Number.NaN
  for (const part of parisClock.formatToParts(date)) {
    if (part.type === 'hour') hour = Number(part.value)
    if (part.type === 'minute') minute = Number(part.value)
  }
  return { day: parisDay.format(date), minutes: hour * 60 + minute }
}

export function splitHphc(
  readings: readonly Reading[],
  windows: readonly OffPeakWindow[],
): { hp: number; hc: number } {
  let hp = 0
  let hc = 0
  for (const r of readings) {
    if (isInOffPeak(parisParts(r.ts).minutes, windows)) hc += r.kwh
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
 * couleurs et les heures creuses réglementaires de l'option. Les jours sans
 * couleur connue sont comptés à part : jamais estimés. */
export function splitByTempo(
  readings: readonly Reading[],
  calendar: ReadonlyMap<string, TempoColor>,
  windows: readonly OffPeakWindow[] = TEMPO_OFF_PEAK,
): { buckets: TempoBuckets; uncoveredKwh: number } {
  const buckets: TempoBuckets = { ...EMPTY_TEMPO_BUCKETS }
  let uncoveredKwh = 0
  for (const r of readings) {
    const { day, minutes } = parisParts(r.ts)
    const color = calendar.get(day)
    if (color === undefined) {
      uncoveredKwh += r.kwh
      continue
    }
    const target = BUCKET_BY_COLOR[color]
    buckets[isInOffPeak(minutes, windows) ? target.hc : target.hp] += r.kwh
  }
  return { buckets, uncoveredKwh }
}

/** Fourchette de coût quand la donnée ne permet pas de séparer heures pleines et
 * heures creuses (export quotidien) : du tout-heures-creuses au tout-heures-pleines.
 * Ce sont des bornes exactes, pas une estimation. */
export interface CostRange {
  subscription: number
  energyMin: number
  energyMax: number
  totalMin: number
  totalMax: number
}

function range(subscription: number, energyMin: number, energyMax: number): CostRange {
  const sub = round2(subscription)
  const lo = round2(Math.min(energyMin, energyMax))
  const hi = round2(Math.max(energyMin, energyMax))
  return {
    subscription: sub,
    energyMin: lo,
    energyMax: hi,
    totalMin: round2(sub + lo),
    totalMax: round2(sub + hi),
  }
}

export function rangeHphc(kwh: number, tariff: PriceGrid): CostRange | null {
  const hp = priceOf(tariff, 'hp')
  const hc = priceOf(tariff, 'hc')
  if (hp === null || hc === null) return null
  return range(tariff.fixed_ttc, kwh * hc, kwh * hp)
}

/** Une énergie par jour civil Paris (« YYYY-MM-DD »). */
export interface DailyReading {
  day: string
  kwh: number
}

/** Bornes Tempo depuis des totaux quotidiens : la couleur du jour est connue, la part
 * HP/HC ne l'est pas. Les jours sans couleur connue sont comptés à part, jamais estimés. */
export function rangeTempoDaily(
  days: readonly DailyReading[],
  calendar: ReadonlyMap<string, TempoColor>,
  tariff: PriceGrid,
): { range: CostRange; uncoveredKwh: number } | null {
  let min = 0
  let max = 0
  let uncoveredKwh = 0
  for (const d of days) {
    const color = calendar.get(d.day)
    if (color === undefined) {
      uncoveredKwh += d.kwh
      continue
    }
    const target = BUCKET_BY_COLOR[color]
    const hp = priceOf(tariff, target.hp)
    const hc = priceOf(tariff, target.hc)
    if (hp === null || hc === null) return null
    // bornes exactes jour par jour, même si une grille avait un prix HC supérieur au HP
    min += d.kwh * Math.min(hp, hc)
    max += d.kwh * Math.max(hp, hc)
  }
  return { range: range(tariff.fixed_ttc, min, max), uncoveredKwh }
}

/** Nombre de jours civils entre deux jours « YYYY-MM-DD » inclus. */
export function calendarDaysInclusive(firstDay: string, lastDay: string): number {
  const span =
    (Date.parse(`${lastDay}T00:00:00Z`) - Date.parse(`${firstDay}T00:00:00Z`)) / 86_400_000
  return Math.max(1, Math.round(span) + 1)
}

/** Durée couverte en jours (fractionnaire) entre deux instants ISO. */
export function coveredDays(fromIso: string, toIso: string): number {
  return Math.max(0, (Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000)
}

/** Longueur de l'année de référence pour un prorata : 366 si la période
 * contient un 29 février, 365 sinon. Approximation assumée : une période d'année
 * bissextile qui évite le 29 février est proratisée sur 365 jours, soit un
 * abonnement surévalué d'au plus 0,3 % ; l'abonnement réglementé étant facturé
 * par jour selon le fournisseur, aucune règle n'est exacte pour tous. */
export function yearLengthFor(fromIso: string, toIso: string): 365 | 366 {
  const from = new Date(fromIso)
  const to = new Date(toIso)
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear(); year += 1) {
    const leapDay = Date.UTC(year, 1, 29)
    if (new Date(leapDay).getUTCMonth() !== 1) continue
    if (leapDay >= from.getTime() && leapDay <= to.getTime()) return 366
  }
  return 365
}
