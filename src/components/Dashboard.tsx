import type { NationalLatest, NationalPoint } from '../lib/api.ts'
import { exchangeBalanceMw, nuclearShare, renewablesShare } from '../lib/energy.ts'
import {
  formatFreshness,
  formatGigawatts,
  formatParisClock,
  formatSignedGigawatts,
  formatSignedPercent,
  formatWholePercent,
} from '../lib/format.ts'
import { accent, forecastDayBefore, forecastToday, FUELS, ink } from '../lib/palette.ts'
import { useNationalData } from '../hooks/useNationalData.ts'
import { lazy, Suspense } from 'react'
import {
  buildHeroChartOption,
  buildMixChartOption,
  heroScaleBoundsGw,
} from './charts/chartOptions.ts'
import { DashboardHeader } from './DashboardHeader.tsx'
import { KpiCard } from './KpiCard.tsx'

// ECharts pèse lourd : chargé en chunk séparé après le premier rendu (ADR-0001)
const EChart = lazy(() => import('./charts/EChart.tsx').then((m) => ({ default: m.EChart })))

function ChartSlot({ heightClass, children }: { heightClass: string; children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className={heightClass} aria-hidden="true" />}>{children}</Suspense>
  )
}

const TIME_COLUMN_GROUP = 'time-column'
/** 6 dernières heures au quart d'heure : la fenêtre des sparklines KPI. */
const SPARK_POINTS = 24

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
      className="grid grid-cols-2 gap-3.5 lg:grid-cols-5"
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
        sparkColor={accent}
        sparkFilled
      />
      <KpiCard
        label="Nucléaire"
        value={nuclear === null ? 'n.d.' : formatWholePercent(nuclear)}
        unit={nuclear === null ? '' : '%'}
        detail={`${formatGigawatts(latest.nucleaire)} GW produits`}
        sparkValues={sparkSeries(observed, (p) => p.nucleaire)}
        sparkColor={FUELS[0]?.color ?? accent}
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
        sparkColor={FUELS[1]?.color ?? accent}
      />
      <KpiCard
        label="Intensité CO2"
        value={String(latest.taux_co2)}
        unit="g/kWh"
        detail="empreinte carbone du kWh"
        sparkValues={sparkSeries(observed, (p) => p.taux_co2)}
        sparkColor={ink.mid}
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
        sparkColor={ink.mid}
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
}: {
  latest: NationalLatest
  points: readonly NationalPoint[]
}) {
  const scale = heroScaleBoundsGw(points)
  return (
    <section aria-label="Consommation et mix de production sur 24 heures">
      <article className="rounded-t-(--radius-card) border border-line bg-panel p-4 shadow-(--shadow-card)">
        <h2 className="mb-2 font-data text-[11px] font-semibold tracking-[0.16em] text-ink-40 uppercase">
          Consommation nationale{' '}
          <span className="font-normal tracking-normal normal-case">
            réalisé vs prévisions RTE · 24 h
            {scale !== null && ` · échelle ${String(scale.min)}-${String(scale.max)} GW`}
          </span>
        </h2>
        <div className="mb-1 flex flex-wrap items-end gap-x-7 gap-y-2">
          <p className="font-display text-[72px] leading-[0.95] font-extrabold tracking-tight text-ink-100 [font-stretch:120%] [text-shadow:0_0_34px_rgba(46,230,255,0.18)]">
            {formatGigawatts(latest.consommation)}
            <span className="text-[28px] font-semibold text-ink-60"> GW</span>
          </p>
          <p className="pb-2 text-[13.5px] text-ink-60">
            {formatFreshness(latest.ts)} · consommation électrique de la France
          </p>
        </div>
        <ChartSlot heightClass="h-[240px] w-full">
          <EChart
            option={buildHeroChartOption(points)}
            group={TIME_COLUMN_GROUP}
            ariaLabel={`Courbe de consommation sur 24 heures, dernier point complet ${formatGigawatts(latest.consommation)} gigawatts à ${formatParisClock(latest.ts)}, comparée aux prévisions RTE de la veille et du jour.`}
            className="h-[240px] w-full"
          />
        </ChartSlot>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-data text-[11.5px] text-ink-60">
          <span className="flex items-center gap-1.5">
            <i className="h-[3px] w-3.5 rounded-sm bg-accent" />{' '}
            <b className="font-medium text-ink-100">Réalisé</b>
          </span>
          <span className="flex items-center gap-1.5">
            <ForecastSwatch color={forecastToday} dash="2 3" /> Prévision J
          </span>
          <span className="flex items-center gap-1.5">
            <ForecastSwatch color={forecastDayBefore} dash="6 3" /> Prévision J-1
          </span>
        </p>
      </article>

      <article className="rounded-b-(--radius-card) border border-t-0 border-line bg-panel p-4 shadow-(--shadow-card)">
        <h2 className="mb-2 font-data text-[11px] font-semibold tracking-[0.16em] text-ink-40 uppercase">
          Mix de production{' '}
          <span className="font-normal tracking-normal normal-case">
            même axe temporel : le curseur traverse les deux vues · échelle complète depuis 0
          </span>
        </h2>
        <ChartSlot heightClass="h-[210px] w-full">
          <EChart
            option={buildMixChartOption(points)}
            group={TIME_COLUMN_GROUP}
            ariaLabel="Aires empilées de la production par filière sur 24 heures, du nucléaire en base aux filières d'appoint."
            className="h-[210px] w-full"
          />
        </ChartSlot>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-data text-[11.5px] text-ink-60">
          {FUELS.map((fuel) => {
            const value = latest[fuel.key]
            return (
              <span key={fuel.key} className="flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: fuel.color }} />
                {fuel.label}{' '}
                <b className="font-medium text-ink-100">
                  {value === null ? 'n.d.' : formatGigawatts(value)}
                </b>
              </span>
            )
          })}
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
          <div
            key={i}
            className="h-32 animate-pulse rounded-(--radius-card) border border-line bg-panel"
          />
        ))}
      </div>
      <div className="h-[560px] animate-pulse rounded-(--radius-card) border border-line bg-panel" />
    </section>
  )
}

function UnavailableState({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="rounded-(--radius-card) border border-line bg-panel px-6 py-10 text-center">
      <h2 className="font-display text-2xl font-bold text-ink-100">Données indisponibles</h2>
      <p className="mx-auto mt-2 max-w-xl text-[14px] text-ink-60">
        La source ne répond pas pour le moment. Courant n'affiche jamais de chiffres simulés : le
        tableau de bord reviendra avec les vraies données.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 rounded-md border border-line-strong px-5 py-2 font-data text-sm text-ink-60 transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Réessayer
      </button>
    </section>
  )
}

export function Dashboard() {
  const { latestQuery, seriesQuery } = useNationalData()
  const latest = latestQuery.data ?? null
  const points = seriesQuery.data ?? []
  const refreshFailing = latestQuery.isError || seriesQuery.isError

  return (
    <div className="flex min-h-screen flex-col text-ink-100">
      <DashboardHeader freshTs={latest?.ts ?? null} />
      <main className="mx-auto grid w-full max-w-[1360px] flex-1 content-start gap-3.5 px-7 pb-10">
        {latest !== null && refreshFailing && (
          <p className="rounded-md border border-line-strong bg-panel px-4 py-2.5 font-data text-[12.5px] text-ink-60">
            Actualisation en échec : les chiffres affichés restent les dernières{' '}
            {formatFreshness(latest.ts).replace('données de', 'données réelles, de')}.
          </p>
        )}
        {latest === null && (latestQuery.isPending || seriesQuery.isPending) && <LoadingState />}
        {latest === null && !latestQuery.isPending && (
          <UnavailableState
            onRetry={() => {
              void latestQuery.refetch()
              void seriesQuery.refetch()
            }}
          />
        )}
        {latest !== null && (
          <>
            <KpiRow latest={latest} points={points} />
            <TimeColumn latest={latest} points={points} />
          </>
        )}
      </main>
      <footer className="border-t border-line px-7 py-4">
        <p className="mx-auto flex max-w-[1360px] flex-wrap gap-x-6 gap-y-1.5 font-data text-[11.5px] text-ink-40">
          <span>Données : RTE via ODRÉ (open data)</span>
          <span>Projet indépendant, non affilié à RTE</span>
          <a
            className="border-b border-dashed border-line-strong text-ink-60 hover:border-accent hover:text-accent"
            href="/design/maquette.html"
          >
            Voir la maquette (Phase 0)
          </a>
          <a
            className="border-b border-dashed border-line-strong text-ink-60 hover:border-accent hover:text-accent"
            href="https://github.com/FaridP92/courant"
          >
            GitHub
          </a>
        </p>
      </footer>
    </div>
  )
}
