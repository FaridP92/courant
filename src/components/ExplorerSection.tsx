import { useMemo, useState } from 'react'
import type { MetropolePoint, NationalLatest, NationalRange, RegionalLatest } from '../lib/api.ts'
import {
  nationalAutonomy,
  nuclearShare,
  regionalAutonomy,
  regionalProductionTotalMw,
  regionalRenewableShare,
  renewablesShare,
} from '../lib/energy.ts'
import {
  formatFreshness,
  formatGigawatts,
  formatParisClock,
  formatWholePercent,
} from '../lib/format.ts'
import { formatDayShort, parisDayIso } from '../lib/signals.ts'
import { seriesStats, trimTrailingGaps, windowFromLast } from '../lib/stats.ts'
import { FRANCE, territoryKey, territoryLabel, type Territory } from '../lib/territory.ts'
import {
  useMetropoleSeries,
  useNationalSeries,
  useRegionalSeries,
} from '../hooks/useNationalData.ts'
import {
  buildRegionalMixOption,
  buildTerritoryConsoOption,
  REGIONAL_FUELS,
  territoryChartAriaLabel,
} from './charts/explorerOptions.ts'
import { ChartSlot, EChart } from './charts/LazyEChart.tsx'
import { ExportButton } from './ExportButton.tsx'
import { Gauge } from './Gauge.tsx'
import { RangeSelector } from './RangeSelector.tsx'

const RANGE_HINTS: Record<NationalRange, string> = {
  '24h': 'environ 24 h au pas source',
  '7d': '7 jours en moyenne horaire',
  '30d': '30 jours en moyenne horaire',
}

interface GaugeSpec {
  label: string
  fraction: number | null
  hint: string
}

const percentText = (fraction: number | null) =>
  fraction === null ? 'n.d.' : `${formatWholePercent(fraction)} %`

/** Le moment d'une pointe : l'heure seule suffit sur 24 h, le jour s'ajoute au-delà. */
function formatMoment(ts: string, range: NationalRange): string {
  const clock = formatParisClock(ts)
  return range === '24h' ? clock : `${formatDayShort(parisDayIso(new Date(ts)))} ${clock}`
}

export function ExplorerSection({
  regions,
  metropoles,
  national,
  territory,
  onTerritoryChange,
}: {
  regions: readonly RegionalLatest[]
  metropoles: readonly MetropolePoint[]
  national: NationalLatest | null
  territory: Territory
  onTerritoryChange: (territory: Territory) => void
}) {
  const [range, setRange] = useState<NationalRange>('24h')
  // les métropoles n'ont que 7 jours d'historique : 30 j retombe sur 7 j
  const effectiveRange = territory.kind === 'metropole' && range === '30d' ? '7d' : range

  const nationalQuery = useNationalSeries(effectiveRange, territory.kind === 'france')
  const regionalQuery = useRegionalSeries(
    territory.kind === 'region' ? territory.code : null,
    effectiveRange,
  )
  const metropoleQuery = useMetropoleSeries(territory.kind === 'metropole' ? territory.code : null)

  const regionalData = regionalQuery.data
  const regionalPoints = useMemo(() => regionalData ?? [], [regionalData])
  const { points, status } = useMemo(() => {
    // la queue de prévisions pures (conso nulle) ne pollue ni fraîcheur, ni stats, ni export
    if (territory.kind === 'region') {
      return {
        points: trimTrailingGaps(
          regionalPoints.map((p) => ({ ts: p.ts, consommation: p.consommation })),
        ),
        status: regionalQuery.status,
      }
    }
    if (territory.kind === 'metropole') {
      // fenêtre ancrée sur le dernier point publié, jamais sur l'horloge du rendu
      const all = metropoleQuery.data ?? []
      const kept = effectiveRange === '24h' ? windowFromLast(all, 26) : all
      return {
        points: trimTrailingGaps(kept.map((p) => ({ ts: p.ts, consommation: p.consommation }))),
        status: metropoleQuery.status,
      }
    }
    return {
      points: trimTrailingGaps(
        (nationalQuery.data ?? []).map((p) => ({ ts: p.ts, consommation: p.consommation })),
      ),
      status: nationalQuery.status,
    }
  }, [
    territory,
    regionalPoints,
    regionalQuery.status,
    metropoleQuery.data,
    metropoleQuery.status,
    nationalQuery.data,
    nationalQuery.status,
    effectiveRange,
  ])

  const stats = seriesStats(points)
  const lastTs = points[points.length - 1]?.ts ?? null

  const selectedRegion =
    territory.kind === 'region'
      ? (regions.find((r) => r.region_code === territory.code) ?? null)
      : null

  // les jauges viennent du dernier point complet (autre vue que la série) : on date
  const gaugesTs =
    territory.kind === 'france'
      ? (national?.ts ?? null)
      : territory.kind === 'region'
        ? (selectedRegion?.ts ?? null)
        : null

  const gauges: GaugeSpec[] | null = useMemo(() => {
    if (territory.kind === 'france') {
      if (national === null) return null
      return [
        {
          label: 'Renouvelables',
          fraction: renewablesShare(national),
          hint: 'part de la production',
        },
        { label: 'Nucléaire', fraction: nuclearShare(national), hint: 'part de la production' },
        { label: 'Autonomie', fraction: nationalAutonomy(national), hint: 'production / conso' },
      ]
    }
    if (territory.kind === 'region') {
      if (selectedRegion === null) return null
      const total = regionalProductionTotalMw(selectedRegion)
      return [
        {
          label: 'Renouvelables',
          fraction: regionalRenewableShare(selectedRegion),
          hint: 'part de la production',
        },
        {
          label: 'Nucléaire',
          fraction:
            total === null || selectedRegion.nucleaire === null
              ? null
              : selectedRegion.nucleaire / total,
          hint: 'part de la production',
        },
        {
          label: 'Autonomie',
          fraction: regionalAutonomy(selectedRegion),
          hint: 'production / conso',
        },
      ]
    }
    return null
  }, [territory.kind, national, selectedRegion])

  const metroOptions = useMemo(() => {
    const byCode = new Map<string, string>()
    for (const p of metropoles) byCode.set(p.epci_code, p.name)
    return [...byCode.entries()]
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }, [metropoles])

  const regionOptions = useMemo(
    () =>
      [...regions]
        .sort((a, b) => a.region_name.localeCompare(b.region_name, 'fr'))
        .map((r) => ({ code: r.region_code, name: r.region_name })),
    [regions],
  )

  const handleTerritoryValue = (value: string) => {
    if (value === 'france') {
      onTerritoryChange(FRANCE)
      return
    }
    const [kind, code] = value.split(':')
    if (kind === 'region') {
      const match = regionOptions.find((r) => r.code === code)
      if (match !== undefined) onTerritoryChange({ kind: 'region', ...match })
    } else if (kind === 'metropole') {
      const match = metroOptions.find((m) => m.code === code)
      if (match !== undefined) onTerritoryChange({ kind: 'metropole', ...match })
    }
  }

  const consoOption = useMemo(() => buildTerritoryConsoOption(points), [points])
  const mixOption = useMemo(() => buildRegionalMixOption(regionalPoints), [regionalPoints])

  const label = territoryLabel(territory)
  const exportRows =
    territory.kind === 'region'
      ? regionalPoints.map((p) => ({
          ts: p.ts,
          consommation_mw: p.consommation,
          nucleaire_mw: p.nucleaire,
          hydraulique_mw: p.hydraulique,
          eolien_mw: p.eolien,
          solaire_mw: p.solaire,
          bioenergies_mw: p.bioenergies,
          thermique_mw: p.thermique,
          pompage_mw: p.pompage,
          ech_physiques_mw: p.ech_physiques,
        }))
      : points.map((p) => ({ ts: p.ts, consommation_mw: p.consommation }))

  return (
    <section
      id="explorer"
      tabIndex={-1}
      aria-label="Explorateur par territoire"
      className="rounded-(--radius-card) border border-line bg-panel p-4 shadow-(--shadow-card) outline-none"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-data text-[11px] font-semibold tracking-[0.16em] text-ink-40 uppercase">
          Explorer{' '}
          <span className="font-normal tracking-normal normal-case">
            un territoire, une période : jauges, statistiques, courbes ·{' '}
            {RANGE_HINTS[effectiveRange]}
          </span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor="explorer-territory"
            className="font-data text-[11px] tracking-[0.08em] text-ink-40 uppercase"
          >
            Territoire
          </label>
          <select
            id="explorer-territory"
            value={territoryKey(territory)}
            onChange={(event) => {
              handleTerritoryValue(event.target.value)
            }}
            className="rounded-md border border-line-strong bg-raised px-2.5 py-1.5 font-data text-xs text-ink-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <option value="france">France entière</option>
            <optgroup label="Régions">
              {/* le territoire courant reste sélectionnable même si la liste ne le porte plus */}
              {territory.kind === 'region' &&
                !regionOptions.some((r) => r.code === territory.code) && (
                  <option value={territoryKey(territory)}>{territory.name}</option>
                )}
              {regionOptions.map((r) => (
                <option key={r.code} value={`region:${r.code}`}>
                  {r.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Métropoles">
              {territory.kind === 'metropole' &&
                !metroOptions.some((m) => m.code === territory.code) && (
                  <option value={territoryKey(territory)}>{territory.name}</option>
                )}
              {metroOptions.map((m) => (
                <option key={m.code} value={`metropole:${m.code}`}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          </select>
          <RangeSelector
            value={effectiveRange}
            onChange={setRange}
            {...(territory.kind === 'metropole'
              ? {
                  disabled: {
                    '30d': 'Historique métropoles limité à 7 jours (purge à la source)',
                  },
                }
              : {})}
          />
          <ExportButton
            rows={exportRows}
            filename={`courant-explorer-${territoryKey(territory).replace(':', '-')}-${effectiveRange}.csv`}
          />
        </div>
      </div>

      <div className="grid gap-3.5 xl:grid-cols-[260px_minmax(0,1fr)]">
        <div className="flex flex-col gap-3.5">
          {gauges !== null ? (
            <div className="grid grid-cols-3 gap-2 xl:grid-cols-1 min-[480px]:max-xl:grid-cols-3">
              {gauges.map((g) => (
                <Gauge
                  key={g.label}
                  label={g.label}
                  fraction={g.fraction}
                  valueText={percentText(g.fraction)}
                  hint={g.hint}
                />
              ))}
            </div>
          ) : territory.kind === 'metropole' ? (
            <p className="rounded-(--radius-chip) border border-line bg-raised p-3 font-data text-xs text-ink-40">
              Production non publiée à l'échelle des métropoles : jauges et mix indisponibles, la
              consommation reste explorable.
            </p>
          ) : (
            <p className="font-data text-xs text-ink-40">Jauges indisponibles pour le moment.</p>
          )}
          {gauges !== null && gaugesTs !== null && (
            <p className="font-data text-[10.5px] text-ink-40">
              Jauges : {formatFreshness(gaugesTs)}
            </p>
          )}
          {stats !== null && (
            <dl className="grid gap-1.5 font-data text-[11.5px] text-ink-60">
              <div className="flex justify-between gap-2">
                <dt>Moyenne</dt>
                <dd className="font-medium text-ink-100">{formatGigawatts(stats.average)} GW</dd>
              </div>
              <div className="flex justify-between gap-2">
                {/* en 7 j / 30 j la série est en moyenne horaire : la pointe l'est aussi */}
                <dt>{effectiveRange === '24h' ? 'Pointe' : 'Pointe horaire'}</dt>
                <dd className="text-right font-medium text-ink-100">
                  {formatGigawatts(stats.peak.value)} GW{' '}
                  <span className="font-normal text-ink-40">
                    {formatMoment(stats.peak.ts, effectiveRange)}
                  </span>
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>{effectiveRange === '24h' ? 'Creux' : 'Creux horaire'}</dt>
                <dd className="text-right font-medium text-ink-100">
                  {formatGigawatts(stats.low.value)} GW{' '}
                  <span className="font-normal text-ink-40">
                    {formatMoment(stats.low.ts, effectiveRange)}
                  </span>
                </dd>
              </div>
            </dl>
          )}
          {lastTs !== null && (
            <p className="font-data text-[10.5px] text-ink-40">{formatFreshness(lastTs)}</p>
          )}
        </div>

        <div>
          {points.length > 0 ? (
            <>
              <h3 className="mb-1 font-data text-[11px] font-semibold tracking-[0.14em] text-ink-40 uppercase">
                Consommation · {label}
              </h3>
              <ChartSlot heightClass="h-[200px] w-full">
                <EChart
                  option={consoOption}
                  ariaLabel={territoryChartAriaLabel(label, points.length)}
                  className="h-[200px] w-full"
                />
              </ChartSlot>
              {territory.kind === 'region' && regionalPoints.length > 0 && (
                <>
                  <h3 className="mt-3 mb-1 font-data text-[11px] font-semibold tracking-[0.14em] text-ink-40 uppercase">
                    Mix de production du territoire
                  </h3>
                  <ChartSlot heightClass="h-[190px] w-full">
                    <EChart
                      option={mixOption}
                      ariaLabel={`Aires empilées de la production de ${label} par filière.`}
                      className="h-[190px] w-full"
                    />
                  </ChartSlot>
                  <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-data text-[11px] text-ink-60">
                    {REGIONAL_FUELS.map((fuel) => (
                      <span key={fuel.key} className="flex items-center gap-1.5">
                        <i
                          className="h-2.5 w-2.5 rounded-[3px]"
                          style={{ backgroundColor: fuel.color }}
                        />
                        {fuel.label}
                      </span>
                    ))}
                  </p>
                </>
              )}
            </>
          ) : status === 'pending' ? (
            <div className="flex h-[200px] items-center justify-center font-data text-sm text-ink-40">
              Chargement de la série...
            </div>
          ) : (
            <div className="flex h-[200px] items-center justify-center font-data text-sm text-ink-40">
              Série indisponible pour ce territoire sur cette période.
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 font-data text-[10.5px] text-ink-40">
        Granularité : France, régions, métropoles. RTE ne publie pas plus fin en temps réel (pas de
        maille département ou commune).
      </p>
    </section>
  )
}
