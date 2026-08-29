import { useQuery } from '@tanstack/react-query'
import { fetchNational24h, fetchNationalLatest } from '../lib/api.ts'
import { REFRESH_INTERVAL_MS } from '../lib/config.ts'

export function useNationalData() {
  const latestQuery = useQuery({
    queryKey: ['national-latest'],
    queryFn: fetchNationalLatest,
    refetchInterval: REFRESH_INTERVAL_MS,
  })
  const seriesQuery = useQuery({
    queryKey: ['national-24h'],
    queryFn: fetchNational24h,
    refetchInterval: REFRESH_INTERVAL_MS,
  })
  return { latestQuery, seriesQuery }
}
