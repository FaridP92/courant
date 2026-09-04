import { useMemo } from 'react'
import type { NationalLatest, NationalPoint, NationalRange } from '../lib/api.ts'
import {
  applyFilters,
  FUEL_KEYS,
  MATURITIES,
  toggleWithFloor,
  type Filters,
} from '../lib/filters.ts'
import { exchangeBalanceMw, nuclearShare, renewablesShare } from '../lib/energy.ts'
import {
  formatFreshness,
  formatGigawatts,
  formatParisClock,
  formatSignedGigawatts,
  formatSignedPercent,
  formatWholePercent,
} from '../lib/format.ts'
import { paletteFor } from '../lib/palette.ts'
import { useTheme } from '../hooks/useTheme.ts'
import {
  useBriefData,
  useEcowattData,
  useMetropolesData,
  useNationalLatest,
  useNationalSeries,
  useRegionalData,
  useSupplierOffers,
  useTempoCalendar,
  useTempoData,
  useTrvCurrent,
} from '../hooks/useNationalData.ts'
import { nationalExportRows } from '../lib/exports.ts'
import { territoryKey } from '../lib/territory.ts'
import { parisDayIso } from '../lib/signals.ts'
import { heroHighlights, highlightSummary } from '../lib/highlights.ts'
import { useFilters } from '../hooks/useFilters.ts'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.ts'
import {
  buildHeroChartOption,
  buildMixChartOption,
  heroScaleBoundsGw,
} from './charts/chartOptions.ts'
import { ChartSlot, EChart } from './charts/LazyEChart.tsx'
import { ToggleChip } from './controls/ToggleChip.tsx'
import { DashboardHeader } from './DashboardHeader.tsx'
import { SectionHeader } from './SectionHeader.tsx'
import { ExportButton } from './ExportButton.tsx'
import { FilterBar } from './FilterBar.tsx'
import { KpiCard } from './KpiCard.tsx'
import { BriefSection } from './BriefSection.tsx'
import { ChatSection } from './ChatSection.tsx'
import { CompareSection } from './CompareSection.tsx'
import { ExplorerSection } from './ExplorerSection.tsx'
import { MapSection } from './MapSection.tsx'
import { MetropolesSection } from './MetropolesSection.tsx'
import { SignalsSection } from './SignalsSection.tsx'

const TIME_COLUMN_GROUP = 'time-column'
/** 6 dernières heures au quart d'heure : la fenêtre des sparklines KPI. */
const SPARK_POINTS = 24

const RANGE_HINTS: Record<NationalRange, string> = {
  '24h': "24 h au quart d'heure",
  '7d': '7 jours en moyenne horaire',
  '30d': '30 jours en moyenne horaire',
}

/** Tronque la série aux points observés : la queue de prévisions pures n'entre jamais
 * dans les sparklines (règle : aucune donnée inventée, aucune pente fantôme). */
function observedPoints(points: readonly NationalPoint[]): readonly NationalPoint[] {
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i]
    if (p === undefined) continue
    if (p.consommation !== null && p.nucleaire !== null && p.taux_co2 !== null) {
      return points.slice(0, i + 1)
    }
  }
  return []
}

function sparkSeries(
  points: readonly NationalPoint[],
  pick: (p: NationalPoint) => number | null,
): (number | null)[] {
  return points.slice(-SPARK_POINTS).map(pick)
}

function KpiRow({ latest, points }: { latest: NationalLatest; points: readonly NationalPoint[] }) {
  const palette = paletteFor(useTheme().theme)
  const observed = observedPoints(points)
  const balance = exchangeBalanceMw(latest)
  const nuclear = nuclearShare(latest)
  const renewables = renewablesShare(latest)
  const forecastDelta =
    latest.prevision_j1 !== null && latest.prevision_j1 !== 0
      ? (latest.consommation - latest.prevision_j1) / latest.prevision_j1
      : null
  const renewablesSum = (p: NationalPoint) =>
    p.hydraulique === null || p.eolien === null || p.solaire === null || p.bioenergies === null
      ? null
      : p.hydraulique + p.eolien + p.solaire + p.bioenergies

  return (
    <section
      id="direct"
      className="grid grid-cols-2 gap-4 scroll-mt-24 lg:grid-cols-5"
      aria-label="Indicateurs clés (sparklines : tendance des 6 dernières heures observées)"
    >
      <KpiCard
        label="Consommation"
        value={formatGigawatts(latest.consommation)}
        unit="GW"
        detail={
          forecastDelta === null ? (
            'consommation instantanée'
          ) : (
            <>
              <span className="text-accent">{formatSignedPercent(forecastDelta)}</span> vs prévision
              J-1
            </>
          )
        }
        sparkValues={sparkSeries(observed, (p) => p.consommation)}
        sparkColor={palette.accent}
        sparkFilled
      />
      <KpiCard
        label="Nucléaire"
        value={nuclear === null ? 'n.d.' : formatWholePercent(nuclear)}
        unit={nuclear === null ? '' : '%'}
        detail={`${formatGigawatts(latest.nucleaire)} GW produits`}
        sparkValues={sparkSeries(observed, (p) => p.nucleaire)}
        sparkColor={palette.fuels[0]?.color ?? palette.accent}
      />
      <KpiCard
        label="Renouvelables"
        value={renewables === null ? 'n.d.' : formatWholePercent(renewables)}
        unit={renewables === null ? '' : '%'}
        detail={
          latest.hydraulique === null || latest.eolien === null
            ? 'télémétrie incomplète'
            : `hydro ${formatGigawatts(latest.hydraulique)} · éolien ${formatGigawatts(latest.eolien)} GW`
        }
        sparkValues={sparkSeries(observed, renewablesSum)}
        sparkColor={palette.fuels[1]?.color ?? palette.accent}
      />
      <KpiCard
        label="Intensité CO2"
        value={String(latest.taux_co2)}
        unit="g/kWh"
        detail="empreinte carbone du kWh"
        sparkValues={sparkSeries(observed, (p) => p.taux_co2)}
        sparkColor={palette.ink.mid}
      />
      <KpiCard
        label="Échanges"
        value={balance === null ? 'n.d.' : formatSignedGigawatts(balance)}
        unit={balance === null ? '' : 'GW'}
        detail={
          balance === null
            ? 'échanges indisponibles'
            : balance >= 0
              ? 'la France exporte'
              : 'la France importe'
        }
        sparkValues={sparkSeries(observed, (p) =>
          p.ech_physiques === null ? null : -p.ech_physiques,
        )}
        sparkColor={palette.ink.mid}
      />
    </section>
  )
}

function ForecastSwatch({ color, dash }: { color: string; dash: string }) {
  return (
    <svg width="16" height="4" aria-hidden="true" className="shrink-0">
      <line x1="0" y1="2" x2="16" y2="2" stroke={color} strokeWidth="2" strokeDasharray={dash} />
    </svg>
  )
}

function TimeColumn({
  latest,
  points,
  filters,
  onFiltersChange,
  onReset,
  kept,
  total,
}: {
  latest: NationalLatest
  points: readonly NationalPoint[]
  filters: Filters
  onFiltersChange: (patch: Partial<Filters>) => void
  onReset: () => void
  kept: number
  total: number
}) {
  const { range } = filters
  const { theme } = useTheme()
  const palette = paletteFor(theme)
  // le mix raisonne en filières masquées : le complément de celles retenues par le filtre
  const hiddenFuels = useMemo(
    () => new Set(FUEL_KEYS.filter((key) => !filters.fuels.has(key))),
    [filters.fuels],
  )
  const scale = heroScaleBoundsGw(points)
  // mémoïsées : un simple re-rendu React ne doit pas déclencher setOption
  // (qui, même en fusion, coûte un layout ECharts)
  // une seule fois : le graphe ombre ces plages, la légende les décrit
  const highlights = useMemo(
    () =>
      heroHighlights(points, {
        co2: filters.co2Threshold,
        // le seuil se choisit en pourcentage, il se calcule en fraction
        deviation: filters.deviationThreshold === null ? null : filters.deviationThreshold / 100,
      }),
    [points, filters.co2Threshold, filters.deviationThreshold],
  )
  const heroOption = useMemo(
    () => buildHeroChartOption(points, new Date(), highlights, theme),
    [points, highlights, theme],
  )
  const carbon = highlightSummary(highlights.co2)
  const drift = highlightSummary(highlights.deviation)
  const carbonNote =
    filters.co2Threshold === null
      ? null
      : carbon.steps === 0
        ? `aucun pas au-dessus de ${String(filters.co2Threshold)} g/kWh sur la période`
        : `CO2 : ${String(carbon.steps)} pas au-dessus de ${String(filters.co2Threshold)} g/kWh, pointe ${String(carbon.peak)}`
  const driftNote =
    filters.deviationThreshold === null
      ? null
      : drift.steps === 0
        ? `aucun écart au J-1 au-dessus de ${String(filters.deviationThreshold)} %`
        : `écart au J-1 : ${String(drift.steps)} pas au-dessus de ${String(filters.deviationThreshold)} %, pointe ${formatWholePercent(drift.peak)} %`
  const mixOption = useMemo(
    () => buildMixChartOption(points, hiddenFuels, theme),
    [points, hiddenFuels, theme],
  )
  const exportRows = nationalExportRows(points)
  // l'export livre exactement la vue filtrée : le nom du fichier porte donc le critère
  const exportSuffix =
    filters.maturity.size < MATURITIES.length ? `-${[...filters.maturity].join('')}` : ''
  // un filtre qui ne laisse rien se dit : un graphe vide passerait pour une panne
  const filteredOut = total > 0 && kept === 0

  return (
    <section aria-label="Consommation et mix de production dans le temps">
      <article className="panel rounded-b-none p-5 md:p-6">
        <SectionHeader
          title="Consommation nationale"
          subtitle={
            <>
              Ce que la France consomme, comparé aux prévisions de RTE, {RANGE_HINTS[range]}
              {scale !== null && ` (échelle ${String(scale.min)} à ${String(scale.max)} GW)`}.
            </>
          }
          actions={
            <>
              <FilterBar
                filters={filters}
                onChange={onFiltersChange}
                onReset={onReset}
                kept={kept}
                total={total}
              />
              <ExportButton
                rows={exportRows}
                filename={`courant-national-${range}${exportSuffix}.csv`}
              />
            </>
          }
        />
        <div className="mb-2 flex flex-wrap items-end gap-x-6 gap-y-2">
          <p className="font-display text-[64px] leading-[0.95] font-extrabold tracking-tight text-ink-100 [font-stretch:115%] md:text-[76px]">
            {formatGigawatts(latest.consommation)}
            <span className="text-[26px] font-semibold text-ink-40"> GW</span>
          </p>
          <p className="pb-2 text-[14px] text-ink-60">
            {formatFreshness(latest.ts)} · consommation électrique de la France
          </p>
        </div>
        {filteredOut ? (
          <div className="flex h-[240px] flex-col items-center justify-center gap-1.5 px-4 text-center">
            <p className="font-data text-sm text-ink-60">
              Aucune mesure ne correspond aux critères choisis.
            </p>
            <p className="max-w-md font-data text-[11.5px] text-ink-40">
              Les {total} points de la période existent : ils sont seulement écartés par la maturité
              retenue. Élargissez le critère ou revenez à la vue par défaut.
            </p>
          </div>
        ) : (
          <>
            <ChartSlot heightClass="h-[240px] w-full">
              <EChart
                option={heroOption}
                group={TIME_COLUMN_GROUP}
                ariaLabel={`Courbe de consommation (${RANGE_HINTS[range]}), dernier point complet ${formatGigawatts(latest.consommation)} gigawatts à ${formatParisClock(latest.ts)}, comparée aux prévisions RTE. Zoom possible à la molette.${[
                  carbonNote,
                  driftNote,
                ]
                  .filter((note) => note !== null)
                  .map((note) => ` Mise en évidence : ${note}.`)
                  .join('')}`}
                className="h-[240px] w-full"
              />
            </ChartSlot>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-60">
              <span className="flex items-center gap-1.5">
                <i className="h-[3px] w-3.5 rounded-sm bg-accent" />{' '}
                <b className="font-medium text-ink-100">Réalisé</b>
              </span>
              <span className="flex items-center gap-1.5">
                <ForecastSwatch color={palette.forecastToday} dash="2 3" /> Prévision J
              </span>
              <span className="flex items-center gap-1.5">
                <ForecastSwatch color={palette.forecastDayBefore} dash="6 3" /> Prévision J-1
              </span>
              <span className="text-[10.5px] text-ink-40">
                molette ou pincement : zoom temporel
              </span>
              {carbonNote !== null && (
                <span className="flex items-center gap-1.5 text-[10.5px] text-ink-40">
                  <i className="h-2.5 w-3.5 rounded-[2px] bg-ink-40/25" />
                  {carbonNote}
                </span>
              )}
              {driftNote !== null && (
                <span className="flex items-center gap-1.5 text-[10.5px] text-ink-40">
                  <i className="h-2.5 w-3.5 rounded-[2px] bg-accent/15" />
                  {driftNote}
                </span>
              )}
            </p>
          </>
        )}
      </article>

      <article className="panel rounded-t-none border-t-0 p-5 md:p-6">
        <SectionHeader
          as="h3"
          title="Mix de production"
          subtitle="D'où vient l'électricité, filière par filière, sur le même axe de temps : le curseur traverse les deux graphes."
        />
        {filteredOut ? (
          <p className="flex h-[120px] items-center justify-center font-data text-[12.5px] text-ink-40">
            Mix masqué par le même critère de maturité.
          </p>
        ) : (
          <ChartSlot heightClass="h-[210px] w-full">
            <EChart
              option={mixOption}
              group={TIME_COLUMN_GROUP}
              ariaLabel="Aires empilées de la production par filière, du nucléaire en base aux filières d'appoint. La légende permet de masquer des filières."
              className="h-[210px] w-full"
            />
          </ChartSlot>
        )}
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12.5px] text-ink-60">
          {palette.fuels.map((fuel) => {
            const value = latest[fuel.key]
            const visible = filters.fuels.has(fuel.key)
            // au moins une filière reste affichée : le dernier chip actif le dit
            // au lieu d'ignorer le clic en silence
            return (
              <ToggleChip
                key={fuel.key}
                label={fuel.label}
                pressed={visible}
                color={fuel.color}
                value={value === null ? 'n.d.' : formatGigawatts(value)}
                title={visible ? `Masquer ${fuel.label}` : `Réafficher ${fuel.label}`}
                lockedReason={
                  visible && filters.fuels.size <= 1
                    ? 'Au moins une filière doit rester affichée'
                    : undefined
                }
                onToggle={() => {
                  onFiltersChange({ fuels: toggleWithFloor(filters.fuels, fuel.key) })
                }}
              />
            )
          })}
          <span className="text-[10.5px] text-ink-40">
            clic : masquer ou réafficher une filière
          </span>
        </p>
      </article>
    </section>
  )
}

function LoadingState() {
  return (
    <section
      aria-label="Chargement des données"
      className="grid gap-3.5"
      data-testid="dashboard-loading"
    >
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="panel h-32 animate-pulse" />
        ))}
      </div>
      <div className="panel h-[560px] animate-pulse" />
    </section>
  )
}

function UnavailableState({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="panel px-6 py-12 text-center">
      <h2 className="font-display text-2xl font-bold text-ink-100">Données indisponibles</h2>
      <p className="mx-auto mt-2 max-w-xl text-[14px] text-ink-60">
        La source ne répond pas pour le moment. Courant n'affiche jamais de chiffres simulés : le
        tableau de bord reviendra avec les vraies données.
      </p>
      <button type="button" onClick={onRetry} className="btn-primary mt-6">
        Réessayer
      </button>
    </section>
  )
}

export function Dashboard() {
  const { filters, setFilters, reset } = useFilters()
  const latestQuery = useNationalLatest()
  const spark24hQuery = useNationalSeries('24h')
  const rangeQuery = useNationalSeries(filters.range)
  const regionalQuery = useRegionalData()
  const metropolesQuery = useMetropolesData()
  const ecowattQuery = useEcowattData()
  const tempoQuery = useTempoData()
  const briefQuery = useBriefData()
  const trvQuery = useTrvCurrent()
  const tempoCalendarQuery = useTempoCalendar()
  const offersQuery = useSupplierOffers()
  const reduceMotion = usePrefersReducedMotion()

  const exploreRegion = (code: string) => {
    setFilters({ territory: { kind: 'region', code } })
    const explorer = document.getElementById('explorer')
    if (explorer !== null) {
      // le focus suit la navigation (clavier et lecteurs d'écran), le défilement
      // respecte la préférence de mouvement réduit
      explorer.focus({ preventScroll: true })
      explorer.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
    }
  }

  const latest = latestQuery.data ?? null
  const refreshFailing = latestQuery.isError || rangeQuery.isError
  // les critères portent sur les séries affichées ; le dernier point publié (KPI et gros
  // chiffre) reste la mesure la plus fraîche disponible, jamais filtrée.
  // Le repli sur [] vit dans le calcul mémoïsé : sinon un tableau neuf à chaque rendu
  // relancerait un setOption ECharts complet.
  const sparkData = spark24hQuery.data
  const rangeData = rangeQuery.data
  const filteredRange = useMemo(() => applyFilters(rangeData ?? [], filters), [rangeData, filters])
  const filteredSpark = useMemo(
    () => applyFilters(sparkData ?? [], filters).points,
    [sparkData, filters],
  )

  return (
    <div className="flex min-h-screen flex-col text-ink-100">
      <DashboardHeader freshTs={latest?.ts ?? null} />
      <main className="mx-auto grid w-full max-w-[1360px] flex-1 content-start gap-6 px-5 pt-8 pb-16 md:px-7">
        <section aria-label="Introduction" className="pb-1">
          <h2 className="max-w-3xl font-display text-[34px] leading-[1.05] font-extrabold tracking-[-0.02em] text-ink-100 [font-stretch:110%] md:text-[46px]">
            L'électricité française, <span className="text-accent">en direct</span>.
          </h2>
          <div className="current-line mt-4 w-24" aria-hidden="true" />
          <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-ink-60">
            Ce que la France consomme et produit à cet instant, ce qu'annoncent Ecowatt et Tempo, et
            ce que ta propre consommation coûterait selon les tarifs. Données publiques RTE, sans
            compte ni cookie.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <a href="#compare" className="btn-primary no-underline">
              Comparer ma facture
            </a>
            <a href="#explorer" className="btn-secondary no-underline">
              Explorer ma région
            </a>
          </div>
        </section>
        {latest !== null && refreshFailing && (
          <p className="panel px-4 py-3 text-[13px] text-ink-60">
            Actualisation en échec : les chiffres affichés restent les dernières{' '}
            {formatFreshness(latest.ts).replace('données de', 'données réelles, de')}.
          </p>
        )}
        {latest === null && (latestQuery.isPending || rangeQuery.isPending) && <LoadingState />}
        {latest === null && !latestQuery.isPending && (
          <UnavailableState
            onRetry={() => {
              void latestQuery.refetch()
              void rangeQuery.refetch()
            }}
          />
        )}
        {latest !== null && (
          <>
            <KpiRow latest={latest} points={filteredSpark} />
            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
              <TimeColumn
                latest={latest}
                points={filteredRange.points}
                filters={filters}
                onFiltersChange={setFilters}
                onReset={reset}
                kept={filteredRange.kept}
                total={filteredRange.total}
              />
              <div className="flex flex-col gap-6">
                <div id="regions" className="scroll-mt-24">
                  <MapSection
                    regions={regionalQuery.data ?? []}
                    national={latest}
                    regionsStatus={regionalQuery.status}
                    metric={filters.mapMetric}
                    onMetricChange={(mapMetric) => {
                      setFilters({ mapMetric })
                    }}
                    onExploreRegion={exploreRegion}
                  />
                </div>
                {/* priorité mobile du brief : les signaux avant la carte */}
                <div id="signaux" className="order-first scroll-mt-24 xl:order-none">
                  <SignalsSection
                    ecowatt={ecowattQuery.data ?? []}
                    ecowattStatus={ecowattQuery.status}
                    tempo={tempoQuery.data ?? null}
                    tempoStatus={tempoQuery.status}
                    today={parisDayIso()}
                  />
                </div>
              </div>
            </div>
            <div id="metropoles" className="scroll-mt-24">
              <MetropolesSection
                points={metropolesQuery.data ?? []}
                status={metropolesQuery.status}
              />
            </div>
            <ExplorerSection
              regions={regionalQuery.data ?? []}
              metropoles={metropolesQuery.data ?? []}
              national={latest}
              territory={filters.territory}
              onTerritoryChange={(territory) => {
                // changer de territoire principal ne garde pas une comparaison qui
                // ferait doublon avec lui
                setFilters({
                  territory,
                  compare: filters.compare.filter(
                    (ref) => territoryKey(ref) !== territoryKey(territory),
                  ),
                })
              }}
              compare={filters.compare}
              onCompareChange={(compare) => {
                setFilters({ compare })
              }}
              range={filters.range}
              onRangeChange={(range) => {
                setFilters({ range })
              }}
            />
            <div id="compare" className="scroll-mt-24">
              <CompareSection
                tariffs={trvQuery.data ?? []}
                tariffsStatus={trvQuery.status}
                calendar={tempoCalendarQuery.data ?? []}
                offers={offersQuery.data ?? []}
                offersStatus={offersQuery.status}
              />
            </div>
            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
              <div id="brief" className="scroll-mt-24">
                <BriefSection brief={briefQuery.data ?? null} status={briefQuery.status} />
              </div>
              <div id="question" className="scroll-mt-24">
                <ChatSection />
              </div>
            </div>
          </>
        )}
      </main>
      <footer className="border-t border-line px-5 py-8 md:px-7">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-x-8 gap-y-3 text-[13px] text-ink-40">
          <span className="font-semibold text-ink-60">Courant</span>
          <span>Données publiques RTE via ODRÉ et open data CRE</span>
          <span>Projet indépendant, non affilié à RTE ni à un fournisseur</span>
          <span>Aucun compte, aucun cookie, aucune donnée personnelle conservée</span>
          <a
            className="text-ink-60 underline decoration-line-strong underline-offset-4 hover:text-accent"
            href="https://github.com/FaridP92/courant"
          >
            Sous le capot (GitHub)
          </a>
        </div>
      </footer>
    </div>
  )
}
