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

/** Un point de consommation d'une métropole (fenêtre 6 h). */
export interface MetropolePoint {
  epci_code: string
  name: string
  ts: string
  consommation: number | null
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
