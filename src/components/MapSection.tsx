import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { NationalLatest, RegionalLatest } from '../lib/api.ts'
import { exchangeBalanceMw } from '../lib/energy.ts'
import {
  formatFreshness,
  formatGigawatts,
  formatParisClock,
  formatWholePercent,
} from '../lib/format.ts'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.ts'
import { mapExportRows } from '../lib/exports.ts'
import { MAP_METRICS, mapMetricOption, type MapMetric } from '../lib/filters.ts'
import { buildMapOption, mapAriaLabel, REGIONS_MAP_NAME } from './charts/mapOptions.ts'
import { useTheme } from '../hooks/useTheme.ts'
import { ChartSlot, EChart } from './charts/LazyEChart.tsx'
import { SegmentedControl } from './controls/SegmentedControl.tsx'
import { ExportButton } from './ExportButton.tsx'
import { SectionHeader } from './SectionHeader.tsx'

type RegionsStatus = 'pending' | 'error' | 'success'

function useRegionsGeo() {
  return useQuery({
    queryKey: ['geojson-regions'],
    staleTime: Infinity,
    queryFn: async () => {
      const response = await fetch('/geo/regions-metropole.json')
      if (!response.ok) throw new Error(`GeoJSON indisponible (${String(response.status)})`)
      const geo = (await response.json()) as object
      const { registerGeoMap } = await import('./charts/geo.ts')
      registerGeoMap(REGIONS_MAP_NAME, geo)
      return true
    },
  })
}

function RegionPanel({
  region,
  national,
  onClose,
  onExplore,
}: {
  region: RegionalLatest
  national: NationalLatest | null
  onClose: () => void
  onExplore?: ((code: string) => void) | undefined
}) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    titleRef.current?.focus()
  }, [region.region_code])

  const balance = exchangeBalanceMw(region)
  const share = national === null ? null : region.consommation / national.consommation
  // les horodatages régional et national peuvent diverger (publication décalée) :
  // la part affichée précise alors sur quel instant national elle est calculée
  const shareLabel =
    share === null || national === null
      ? null
      : region.ts === national.ts
        ? `${formatWholePercent(share)} % de la conso nationale`
        : `${formatWholePercent(share)} % de la conso nationale de ${formatParisClock(national.ts)}`
  const generation: { label: string; value: number | null }[] = [
    { label: 'Nucléaire', value: region.nucleaire },
    { label: 'Hydraulique', value: region.hydraulique },
    { label: 'Éolien', value: region.eolien },
    { label: 'Solaire', value: region.solaire },
    { label: 'Bioénergies', value: region.bioenergies },
    { label: 'Thermique', value: region.thermique },
  ]
  return (
    <div className="mt-4 rounded-xl border border-line bg-raised p-4">
      <div className="flex items-start justify-between gap-3">
        <h3
          ref={titleRef}
          tabIndex={-1}
          className="text-[15px] font-semibold text-ink-100 outline-none"
        >
          {region.region_name}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le détail de la région"
          className="text-[15px] leading-none text-ink-40 transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          ✕
        </button>
      </div>
      <p className="mt-1.5 font-display text-[26px] leading-none font-extrabold text-ink-100 [font-stretch:115%]">
        {formatGigawatts(region.consommation)}
        <span className="ml-1 text-sm font-semibold text-ink-60">GW</span>
      </p>
      <p className="mt-1.5 text-[12.5px] text-ink-60">
        {shareLabel !== null && `${shareLabel} · `}
        {balance === null
          ? 'échanges indisponibles'
          : balance >= 0
            ? `exporte ${formatGigawatts(balance)} GW`
            : `importe ${formatGigawatts(-balance)} GW`}
      </p>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-ink-60">
        {generation
          .filter((g) => g.value !== null && g.value > 0)
          .map((g) => (
            <span key={g.label}>
              {g.label}{' '}
              <b className="font-data font-medium text-ink-100">{formatGigawatts(g.value ?? 0)}</b>
            </span>
          ))}
      </p>
      <p className="mt-2 text-[12px] text-ink-40">{formatFreshness(region.ts)}</p>
      {onExplore !== undefined && (
        <button
          type="button"
          onClick={() => {
            onExplore(region.region_code)
          }}
          className="btn-secondary mt-3 px-3 py-1.5 text-[13px]"
        >
          Creuser dans l'Explorateur ↓
        </button>
      )}
    </div>
  )
}

export function MapSection({
  regions,
  national,
  regionsStatus,
  metric,
  onMetricChange,
  onExploreRegion,
}: {
  regions: readonly RegionalLatest[]
  national: NationalLatest | null
  regionsStatus: RegionsStatus
  /** Grandeur qui donne sa teinte à la choroplèthe (critère partagé, porté par l'URL). */
  metric: MapMetric
  onMetricChange: (metric: MapMetric) => void
  onExploreRegion?: (code: string) => void
}) {
  const geoQuery = useRegionsGeo()
  const reduceMotion = usePrefersReducedMotion()
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const selected = regions.find((r) => r.region_code === selectedCode) ?? null

  const toggleRegion = (code: string) => {
    setSelectedCode((current) => (current === code ? null : code))
  }

  const closePanel = () => {
    if (selectedCode !== null) {
      document.getElementById(`region-button-${selectedCode}`)?.focus()
    }
    setSelectedCode(null)
  }

  // mémoïsé : un rendu sans changement de données ne relance ni setOption ni l'animation
  const { theme } = useTheme()
  const mapOption = useMemo(
    () => buildMapOption(regions, national, selectedCode, reduceMotion, metric, theme),
    [regions, national, selectedCode, reduceMotion, metric, theme],
  )
  const ariaLabel = useMemo(() => mapAriaLabel(regions, metric), [regions, metric])

  const exportRows = mapExportRows(regions)

  // une panne de la source ne se déguise jamais en chargement infini
  const regionsUnavailable =
    regionsStatus === 'error' || (regionsStatus === 'success' && regions.length === 0)

  return (
    <article className="panel p-5 md:p-6">
      <SectionHeader
        title="Régions et échanges"
        subtitle={`Consommation et échanges par région : teinte = ${mapMetricOption(metric).hint} · clic pour le détail.`}
        actions={
          <>
            <SegmentedControl
              label="Métrique de la carte"
              options={MAP_METRICS}
              value={metric}
              onChange={onMetricChange}
            />
            <ExportButton rows={exportRows} filename={`courant-regions-${metric}.csv`} />
          </>
        }
      />
      {geoQuery.isSuccess && regions.length > 0 ? (
        <ChartSlot heightClass="h-[380px] w-full">
          <EChart
            option={mapOption}
            ariaLabel={ariaLabel}
            className="h-[380px] w-full"
            onClick={(params) => {
              const code = (params as { data?: { code?: unknown } }).data?.code
              // un clic sur un flux frontalier ou une zone sans donnée ne ferme pas le panneau
              if (typeof code !== 'string') return
              toggleRegion(code)
            }}
          />
        </ChartSlot>
      ) : (
        <div className="flex h-[380px] items-center justify-center text-sm text-ink-40">
          {geoQuery.isError
            ? 'Fond de carte indisponible'
            : regionsUnavailable
              ? 'Données régionales indisponibles'
              : 'Chargement de la carte...'}
        </div>
      )}
      {regions.length > 0 && (
        <nav aria-label="Sélection d'une région au clavier">
          <ul className="flex flex-wrap gap-1">
            {regions.map((r) => (
              <li key={r.region_code}>
                <button
                  id={`region-button-${r.region_code}`}
                  type="button"
                  aria-pressed={selectedCode === r.region_code}
                  onClick={() => {
                    toggleRegion(r.region_code)
                  }}
                  className="sr-only rounded-full border border-line-strong bg-panel px-3 py-1.5 text-[13px] text-ink-60 focus:not-sr-only focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {r.region_name}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {selected !== null && (
        <RegionPanel
          region={selected}
          national={national}
          onClose={closePanel}
          onExplore={onExploreRegion}
        />
      )}
      <p className="mt-3 text-[12.5px] text-ink-40">
        Corse : non couverte par éCO2mix régional. Flux : particules dans le sens du courant, cyan =
        export, gris = import.
      </p>
    </article>
  )
}
