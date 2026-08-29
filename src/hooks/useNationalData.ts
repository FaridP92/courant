import { useQuery } from '@tanstack/react-query'
import {
  fetchEcowatt,
  fetchMetropoles6h,
  fetchMetropoleSeries,
  fetchNationalLatest,
  fetchNationalRange,
  fetchRegionalLatest,
  fetchRegionalSeries,
  fetchTempo,
  type NationalRange,
} from '../lib/api.ts'
import { REFRESH_INTERVAL_MS } from '../lib/config.ts'

export function useNationalLatest() {
  return useQuery({
    queryKey: ['national-latest'],
    queryFn: fetchNationalLatest,
    refetchInterval: REFRESH_INTERVAL_MS,
  })
}

/** Série nationale pour une plage donnée ; la clé inclut la plage, le cache TanStack
 * dédoublonne donc la plage 24 h utilisée à la fois par les KPI et le graphe. */
export function useNationalSeries(range: NationalRange, enabled = true) {
  return useQuery({
    queryKey: ['national-range', range],
    queryFn: () => fetchNationalRange(range),
    refetchInterval: REFRESH_INTERVAL_MS,
    enabled,
  })
}

export function useRegionalData() {
  return useQuery({
    queryKey: ['regional-latest'],
    queryFn: fetchRegionalLatest,
    refetchInterval: REFRESH_INTERVAL_MS,
  })
}

export function useMetropolesData() {
  return useQuery({
    queryKey: ['metropoles-6h'],
    queryFn: fetchMetropoles6h,
    refetchInterval: REFRESH_INTERVAL_MS,
  })
}

/** Les signaux évoluent au fil des publications RTE : un refetch par minute suffit. */
export function useEcowattData() {
  return useQuery({
    queryKey: ['ecowatt'],
    queryFn: fetchEcowatt,
    refetchInterval: REFRESH_INTERVAL_MS,
  })
}

export function useTempoData() {
  return useQuery({
    queryKey: ['tempo'],
    queryFn: fetchTempo,
    refetchInterval: REFRESH_INTERVAL_MS,
  })
}

/** Série d'une région pour l'Explorateur ; inactive tant qu'aucune région n'est choisie. */
export function useRegionalSeries(regionCode: string | null, range: NationalRange) {
  return useQuery({
    queryKey: ['regional-series', regionCode, range],
    enabled: regionCode !== null,
    queryFn: () =>
      regionCode === null ? Promise.resolve([]) : fetchRegionalSeries(regionCode, range),
    refetchInterval: REFRESH_INTERVAL_MS,
  })
}

/** Série 7 jours d'une métropole (l'historique s'arrête là, purge à la source). */
export function useMetropoleSeries(epciCode: string | null) {
  return useQuery({
    queryKey: ['metropole-series', epciCode],
    enabled: epciCode !== null,
    queryFn: () => (epciCode === null ? Promise.resolve([]) : fetchMetropoleSeries(epciCode)),
    refetchInterval: REFRESH_INTERVAL_MS,
  })
}
