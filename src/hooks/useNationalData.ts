import { useQuery } from '@tanstack/react-query'
import {
  fetchMetropoles6h,
  fetchNationalLatest,
  fetchNationalRange,
  fetchRegionalLatest,
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
export function useNationalSeries(range: NationalRange) {
  return useQuery({
    queryKey: ['national-range', range],
    queryFn: () => fetchNationalRange(range),
    refetchInterval: REFRESH_INTERVAL_MS,
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
