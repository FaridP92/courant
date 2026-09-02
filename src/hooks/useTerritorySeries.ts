import { useMemo } from 'react'
import type { NationalRange, RegionalPoint } from '../lib/api.ts'
import { trimTrailingGaps, windowFromLast } from '../lib/stats.ts'
import type { TerritoryRef } from '../lib/territory.ts'
import { useMetropoleSeries, useNationalSeries, useRegionalSeries } from './useNationalData.ts'

export interface ConsumptionPoint {
  ts: string
  consommation: number | null
}

export interface TerritorySeries {
  /** Consommation du territoire, queue muette retirée (jamais de pente fantôme). */
  points: readonly ConsumptionPoint[]
  /** Points complets, disponibles pour les régions seules (mix et export). */
  regionalPoints: readonly RegionalPoint[]
  status: 'pending' | 'error' | 'success'
}

const EMPTY_REGIONAL: readonly RegionalPoint[] = []

/**
 * Série d'un territoire, quelle que soit sa maille. Un même appel couvre les trois
 * sources ; seule celle du territoire demandé est active, les autres restent
 * inertes (`enabled: false`). Passer null n'interroge rien : c'est ce qui permet
 * d'ouvrir un emplacement de comparaison sans territoire.
 */
export function useTerritorySeries(
  ref: TerritoryRef | null,
  range: NationalRange,
): TerritorySeries {
  const kind = ref?.kind ?? null
  const code = ref !== null && ref.kind !== 'france' ? ref.code : null

  const nationalQuery = useNationalSeries(range, kind === 'france')
  const regionalQuery = useRegionalSeries(kind === 'region' ? code : null, range)
  const metropoleQuery = useMetropoleSeries(kind === 'metropole' ? code : null)

  const regionalData = regionalQuery.data
  const metropoleData = metropoleQuery.data
  const nationalData = nationalQuery.data

  const regionalPoints = useMemo(() => regionalData ?? EMPTY_REGIONAL, [regionalData])

  return useMemo(() => {
    if (kind === null) return { points: [], regionalPoints: EMPTY_REGIONAL, status: 'success' }
    if (kind === 'region') {
      return {
        points: trimTrailingGaps(
          regionalPoints.map((p) => ({ ts: p.ts, consommation: p.consommation })),
        ),
        regionalPoints,
        status: regionalQuery.status,
      }
    }
    if (kind === 'metropole') {
      // fenêtre ancrée sur le dernier point publié, jamais sur l'horloge du rendu ;
      // au-delà de 24 h, l'historique s'arrête de toute façon à 7 jours (purge source)
      const all = metropoleData ?? []
      const kept = range === '24h' ? windowFromLast(all, 26) : all
      return {
        points: trimTrailingGaps(kept.map((p) => ({ ts: p.ts, consommation: p.consommation }))),
        regionalPoints: EMPTY_REGIONAL,
        status: metropoleQuery.status,
      }
    }
    return {
      points: trimTrailingGaps(
        (nationalData ?? []).map((p) => ({ ts: p.ts, consommation: p.consommation })),
      ),
      regionalPoints: EMPTY_REGIONAL,
      status: nationalQuery.status,
    }
  }, [
    kind,
    range,
    regionalPoints,
    regionalQuery.status,
    metropoleData,
    metropoleQuery.status,
    nationalData,
    nationalQuery.status,
  ])
}
