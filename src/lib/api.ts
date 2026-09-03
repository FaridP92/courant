/**
 * Accès en lecture aux vues publiques PostgREST (contrat : supabase/migrations).
 * Pas de client Supabase complet : deux GET suffisent, et le bundle reste léger.
 */
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config.ts'

/** Une mesure nationale éCO2mix (MW ; taux_co2 en g/kWh ; ts en UTC). */
export interface NationalPoint {
  ts: string
  maturity: 'R' | 'C' | 'D'
  consommation: number | null
  prevision_j1: number | null
  prevision_j: number | null
  nucleaire: number | null
  hydraulique: number | null
  pompage: number | null
  eolien: number | null
  solaire: number | null
  gaz: number | null
  fioul: number | null
  charbon: number | null
  bioenergies: number | null
  ech_physiques: number | null
  taux_co2: number | null
}

/** Dernier point complet (v_national_latest) : conso, nucléaire et CO2 garantis non nuls. */
export interface NationalLatest extends NationalPoint {
  consommation: number
  nucleaire: number
  taux_co2: number
  ech_comm_angleterre: number | null
  ech_comm_espagne: number | null
  ech_comm_italie: number | null
  ech_comm_suisse: number | null
  ech_comm_allemagne_belgique: number | null
  updated_at: string
}

async function fetchRows<T>(path: string): Promise<T[]> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
  })
  if (!response.ok) {
    throw new Error(`Supabase a répondu ${String(response.status)} sur ${path}`)
  }
  return (await response.json()) as T[]
}

/** Dernier point complet par région (choroplèthe). */
export interface RegionalLatest {
  region_code: string
  region_name: string
  ts: string
  maturity: 'R' | 'C' | 'D'
  consommation: number
  thermique: number | null
  nucleaire: number | null
  eolien: number | null
  solaire: number | null
  hydraulique: number | null
  pompage: number | null
  bioenergies: number | null
  ech_physiques: number | null
}

/** Un point de série régionale (v_regional_24h/7d/30d ; thermique agrégé, ADR-0004). */
export interface RegionalPoint {
  region_code: string
  region_name: string
  ts: string
  consommation: number | null
  thermique: number | null
  nucleaire: number | null
  eolien: number | null
  solaire: number | null
  hydraulique: number | null
  pompage: number | null
  bioenergies: number | null
  ech_physiques: number | null
}

/** Un point de consommation d'une métropole (fenêtre 6 h). */
export interface MetropolePoint {
  epci_code: string
  name: string
  ts: string
  consommation: number | null
}

/** Un pas horaire du signal Ecowatt. hvalue : 0 vert + production décarbonée
 * (nouveauté v5), 1 vert, 2 orange, 3 rouge. */
export interface EcowattHour {
  pas: number
  hvalue: number
}

/** Un jour du signal Ecowatt (v_ecowatt, fenêtre J..J+3). dvalue : 1 vert, 2 orange, 3 rouge.
 * hours peut être partiel sur le jour courant (contrat RTE) et null si aucune heure publiée. */
export interface EcowattDay {
  day: string
  dvalue: 1 | 2 | 3
  message: string
  generated_at: string
  hours: EcowattHour[] | null
}

export type TempoColor = 'BLUE' | 'WHITE' | 'RED'

/** L'instantané Tempo (v_tempo, une ligne) : couleurs du jour et de demain
 * (null tant que RTE n'a pas publié) et compteurs de la saison en cours. */
export interface TempoSnapshot {
  today: string
  season_start: string
  today_color: TempoColor | null
  today_updated_at: string | null
  tomorrow_color: TempoColor | null
  tomorrow_updated_at: string | null
  red_days_used: number
  white_days_used: number
  blue_days_used: number
}

/** Plages du sélecteur de période : 24 h au quart d'heure, 7 j et 30 j à l'heure. */
export type NationalRange = '24h' | '7d' | '30d'

const RANGE_PATHS: Record<NationalRange, string> = {
  '24h': 'v_national_24h?select=*&order=ts.asc&limit=200',
  '7d': 'v_national_7d?select=*&order=ts.asc&limit=400',
  '30d': 'v_national_30d?select=*&order=ts.asc&limit=900',
}

export async function fetchNationalLatest(): Promise<NationalLatest | null> {
  const rows = await fetchRows<NationalLatest>('v_national_latest?select=*')
  return rows[0] ?? null
}

export async function fetchNationalRange(range: NationalRange): Promise<NationalPoint[]> {
  return fetchRows<NationalPoint>(RANGE_PATHS[range])
}

export async function fetchRegionalLatest(): Promise<RegionalLatest[]> {
  return fetchRows<RegionalLatest>('v_regional_latest?select=*&limit=20')
}

export async function fetchMetropoles6h(): Promise<MetropolePoint[]> {
  return fetchRows<MetropolePoint>('v_metropoles_6h?select=*&order=ts.asc&limit=1000')
}

const REGIONAL_RANGE_VIEWS: Record<NationalRange, string> = {
  '24h': 'v_regional_24h',
  '7d': 'v_regional_7d',
  '30d': 'v_regional_30d',
}

/** Tri descendant puis remise à l'endroit : si le plafond PostgREST tronque,
 * ce sont les points les plus anciens qui tombent, jamais les plus récents
 * (toute la logique de fenêtre s'ancre sur le dernier point). */
export async function fetchRegionalSeries(
  regionCode: string,
  range: NationalRange,
): Promise<RegionalPoint[]> {
  const rows = await fetchRows<RegionalPoint>(
    `${REGIONAL_RANGE_VIEWS[range]}?select=*&region_code=eq.${encodeURIComponent(regionCode)}&order=ts.desc&limit=1000`,
  )
  return [...rows].reverse()
}

/** Les métropoles ne conservent que 7 jours (purge à l'ingestion) : une seule vue. */
export async function fetchMetropoleSeries(epciCode: string): Promise<MetropolePoint[]> {
  const rows = await fetchRows<MetropolePoint>(
    `v_metropoles_7d?select=*&epci_code=eq.${encodeURIComponent(epciCode)}&order=ts.desc&limit=1000`,
  )
  return [...rows].reverse()
}

export async function fetchEcowatt(): Promise<EcowattDay[]> {
  const rows = await fetchRows<EcowattDay>('v_ecowatt?select=*&order=day.asc&limit=8')
  // garde de contrat : un dvalue hors 1..3 ne doit jamais produire une tuile vide
  return rows.filter((r) => r.dvalue >= 1 && r.dvalue <= 3)
}

export async function fetchTempo(): Promise<TempoSnapshot | null> {
  const rows = await fetchRows<TempoSnapshot>('v_tempo?select=*')
  return rows[0] ?? null
}

/** Un tarif réglementé en vigueur (v_trv_current, open data CRE). Abonnement annuel en
 * euros ; prix du kWh par composante : base | hp, hc | hp_bleu, hc_bleu, hp_blanc,
 * hc_blanc, hp_rouge, hc_rouge. */
export interface TrvTariff {
  option: 'BASE' | 'HPHC' | 'TEMPO'
  p_souscrite: number
  date_debut: string
  fixed_ht: number
  fixed_ttc: number
  prices_ht: Record<string, number>
  prices_ttc: Record<string, number>
  source_url: string
  updated_at: string
}

export interface TempoCalendarDay {
  day: string
  color: TempoColor
}

export async function fetchTrvCurrent(): Promise<TrvTariff[]> {
  return fetchRows<TrvTariff>('v_trv_current?select=*&order=option.asc,p_souscrite.asc')
}

/** Les jours les plus récents d'abord puis remis dans l'ordre : si le plafond
 * PostgREST tronquait, ce seraient les jours anciens qui manqueraient. */
export async function fetchTempoCalendar(): Promise<TempoCalendarDay[]> {
  const rows = await fetchRows<TempoCalendarDay>(
    'v_tempo_calendar?select=*&order=day.desc&limit=500',
  )
  return [...rows].reverse()
}

/** Le brief du matin (v_brief) : prose IA, chiffres calculés en base. */
export interface DailyBrief {
  day: string
  body: string
  model: string
  generated_at: string
}

export async function fetchBrief(): Promise<DailyBrief | null> {
  const rows = await fetchRows<DailyBrief>('v_brief?select=*')
  return rows[0] ?? null
}
