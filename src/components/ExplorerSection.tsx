import { useMemo } from 'react'
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
import { regionalExportRows, territoryExportRows } from '../lib/exports.ts'
import { formatDayShort, parisDayIso } from '../lib/signals.ts'
import { seriesStats } from '../lib/stats.ts'
import {
  parseTerritoryRef,
  resolveTerritory,
  territoryKey,
  territoryLabel,
  type TerritoryRef,
} from '../lib/territory.ts'
import { MAX_COMPARE } from '../lib/filters.ts'
import { useTerritorySeries } from '../hooks/useTerritorySeries.ts'
import {
  buildRegionalMixOption,
  buildTerritoryConsoOption,
  curveColor,
  regionalFuels,
  territoryChartAriaLabel,
  type TerritoryCurve,
} from './charts/explorerOptions.ts'
import { useTheme } from '../hooks/useTheme.ts'
import { ChartSlot, EChart } from './charts/LazyEChart.tsx'
import { ExportButton } from './ExportButton.tsx'
import { Gauge } from './Gauge.tsx'
import { RangeSelector } from './RangeSelector.tsx'
import { SectionHeader } from './SectionHeader.tsx'

const RANGE_HINTS: Record<NationalRange, string> = {
  '24h': 'environ 24 h au pas source',
  '7d': '7 jours en moyenne horaire',
  '30d': '30 jours en moyenne horaire',
}

/** Sélecteur de la barre d'actions : pilule claire, focus visible. */
const SELECT_CLASS =
  'rounded-full border border-line-strong bg-panel px-3.5 py-1.5 text-[13.5px] text-ink-100 transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

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
  compare,
  onCompareChange,
  range,
  onRangeChange,
}: {
  regions: readonly RegionalLatest[]
  metropoles: readonly MetropolePoint[]
  national: NationalLatest | null
  /** Territoire demandé, par code : le libellé est résolu ici, depuis les données. */
  territory: TerritoryRef
  onTerritoryChange: (territory: TerritoryRef) => void
  /** Territoires superposés au principal (deux au plus). */
  compare: readonly TerritoryRef[]
  onCompareChange: (compare: readonly TerritoryRef[]) => void
  /** Période partagée avec la colonne du temps : un seul critère pour toute la page. */
  range: NationalRange
  onRangeChange: (range: NationalRange) => void
}) {
  // les métropoles n'ont que 7 jours d'historique : 30 j retombe sur 7 j
  const effectiveRange = territory.kind === 'metropole' && range === '30d' ? '7d' : range

  const primary = useTerritorySeries(territory, effectiveRange)
  // deux emplacements de comparaison, appelés à vide tant qu'ils ne portent rien :
  // les hooks restent au même nombre et dans le même ordre à chaque rendu
  const firstCompare = useTerritorySeries(compare[0] ?? null, effectiveRange)
  const secondCompare = useTerritorySeries(compare[1] ?? null, effectiveRange)
  const { points, regionalPoints, status } = primary

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

  // le libellé vient des listes chargées ; tant qu'elles arrivent, le code fait foi
  const resolved = useMemo(
    () => resolveTerritory(territory, regionOptions, metroOptions),
    [territory, regionOptions, metroOptions],
  )

  const taken = new Set([territoryKey(territory), ...compare.map((ref) => territoryKey(ref))])
  const comparableOptions = {
    france: !taken.has('france'),
    regions: regionOptions.filter((r) => !taken.has(`region:${r.code}`)),
    metropoles: metroOptions.filter((m) => !taken.has(`metropole:${m.code}`)),
  }

  const labelFor = (ref: TerritoryRef): string =>
    territoryLabel(resolveTerritory(ref, regionOptions, metroOptions))

  const handleTerritoryValue = (value: string) => {
    const ref = parseTerritoryRef(value)
    if (ref !== null) onTerritoryChange(ref)
  }

  const addCompare = (value: string) => {
    const ref = parseTerritoryRef(value)
    if (ref === null || compare.length >= MAX_COMPARE) return
    const key = territoryKey(ref)
    if (key === territoryKey(territory) || compare.some((c) => territoryKey(c) === key)) return
    onCompareChange([...compare, ref])
  }

  const removeCompare = (ref: TerritoryRef) => {
    onCompareChange(compare.filter((c) => territoryKey(c) !== territoryKey(ref)))
  }

  const { theme } = useTheme()
  const mixOption = useMemo(
    () => buildRegionalMixOption(regionalPoints, theme),
    [regionalPoints, theme],
  )

  const label = territoryLabel(resolved)

  // une courbe par territoire : le principal d'abord, puis les comparaisons qui
  // portent des points (un territoire encore en chargement n'ajoute pas de ligne vide)
  const curves = useMemo<TerritoryCurve[]>(() => {
    const comparisons = compare.flatMap((ref, index) => {
      const comparePoints = (index === 0 ? firstCompare : secondCompare).points
      return comparePoints.length === 0
        ? []
        : [
            {
              name: territoryLabel(resolveTerritory(ref, regionOptions, metroOptions)),
              points: comparePoints,
            },
          ]
    })
    return [{ name: label, points }, ...comparisons]
  }, [label, points, compare, firstCompare, secondCompare, regionOptions, metroOptions])
  const consoOption = useMemo(() => buildTerritoryConsoOption(curves, theme), [curves, theme])
  const exportRows =
    territory.kind === 'region'
      ? regionalExportRows(regionalPoints)
      : territoryExportRows(points, label)

  return (
    <section
      id="explorer"
      tabIndex={-1}
      aria-label="Explorateur par territoire"
      className="panel p-5 outline-none md:p-6"
    >
      <SectionHeader
        title="Explorer un territoire"
        subtitle="Choisis la France entière, une région ou une métropole, une période, et compare jusqu'à deux autres territoires."
        actions={
          <>
            <span className="flex items-center gap-2">
              <label htmlFor="explorer-territory" className="eyebrow">
                Territoire
              </label>
              <select
                id="explorer-territory"
                value={territoryKey(territory)}
                onChange={(event) => {
                  handleTerritoryValue(event.target.value)
                }}
                className={SELECT_CLASS}
              >
                <option value="france">France entière</option>
                <optgroup label="Régions">
                  {/* le territoire courant reste sélectionnable même si la liste ne le porte plus */}
                  {territory.kind === 'region' &&
                    !regionOptions.some((r) => r.code === territory.code) && (
                      <option value={territoryKey(territory)}>{label}</option>
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
                      <option value={territoryKey(territory)}>{label}</option>
                    )}
                  {metroOptions.map((m) => (
                    <option key={m.code} value={`metropole:${m.code}`}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </span>
            <span className="flex items-center gap-2">
              <label htmlFor="explorer-compare" className="eyebrow">
                Comparer
              </label>
              <select
                id="explorer-compare"
                value=""
                disabled={compare.length >= MAX_COMPARE}
                title={
                  compare.length >= MAX_COMPARE
                    ? `Deux comparaisons au plus : retirez-en une pour en ajouter une autre`
                    : 'Superposer un autre territoire à la courbe'
                }
                onChange={(event) => {
                  addCompare(event.target.value)
                }}
                className={`${SELECT_CLASS} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <option value="">+ ajouter</option>
                {comparableOptions.france && <option value="france">France entière</option>}
                <optgroup label="Régions">
                  {comparableOptions.regions.map((r) => (
                    <option key={r.code} value={`region:${r.code}`}>
                      {r.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Métropoles">
                  {comparableOptions.metropoles.map((m) => (
                    <option key={m.code} value={`metropole:${m.code}`}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </span>
            <RangeSelector
              value={effectiveRange}
              onChange={onRangeChange}
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
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="eyebrow">Jauges</p>
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
              <p className="rounded-xl bg-raised p-3 text-[13px] text-ink-60">
                Production non publiée à l'échelle des métropoles : jauges et mix indisponibles, la
                consommation reste explorable.
              </p>
            ) : (
              <p className="text-[13px] text-ink-40">Jauges indisponibles pour le moment.</p>
            )}
            {gauges !== null && gaugesTs !== null && (
              <p className="text-[12.5px] text-ink-40">{formatFreshness(gaugesTs)}</p>
            )}
          </div>
          {stats !== null && (
            <div className="flex flex-col gap-2">
              <p className="eyebrow">Statistiques</p>
              <dl className="grid grid-cols-3 gap-2 xl:grid-cols-1">
                <div className="rounded-xl bg-raised p-3">
                  <dt className="eyebrow">Moyenne</dt>
                  <dd className="mt-1.5 font-display text-[20px] leading-none font-bold text-ink-100 [font-stretch:112%]">
                    {formatGigawatts(stats.average)} GW
                  </dd>
                  <dd className="mt-1 text-[12.5px] text-ink-40">sur la période</dd>
                </div>
                <div className="rounded-xl bg-raised p-3">
                  {/* en 7 j / 30 j la série est en moyenne horaire : la pointe l'est aussi */}
                  <dt className="eyebrow">
                    {effectiveRange === '24h' ? 'Pointe' : 'Pointe horaire'}
                  </dt>
                  <dd className="mt-1.5 font-display text-[20px] leading-none font-bold text-ink-100 [font-stretch:112%]">
                    {formatGigawatts(stats.peak.value)} GW
                  </dd>
                  <dd className="mt-1 text-[12.5px] text-ink-40">
                    {formatMoment(stats.peak.ts, effectiveRange)}
                  </dd>
                </div>
                <div className="rounded-xl bg-raised p-3">
                  <dt className="eyebrow">
                    {effectiveRange === '24h' ? 'Creux' : 'Creux horaire'}
                  </dt>
                  <dd className="mt-1.5 font-display text-[20px] leading-none font-bold text-ink-100 [font-stretch:112%]">
                    {formatGigawatts(stats.low.value)} GW
                  </dd>
                  <dd className="mt-1 text-[12.5px] text-ink-40">
                    {formatMoment(stats.low.ts, effectiveRange)}
                  </dd>
                </div>
              </dl>
            </div>
          )}
          {lastTs !== null && (
            <p className="text-[12.5px] text-ink-40">{formatFreshness(lastTs)}</p>
          )}
        </div>

        <div>
          {points.length > 0 ? (
            <>
              <SectionHeader
                as="h3"
                title={`Consommation · ${label}`}
                subtitle={`Série sur ${RANGE_HINTS[effectiveRange]}.`}
              />
              <ChartSlot heightClass="h-[200px] w-full">
                <EChart
                  option={consoOption}
                  ariaLabel={territoryChartAriaLabel(curves)}
                  className="h-[200px] w-full"
                />
              </ChartSlot>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-ink-60">
                {curves.map((curve, index) => (
                  <span key={curve.name} className="flex items-center gap-2">
                    <i
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: curveColor(index, theme) }}
                    />
                    {curve.name}
                  </span>
                ))}
                {compare.map((ref) => (
                  <button
                    key={territoryKey(ref)}
                    type="button"
                    title={`Retirer ${labelFor(ref)} de la comparaison`}
                    onClick={() => {
                      removeCompare(ref)
                    }}
                    className="chip transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    retirer {labelFor(ref)}
                  </button>
                ))}
                {compare.length > 0 && (
                  <span className="text-[12.5px] text-ink-40">
                    jauges et statistiques restent celles de {label}
                  </span>
                )}
              </div>
              {territory.kind === 'region' && regionalPoints.length > 0 && (
                <>
                  <SectionHeader
                    as="h3"
                    title="Mix de production du territoire"
                    subtitle="D'où vient l'électricité produite ici, filière par filière, sur le même axe de temps."
                    className="mt-6"
                  />
                  <ChartSlot heightClass="h-[190px] w-full">
                    <EChart
                      option={mixOption}
                      ariaLabel={`Aires empilées de la production de ${label} par filière.`}
                      className="h-[190px] w-full"
                    />
                  </ChartSlot>
                  <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-2 text-[13px] text-ink-60">
                    {regionalFuels(theme).map((fuel) => (
                      <span key={fuel.key} className="flex items-center gap-2">
                        <i
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: fuel.color }}
                        />
                        {fuel.label}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : status === 'pending' ? (
            <div className="flex h-[200px] items-center justify-center text-[13.5px] text-ink-40">
              Chargement de la série...
            </div>
          ) : (
            <div className="flex h-[200px] items-center justify-center text-[13.5px] text-ink-40">
              Série indisponible pour ce territoire sur cette période.
            </div>
          )}
        </div>
      </div>
      <p className="mt-4 text-[12.5px] text-ink-40">
        Granularité : France, régions, métropoles. RTE ne publie pas plus fin en temps réel (pas de
        maille département ou commune).
      </p>
    </section>
  )
}
