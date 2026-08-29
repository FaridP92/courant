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

export async function fetchNationalLatest(): Promise<NationalLatest | null> {
  const rows = await fetchRows<NationalLatest>('v_national_latest?select=*')
  return rows[0] ?? null
}

export async function fetchNational24h(): Promise<NationalPoint[]> {
  return fetchRows<NationalPoint>('v_national_24h?select=*&order=ts.asc&limit=200')
}
