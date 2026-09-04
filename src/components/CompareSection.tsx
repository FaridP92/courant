import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { PriceGrid, SupplierOffer, TempoCalendarDay, TrvTariff } from '../lib/api.ts'
import { parseEnedisBuffer, type EnedisData } from '../lib/enedisExport.ts'
import { formatParisDate } from '../lib/format.ts'
import {
  computeBase,
  computeHphc,
  computeTempo,
  coveredDays,
  isValidWindow,
  minutesOfDay,
  rangeHphc,
  rangeTempoDaily,
  splitByTempo,
  splitHphc,
  yearLengthFor,
  type CostBreakdown,
  type CostRange,
  type OffPeakWindow,
} from '../lib/tariffs.ts'
import { SectionHeader } from './SectionHeader.tsx'

/**
 * « Compare ta facture » (ADR-0009) : la consommation ne quitte jamais le navigateur.
 * Étape 1 : saisie manuelle (annuelle) ou export Enedis, CSV ou classeur Excel, courbe de
 * charge 30 min ou consommation quotidienne. Étape 2 : ce que cette consommation coûterait,
 * abonnement compris, au tarif réglementé et chez les fournisseurs de marché dont la grille
 * publique a été collectée et vérifiée (v_supplier_offers_current). Coûts sur la période du
 * fichier, abonnement au prorata. Le coût Tempo exact s'appuie sur le calendrier réel des
 * couleurs et sur les heures creuses réglementaires de l'option (22 h à 6 h). Quand la
 * donnée ne sépare pas heures pleines et heures creuses (export quotidien), on affiche des
 * bornes exactes, jamais une estimation.
 */

type QueryStatus = 'pending' | 'error' | 'success'
type Mode = 'manual' | 'file'

/** Puissance la plus répandue chez les particuliers. */
const DEFAULT_POWER_KVA = 6

const CRE_URL =
  'https://www.cre.fr/documents/open-data/historique-des-tarifs-reglementes-de-vente-delectricite-pour-les-consommateurs-residentiels.html'

const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
const eurosSigned = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  signDisplay: 'always',
})
const kwhFormat = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const TRV_LABELS: Record<TrvTariff['option'], string> = {
  BASE: 'Tarif Bleu Base',
  HPHC: 'Tarif Bleu Heures creuses',
  TEMPO: 'Tarif Bleu Tempo',
}

/** Une grille comparable, réglementée ou de marché, avec ce qu'il faut pour l'afficher. */
interface Grid extends PriceGrid {
  id: string
  supplier: string
  offer: string
  kind: 'trv' | 'market'
  tags: string[]
  sourceUrl: string
  gridDate: string | null
}

interface Row {
  grid: Grid
  cost: CostBreakdown | null
  range: CostRange | null
  reason: string | null
}

const rowOf = (grid: Grid, patch: Partial<Row>): Row => ({
  grid,
  cost: null,
  range: null,
  reason: null,
  ...patch,
})

const positive = (raw: string): number => {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** « 1 ligne écartée » / « 3 lignes écartées » : nom et participe accordés ensemble. */
const count = (n: number, one: string, many: string): string => `${String(n)} ${n > 1 ? many : one}`

/** Durée couverte lisible : en heures sous deux jours, sinon en jours arrondis. */
const periodLabel = (days: number): string =>
  days < 2 ? `${String(Math.round(days * 24))} h` : count(Math.round(days), 'jour', 'jours')

const dayText = (day: string): string => formatParisDate(`${day}T12:00:00Z`)

function trvGrids(tariffs: readonly TrvTariff[]): Grid[] {
  return tariffs.map((t) => ({
    id: `trv-${t.option}-${String(t.p_souscrite)}`,
    supplier: 'EDF',
    offer: TRV_LABELS[t.option],
    kind: 'trv',
    tags: ['Tarif réglementé'],
    sourceUrl: CRE_URL,
    gridDate: t.date_debut,
    option: t.option,
    p_souscrite: t.p_souscrite,
    fixed_ttc: t.fixed_ttc,
    prices_ttc: t.prices_ttc,
  }))
}

function marketGrids(offers: readonly SupplierOffer[]): Grid[] {
  return offers.map((o) => {
    const tags: string[] = []
    if (o.pricing_type === 'fixe') {
      tags.push(
        o.price_locked_until === null
          ? 'Prix fixe'
          : `Prix fixe jusqu'au ${dayText(o.price_locked_until)}`,
      )
    } else {
      tags.push('Indexé sur le tarif réglementé')
    }
    if (o.green) tags.push('Électricité verte')
    return {
      id: `market-${o.supplier}-${o.offer}-${o.option}-${String(o.p_souscrite)}`,
      supplier: o.supplier,
      offer: o.offer,
      kind: 'market',
      tags,
      sourceUrl: o.source_url,
      gridDate: o.grid_date,
      option: o.option,
      p_souscrite: o.p_souscrite,
      fixed_ttc: o.fixed_ttc,
      prices_ttc: o.prices_ttc,
    }
  })
}

/** Les coûts exacts d'abord, du moins cher au plus cher, puis les fourchettes, puis
 * les lignes qui expliquent pourquoi elles ne se calculent pas. */
function sortRows(rows: readonly Row[]): Row[] {
  const rank = (r: Row): number => (r.cost !== null ? 0 : r.range !== null ? 1 : 2)
  const key = (r: Row): number => r.cost?.total ?? r.range?.totalMin ?? 0
  return [...rows].sort((a, b) => rank(a) - rank(b) || key(a) - key(b))
}

function CostCell({
  value,
  range,
  strong = false,
}: {
  value: number | null
  range: [number, number] | null
  strong?: boolean
}) {
  let content: ReactNode
  if (range !== null) content = `${euros.format(range[0])} à ${euros.format(range[1])}`
  else if (value !== null) content = euros.format(value)
  else content = <span className="sr-only">non calculé</span>
  return (
    <td
      className={`px-3 py-3 text-right font-data text-[14px] whitespace-nowrap ${strong ? 'font-semibold text-ink-100' : 'text-ink-60'}`}
    >
      {content}
    </td>
  )
}

const inputClass =
  'w-full rounded-xl border border-line-strong bg-panel px-3.5 py-2.5 text-[15px] text-ink-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent'

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="eyebrow mb-1.5 block">
        {label}
      </label>
      {children}
    </div>
  )
}

function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Field id={id} label={label}>
      <input
        id={id}
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
        }}
        className={inputClass}
      />
    </Field>
  )
}

export function CompareSection({
  tariffs,
  tariffsStatus,
  calendar,
  offers,
  offersStatus,
}: {
  tariffs: readonly TrvTariff[]
  tariffsStatus: QueryStatus
  calendar: readonly TempoCalendarDay[]
  offers: readonly SupplierOffer[]
  offersStatus: QueryStatus
}) {
  const [mode, setMode] = useState<Mode>('manual')
  const [powerChoice, setPowerChoice] = useState<number | null>(null)
  const [annualKwh, setAnnualKwh] = useState('')
  const [knowsHphc, setKnowsHphc] = useState(false)
  const [hpKwh, setHpKwh] = useState('')
  const [hcKwh, setHcKwh] = useState('')
  const [offPeakFrom, setOffPeakFrom] = useState('22:00')
  const [offPeakTo, setOffPeakTo] = useState('06:00')
  const [data, setData] = useState<EnedisData | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  // un fichier déposé pendant la lecture du précédent : seul le dernier compte
  const fileSeq = useRef(0)

  const curve = data?.kind === 'curve' ? data : null
  const daily = data?.kind === 'daily' ? data : null

  const grids = useMemo(() => [...trvGrids(tariffs), ...marketGrids(offers)], [tariffs, offers])
  const powers = useMemo(
    () => [...new Set(grids.map((g) => g.p_souscrite))].sort((a, b) => a - b),
    [grids],
  )
  // la puissance calculée est toujours celle affichée : par défaut 6 kVA (la plus
  // courante), sinon la première puissance disponible
  const fallbackPower = powers.includes(DEFAULT_POWER_KVA) ? DEFAULT_POWER_KVA : (powers[0] ?? null)
  const power = powerChoice !== null && powers.includes(powerChoice) ? powerChoice : fallbackPower

  const calendarMap = useMemo(
    () => new Map(calendar.map((d) => [d.day, d.color] as const)),
    [calendar],
  )
  const calendarBounds = useMemo(() => {
    const first = calendar[0]?.day
    const last = calendar[calendar.length - 1]?.day
    return first === undefined || last === undefined
      ? null
      : `du ${dayText(first)} au ${dayText(last)}`
  }, [calendar])

  const offPeak = useMemo((): OffPeakWindow | null => {
    const from = minutesOfDay(offPeakFrom)
    const to = minutesOfDay(offPeakTo)
    return from === null || to === null ? null : { from, to }
  }, [offPeakFrom, offPeakTo])
  const offPeakValid = offPeak !== null && isValidWindow(offPeak)

  // les répartitions parcourent jusqu'à 17 520 mesures : calculées une fois par fichier
  const hphcSplit = useMemo(
    () => (curve === null || !offPeakValid ? null : splitHphc(curve.readings, [offPeak])),
    [curve, offPeak, offPeakValid],
  )
  const tempoSplit = useMemo(
    () => (curve === null ? null : splitByTempo(curve.readings, calendarMap)),
    [curve, calendarMap],
  )
  const period = useMemo(() => {
    if (curve !== null) {
      return {
        days: coveredDays(curve.from, curve.to),
        yearLength: yearLengthFor(curve.from, curve.to),
      }
    }
    if (daily !== null) {
      return {
        days: daily.dayCount,
        yearLength: yearLengthFor(`${daily.firstDay}T00:00:00Z`, `${daily.lastDay}T23:59:59Z`),
      }
    }
    return null
  }, [curve, daily])

  const rows = useMemo((): Row[] => {
    const uncoveredReason = (kwh: number): string =>
      calendarBounds === null
        ? 'calendrier Tempo indisponible, coût non calculable'
        : `${kwhFormat.format(kwh)} kWh hors du calendrier Tempo connu (${calendarBounds})`
    const candidates = grids.filter((g) => g.p_souscrite === power)
    const computed = candidates.map((grid): Row => {
      const { option } = grid
      if (mode === 'manual') {
        const hp = positive(hpKwh)
        const hc = positive(hcKwh)
        const split = knowsHphc && hp + hc > 0 ? { hp, hc } : null
        if (option === 'BASE') {
          const kwh = split === null ? positive(annualKwh) : split.hp + split.hc
          return rowOf(grid, { cost: kwh > 0 ? computeBase(kwh, grid) : null })
        }
        if (option === 'HPHC') {
          if (!knowsHphc) {
            return rowOf(grid, {
              reason: 'cochez « je connais ma répartition » et saisissez vos kWh HP et HC',
            })
          }
          return split === null
            ? rowOf(grid, { reason: 'saisissez vos kWh heures pleines et heures creuses' })
            : rowOf(grid, { cost: computeHphc(split, grid) })
        }
        return rowOf(grid, {
          reason: 'nécessite votre courbe de charge Enedis (couleurs Tempo jour par jour)',
        })
      }
      if (period === null) return rowOf(grid, {})
      const scaled = { ...grid, fixed_ttc: (grid.fixed_ttc * period.days) / period.yearLength }
      if (daily !== null) {
        if (option === 'BASE') return rowOf(grid, { cost: computeBase(daily.totalKwh, scaled) })
        if (option === 'HPHC') return rowOf(grid, { range: rangeHphc(daily.totalKwh, scaled) })
        const tempo = rangeTempoDaily(daily.days, calendarMap, scaled)
        if (tempo === null) return rowOf(grid, {})
        return tempo.uncoveredKwh > 0
          ? rowOf(grid, { reason: uncoveredReason(tempo.uncoveredKwh) })
          : rowOf(grid, { range: tempo.range })
      }
      if (curve === null) return rowOf(grid, {})
      if (option === 'BASE') return rowOf(grid, { cost: computeBase(curve.totalKwh, scaled) })
      if (option === 'HPHC') {
        return hphcSplit === null
          ? rowOf(grid, {
              reason: "plage d'heures creuses invalide : début et fin doivent différer",
            })
          : rowOf(grid, { cost: computeHphc(hphcSplit, scaled) })
      }
      if (tempoSplit === null) return rowOf(grid, {})
      return tempoSplit.uncoveredKwh > 0
        ? rowOf(grid, { reason: uncoveredReason(tempoSplit.uncoveredKwh) })
        : rowOf(grid, { cost: computeTempo(tempoSplit.buckets, scaled) })
    })
    return sortRows(computed)
  }, [
    grids,
    power,
    mode,
    annualKwh,
    knowsHphc,
    hpKwh,
    hcKwh,
    curve,
    daily,
    period,
    hphcSplit,
    tempoSplit,
    calendarMap,
    calendarBounds,
  ])

  const hasAnyCost = rows.some((r) => r.cost !== null || r.range !== null)
  const cheapest = rows.find((r) => r.cost !== null) ?? null

  const onFile = (file: File | undefined) => {
    fileSeq.current += 1
    const seq = fileSeq.current
    setData(null)
    setFileError(null)
    if (file === undefined) return
    const reader = new FileReader()
    // seul le dernier fichier déposé compte, y compris pour ses erreurs de lecture
    const current = () => seq === fileSeq.current
    reader.onload = () => {
      const buffer = reader.result
      if (!(buffer instanceof ArrayBuffer)) {
        if (current()) setFileError('Impossible de lire ce fichier.')
        return
      }
      void parseEnedisBuffer(buffer).then((outcome) => {
        if (!current()) return
        if (outcome.ok) setData(outcome.result)
        else setFileError(outcome.reason)
      })
    }
    reader.onerror = () => {
      if (current()) setFileError('Impossible de lire ce fichier.')
    }
    reader.readAsArrayBuffer(file)
  }

  const gridDate = tariffs[0]?.date_debut ?? null
  const periodText = period === null ? null : periodLabel(period.days)
  const missingDays = daily === null ? 0 : daily.dayCount - daily.days.length
  const skippedText = (n: number) => count(n, 'ligne écartée', 'lignes écartées')

  let summary: string | null = null
  if (curve !== null && periodText !== null) {
    summary = `${kwhFormat.format(curve.totalKwh)} kWh sur ${periodText}, du ${formatParisDate(curve.from)} au ${formatParisDate(curve.to)}, pas de ${String(curve.stepMinutes)} min${curve.skippedRows > 0 ? ` (${skippedText(curve.skippedRows)})` : ''}.`
  } else if (daily !== null) {
    const span = `du ${dayText(daily.firstDay)} au ${dayText(daily.lastDay)}`
    const skipped = daily.skippedRows > 0 ? `, ${skippedText(daily.skippedRows)}` : ''
    // des jours manquent : l'énergie porte sur les jours mesurés, l'abonnement sur la période
    summary =
      missingDays > 0
        ? `${kwhFormat.format(daily.totalKwh)} kWh sur ${count(daily.days.length, 'jour mesuré', 'jours mesurés')} (période de ${count(daily.dayCount, 'jour civil', 'jours civils')}, ${count(missingDays, 'jour sans donnée', 'jours sans donnée')}${skipped}), ${span}.`
        : `${kwhFormat.format(daily.totalKwh)} kWh sur ${count(daily.dayCount, 'jour', 'jours')} de données quotidiennes, ${span}${daily.skippedRows > 0 ? ` (${skippedText(daily.skippedRows)})` : ''}.`
  }

  const marketCount = new Set(offers.map((o) => o.supplier)).size
  const checkedAt = offers.reduce<string | null>(
    (latest, o) => (latest === null || o.checked_at > latest ? o.checked_at : latest),
    null,
  )
  let offersNote: string
  if (offersStatus === 'pending' && offers.length === 0) {
    offersNote = 'Offres des fournisseurs de marché : chargement.'
  } else if (offers.length === 0) {
    offersNote =
      'Offres des fournisseurs de marché : indisponibles pour le moment. Seul le tarif réglementé est comparé.'
  } else {
    offersNote = `${count(marketCount, 'fournisseur de marché', 'fournisseurs de marché')} en plus du tarif réglementé, grilles publiques collectées automatiquement${checkedAt === null ? '' : ` et vérifiées le ${formatParisDate(checkedAt)}`}.`
  }

  let body: ReactNode
  if (tariffs.length === 0 && tariffsStatus === 'pending') {
    body = <p className="text-[14px] text-ink-40">Chargement des grilles tarifaires…</p>
  } else if (tariffs.length === 0) {
    body = (
      <p className="text-[14px] text-ink-40">Grilles tarifaires indisponibles pour le moment.</p>
    )
  } else {
    body = (
      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="flex flex-col gap-4 rounded-2xl bg-raised p-4 md:p-5">
          <p className="eyebrow">1. Ta consommation</p>
          <div
            role="group"
            aria-label="Mode de saisie"
            className="flex rounded-full border border-line-strong bg-panel p-0.5"
          >
            {(
              [
                ['manual', 'Saisir ma consommation'],
                ['file', 'Importer mon export Enedis'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => {
                  setMode(value)
                }}
                className={`flex-1 rounded-full px-3 py-1.5 text-[13px] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
                  mode === value
                    ? 'bg-accent font-semibold text-white'
                    : 'text-ink-60 hover:text-ink-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <Field id="compare-power" label="Puissance souscrite">
            <select
              id="compare-power"
              value={power ?? ''}
              onChange={(e) => {
                setPowerChoice(Number(e.target.value))
              }}
              className={inputClass}
            >
              {powers.map((p) => (
                <option key={p} value={p}>
                  {p} kVA
                </option>
              ))}
            </select>
          </Field>

          {mode === 'manual' ? (
            <>
              <NumberField
                id="compare-kwh"
                label="Consommation annuelle (kWh)"
                value={annualKwh}
                onChange={setAnnualKwh}
              />
              <label className="flex items-center gap-2 text-[13.5px] text-ink-60">
                <input
                  type="checkbox"
                  checked={knowsHphc}
                  onChange={(e) => {
                    setKnowsHphc(e.target.checked)
                  }}
                  className="h-4 w-4 accent-accent"
                />
                Je connais ma répartition heures pleines / heures creuses
              </label>
              {knowsHphc && (
                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    id="compare-hp"
                    label="Heures pleines (kWh)"
                    value={hpKwh}
                    onChange={setHpKwh}
                  />
                  <NumberField
                    id="compare-hc"
                    label="Heures creuses (kWh)"
                    value={hcKwh}
                    onChange={setHcKwh}
                  />
                </div>
              )}
              <p className="text-[12.5px] text-ink-40">
                Le total annuel figure sur ta facture ou dans ton espace fournisseur.
              </p>
            </>
          ) : (
            <>
              <Field id="compare-file" label="Fichier Enedis (CSV ou Excel)">
                <input
                  id="compare-file"
                  type="file"
                  accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => {
                    onFile(e.target.files?.[0])
                  }}
                  className="block w-full text-[13px] text-ink-60 file:mr-3 file:rounded-full file:border file:border-line-strong file:bg-panel file:px-3.5 file:py-1.5 file:text-[13px] file:font-medium file:text-ink-100"
                />
              </Field>
              {daily === null && (
                <div className="grid grid-cols-2 gap-3">
                  <Field id="compare-hc-from" label="Heures creuses de">
                    <input
                      id="compare-hc-from"
                      type="time"
                      step={1800}
                      value={offPeakFrom}
                      onChange={(e) => {
                        setOffPeakFrom(e.target.value)
                      }}
                      className={inputClass}
                    />
                  </Field>
                  <Field id="compare-hc-to" label="à">
                    <input
                      id="compare-hc-to"
                      type="time"
                      step={1800}
                      value={offPeakTo}
                      onChange={(e) => {
                        setOffPeakTo(e.target.value)
                      }}
                      className={inputClass}
                    />
                  </Field>
                </div>
              )}
              <p className="text-[12.5px] leading-relaxed text-ink-40">
                Espace client Enedis → Suivre mes mesures → Télécharger mes données : la courbe au
                pas de 30 minutes donne des coûts exacts, la consommation quotidienne des
                fourchettes. Plage de ton contrat heures creuses ci-dessus ; Tempo applique ses
                propres heures creuses, 22 h à 6 h. Le fichier ne quitte jamais votre navigateur :
                rien n'est envoyé ni conservé.
              </p>
              {fileError !== null && (
                <p className="text-[13px] font-medium text-signal-critical" role="alert">
                  {fileError}
                </p>
              )}
              <p className="text-[13px] text-ink-60" aria-live="polite">
                {summary}
              </p>
            </>
          )}
        </div>

        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <p className="eyebrow">2. Ce que tu paierais</p>
            {periodText !== null && hasAnyCost && (
              <p className="text-[12.5px] text-ink-40">
                Sur la période du fichier ({periodText}), abonnement au prorata.
              </p>
            )}
          </div>
          {hasAnyCost ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[14px]">
                <thead>
                  <tr className="border-b border-line text-left text-[12px] font-semibold text-ink-40">
                    <th scope="col" className="px-3 py-2">
                      Offre
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      Abonnement
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      Coût kWh
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      Total TTC
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      Écart
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const best = cheapest !== null && row.grid.id === cheapest.grid.id
                    const delta =
                      row.cost !== null && cheapest?.cost !== undefined && cheapest.cost !== null
                        ? row.cost.total - cheapest.cost.total
                        : null
                    return (
                      <tr
                        key={row.grid.id}
                        className={`border-b border-line/70 ${best ? 'bg-accent-soft' : ''} ${row.cost === null && row.range === null ? 'opacity-70' : ''}`}
                      >
                        <th scope="row" className="px-3 py-3 text-left font-normal">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-semibold text-ink-100">{row.grid.supplier}</span>
                            <span className="text-ink-60">{row.grid.offer}</span>
                            {best && (
                              <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">
                                Le moins cher
                              </span>
                            )}
                          </span>
                          <span className="mt-1 flex flex-wrap gap-1.5">
                            {row.grid.tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-40"
                              >
                                {tag}
                              </span>
                            ))}
                          </span>
                          {row.cost === null && row.range === null && row.reason !== null && (
                            <span className="mt-1 block text-[12px] text-ink-40">{row.reason}</span>
                          )}
                        </th>
                        <CostCell
                          value={row.cost?.subscription ?? row.range?.subscription ?? null}
                          range={null}
                        />
                        <CostCell
                          value={row.cost?.energy ?? null}
                          range={
                            row.range === null ? null : [row.range.energyMin, row.range.energyMax]
                          }
                        />
                        <CostCell
                          value={row.cost?.total ?? null}
                          range={
                            row.range === null ? null : [row.range.totalMin, row.range.totalMax]
                          }
                          strong
                        />
                        <td className="px-3 py-3 text-right font-data text-[13px] whitespace-nowrap text-ink-40">
                          {delta === null ? (
                            <span className="sr-only">non comparé</span>
                          ) : delta === 0 ? (
                            'référence'
                          ) : (
                            eurosSigned.format(delta)
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {daily !== null && (
                <p className="mt-2 text-[12.5px] text-ink-40">
                  {missingDays > 0 &&
                    `Énergie sur les ${count(daily.days.length, 'jour mesuré', 'jours mesurés')}, abonnement sur les ${count(daily.dayCount, 'jour', 'jours')} de la période. `}
                  Données quotidiennes : heures creuses et Tempo en fourchette, du
                  tout-heures-creuses au tout-heures-pleines. Pour une valeur exacte, active
                  l'enregistrement de la consommation horaire dans ton espace Enedis, puis exporte
                  la courbe au pas de 30 minutes.
                </p>
              )}
            </div>
          ) : (
            <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong px-6 text-center">
              <p className="text-[15px] font-medium text-ink-100">
                {mode === 'manual'
                  ? 'Saisis ta consommation annuelle pour voir le classement des offres.'
                  : 'Dépose ton export Enedis pour voir le classement des offres.'}
              </p>
              <p className="mt-1 max-w-md text-[13px] text-ink-40">
                Abonnement et prix du kWh TTC, du moins cher au plus cher, avec l'écart par rapport
                à la meilleure offre.
              </p>
            </div>
          )}
          <p className="mt-3 text-[12.5px] text-ink-40">{offersNote}</p>
        </div>
      </div>
    )
  }

  return (
    <section aria-label="Compare ta facture" className="panel p-5 md:p-6">
      <SectionHeader
        title="Compare ta facture"
        subtitle="Ta consommation, ce qu'elle coûterait chez chaque fournisseur, abonnement compris. Le calcul se fait dans ton navigateur : rien n'est envoyé."
        actions={<span className="chip">Rien ne quitte ton navigateur</span>}
      />
      {body}
      <p className="mt-5 border-t border-line pt-4 text-[12.5px] leading-relaxed text-ink-40">
        Estimation indicative TTC, hors promotions et remises ponctuelles. Tarifs réglementés de
        vente
        {gridDate !== null && ` en vigueur depuis le ${dayText(gridDate)}`}, source{' '}
        <a
          href={CRE_URL}
          target="_blank"
          rel="noreferrer"
          className="text-ink-60 underline decoration-line-strong underline-offset-4 hover:text-accent"
        >
          open data CRE
        </a>
        . Les grilles des fournisseurs viennent de leurs fiches tarifaires publiques et portent leur
        date. Pour décider, le comparateur officiel du Médiateur national de l'énergie fait foi.
      </p>
    </section>
  )
}
