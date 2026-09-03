import { useMemo, useState, type ReactNode } from 'react'
import type { TempoCalendarDay, TrvTariff } from '../lib/api.ts'
import { parseEnedisCsv, type EnedisCurve } from '../lib/enedisCsv.ts'
import { formatParisDate } from '../lib/format.ts'
import {
  computeBase,
  computeHphc,
  computeTempo,
  coveredDays,
  isValidWindow,
  minutesOfDay,
  splitByTempo,
  splitHphc,
  yearLengthFor,
  type CostBreakdown,
  type OffPeakWindow,
} from '../lib/tariffs.ts'

/**
 * « Compare ta conso » (ADR-0009) : la consommation ne quitte jamais le navigateur.
 * Deux entrées : saisie manuelle (annuelle) ou export Enedis (courbe 30 min, coûts sur
 * la période du fichier, abonnement au prorata). Tarifs réglementés depuis l'open data
 * CRE ; le coût Tempo exact s'appuie sur le calendrier réel des couleurs et sur les
 * heures creuses réglementaires de l'option (22 h à 6 h).
 */

type QueryStatus = 'pending' | 'error' | 'success'
type Mode = 'manual' | 'file'

const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
const kwhFormat = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const OPTION_LABELS: Record<TrvTariff['option'], string> = {
  BASE: 'Tarif Bleu Base',
  HPHC: 'Tarif Bleu Heures creuses',
  TEMPO: 'Tarif Bleu Tempo',
}

interface Row {
  option: TrvTariff['option']
  cost: CostBreakdown | null
  reason: string | null
}

const positive = (raw: string): number => {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function CostCell({ value }: { value: number | null }) {
  return (
    <td className="px-2 py-1.5 text-right font-data text-ink-100">
      {value === null ? <span className="sr-only">non calculé</span> : euros.format(value)}
    </td>
  )
}

const inputClass =
  'w-full rounded-md border border-line-strong bg-raised px-2.5 py-1.5 font-data text-sm text-ink-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent'
const labelClass = 'block font-data text-[10.5px] tracking-[0.08em] text-ink-40 uppercase'

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
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
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
    </div>
  )
}

export function CompareSection({
  tariffs,
  tariffsStatus,
  calendar,
}: {
  tariffs: readonly TrvTariff[]
  tariffsStatus: QueryStatus
  calendar: readonly TempoCalendarDay[]
}) {
  const [mode, setMode] = useState<Mode>('manual')
  const [powerChoice, setPowerChoice] = useState<number | null>(null)
  const [annualKwh, setAnnualKwh] = useState('')
  const [knowsHphc, setKnowsHphc] = useState(false)
  const [hpKwh, setHpKwh] = useState('')
  const [hcKwh, setHcKwh] = useState('')
  const [offPeakFrom, setOffPeakFrom] = useState('22:00')
  const [offPeakTo, setOffPeakTo] = useState('06:00')
  const [curve, setCurve] = useState<EnedisCurve | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  const powers = useMemo(
    () => [...new Set(tariffs.map((t) => t.p_souscrite))].sort((a, b) => a - b),
    [tariffs],
  )
  // la puissance calculée est toujours celle affichée : un choix absent des grilles
  // retombe sur la première puissance disponible
  const power =
    powerChoice !== null && powers.includes(powerChoice) ? powerChoice : (powers[0] ?? null)

  const calendarMap = useMemo(
    () => new Map(calendar.map((d) => [d.day, d.color] as const)),
    [calendar],
  )
  const calendarBounds = useMemo(() => {
    const first = calendar[0]?.day
    const last = calendar[calendar.length - 1]?.day
    return first === undefined || last === undefined
      ? null
      : `du ${formatParisDate(`${first}T12:00:00Z`)} au ${formatParisDate(`${last}T12:00:00Z`)}`
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
  const period = useMemo(
    () =>
      curve === null
        ? null
        : {
            days: coveredDays(curve.from, curve.to),
            yearLength: yearLengthFor(curve.from, curve.to),
          },
    [curve],
  )

  const rows = useMemo((): Row[] => {
    return (['BASE', 'HPHC', 'TEMPO'] as const).map((option) => {
      const tariff = tariffs.find((t) => t.option === option && t.p_souscrite === power) ?? null
      if (tariff === null) {
        return { option, cost: null, reason: 'grille indisponible pour cette puissance' }
      }
      if (mode === 'manual') {
        const hp = positive(hpKwh)
        const hc = positive(hcKwh)
        const split = knowsHphc && hp + hc > 0 ? { hp, hc } : null
        if (option === 'BASE') {
          const kwh = split === null ? positive(annualKwh) : split.hp + split.hc
          return kwh > 0
            ? { option, cost: computeBase(kwh, tariff), reason: null }
            : { option, cost: null, reason: null }
        }
        if (option === 'HPHC') {
          if (!knowsHphc) {
            return {
              option,
              cost: null,
              reason: 'cochez « je connais ma répartition » et saisissez vos kWh HP et HC',
            }
          }
          return split === null
            ? { option, cost: null, reason: 'saisissez vos kWh heures pleines et heures creuses' }
            : { option, cost: computeHphc(split, tariff), reason: null }
        }
        return {
          option,
          cost: null,
          reason: 'nécessite votre courbe de charge Enedis (couleurs Tempo jour par jour)',
        }
      }
      if (curve === null || period === null) return { option, cost: null, reason: null }
      const scaled = {
        ...tariff,
        fixed_ttc: (tariff.fixed_ttc * period.days) / period.yearLength,
      }
      if (option === 'BASE') {
        return { option, cost: computeBase(curve.totalKwh, scaled), reason: null }
      }
      if (option === 'HPHC') {
        return hphcSplit === null
          ? {
              option,
              cost: null,
              reason: "plage d'heures creuses invalide : début et fin doivent différer",
            }
          : { option, cost: computeHphc(hphcSplit, scaled), reason: null }
      }
      if (tempoSplit === null) return { option, cost: null, reason: null }
      if (tempoSplit.uncoveredKwh > 0) {
        return {
          option,
          cost: null,
          reason:
            calendarBounds === null
              ? 'calendrier Tempo indisponible, coût non calculable'
              : `${kwhFormat.format(tempoSplit.uncoveredKwh)} kWh hors du calendrier Tempo connu (${calendarBounds})`,
        }
      }
      return { option, cost: computeTempo(tempoSplit.buckets, scaled), reason: null }
    })
  }, [
    tariffs,
    power,
    mode,
    annualKwh,
    knowsHphc,
    hpKwh,
    hcKwh,
    curve,
    period,
    hphcSplit,
    tempoSplit,
    calendarBounds,
  ])

  const hasAnyCost = rows.some((r) => r.cost !== null)

  const onFile = (file: File | undefined) => {
    setCurve(null)
    setFileError(null)
    if (file === undefined) return
    const reader = new FileReader()
    reader.onload = () => {
      const outcome = parseEnedisCsv(typeof reader.result === 'string' ? reader.result : '')
      if (outcome.ok) setCurve(outcome.result)
      else setFileError(outcome.reason)
    }
    reader.onerror = () => {
      setFileError('Impossible de lire ce fichier.')
    }
    reader.readAsText(file)
  }

  const gridDate = tariffs[0]?.date_debut ?? null
  const displayDays = period === null ? null : Math.max(1, Math.round(period.days))

  let body: ReactNode
  if (tariffs.length === 0 && tariffsStatus === 'pending') {
    body = <p className="font-data text-sm text-ink-40">Chargement des grilles tarifaires…</p>
  } else if (tariffs.length === 0) {
    body = (
      <p className="font-data text-sm text-ink-40">
        Grilles tarifaires indisponibles pour le moment.
      </p>
    )
  } else {
    body = (
      <>
        <div
          role="group"
          aria-label="Mode de saisie"
          className="mb-3 flex overflow-hidden rounded-md border border-line-strong"
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
              className={`px-3 py-1.5 font-data text-xs transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
                mode === value
                  ? 'bg-accent font-semibold text-abyss'
                  : 'text-ink-60 hover:text-ink-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            <div>
              <label htmlFor="compare-power" className={labelClass}>
                Puissance souscrite
              </label>
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
            </div>

            {mode === 'manual' ? (
              <>
                <NumberField
                  id="compare-kwh"
                  label="Consommation annuelle (kWh)"
                  value={annualKwh}
                  onChange={setAnnualKwh}
                />
                <label className="flex items-center gap-2 font-data text-xs text-ink-60">
                  <input
                    type="checkbox"
                    checked={knowsHphc}
                    onChange={(e) => {
                      setKnowsHphc(e.target.checked)
                    }}
                  />
                  Je connais ma répartition heures pleines / heures creuses
                </label>
                {knowsHphc && (
                  <>
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
                  </>
                )}
              </>
            ) : (
              <>
                <div>
                  <label htmlFor="compare-file" className={labelClass}>
                    Fichier CSV Enedis (courbe de charge 30 min)
                  </label>
                  <input
                    id="compare-file"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => {
                      onFile(e.target.files?.[0])
                    }}
                    className="block w-full font-data text-xs text-ink-60 file:mr-2 file:rounded-md file:border file:border-line-strong file:bg-raised file:px-2.5 file:py-1 file:font-data file:text-xs file:text-ink-60"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="compare-hc-from" className={labelClass}>
                      Heures creuses de
                    </label>
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
                  </div>
                  <div>
                    <label htmlFor="compare-hc-to" className={labelClass}>
                      à
                    </label>
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
                  </div>
                </div>
                <p className="font-data text-[10.5px] text-ink-40">
                  Plage de votre contrat heures creuses ; Tempo applique ses propres heures creuses,
                  22 h à 6 h. Espace client Enedis → Suivre mes mesures → Télécharger mes données,
                  au pas de 30 minutes. Le fichier ne quitte jamais votre navigateur : rien n'est
                  envoyé ni conservé.
                </p>
                {fileError !== null && (
                  <p className="font-data text-xs text-signal-tense" role="alert">
                    {fileError}
                  </p>
                )}
                <p className="font-data text-[11px] text-ink-60" aria-live="polite">
                  {curve !== null &&
                    displayDays !== null &&
                    `${kwhFormat.format(curve.totalKwh)} kWh sur ${String(displayDays)} jour${displayDays > 1 ? 's' : ''}, du ${formatParisDate(curve.from)} au ${formatParisDate(curve.to)}, pas de ${String(curve.stepMinutes)} min${curve.skippedRows > 0 ? ` (${String(curve.skippedRows)} lignes écartées)` : ''}.`}
                </p>
              </>
            )}
          </div>

          <div>
            {hasAnyCost ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[12.5px]">
                  <thead>
                    <tr className="border-b border-line font-data text-[10.5px] tracking-[0.08em] text-ink-40 uppercase">
                      <th scope="col" className="px-2 py-1.5 text-left font-semibold">
                        Offre
                      </th>
                      <th scope="col" className="px-2 py-1.5 text-right font-semibold">
                        Abonnement
                      </th>
                      <th scope="col" className="px-2 py-1.5 text-right font-semibold">
                        Coût kWh
                      </th>
                      <th scope="col" className="px-2 py-1.5 text-right font-semibold">
                        Total TTC
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.option} className="border-b border-line/60">
                        <th scope="row" className="px-2 py-1.5 text-left font-normal text-ink-100">
                          {OPTION_LABELS[row.option]}
                          {row.cost === null && row.reason !== null && (
                            <span className="block font-data text-[10.5px] text-ink-40">
                              {row.reason}
                            </span>
                          )}
                        </th>
                        <CostCell value={row.cost?.subscription ?? null} />
                        <CostCell value={row.cost?.energy ?? null} />
                        <CostCell value={row.cost?.total ?? null} />
                      </tr>
                    ))}
                  </tbody>
                </table>
                {mode === 'file' && displayDays !== null && (
                  <p className="mt-1 font-data text-[10.5px] text-ink-40">
                    Coûts sur la période du fichier ({String(displayDays)} jour
                    {displayDays > 1 ? 's' : ''}), abonnement au prorata.
                  </p>
                )}
              </div>
            ) : (
              <p className="font-data text-sm text-ink-40">
                {mode === 'manual'
                  ? 'Saisis ta consommation pour voir les coûts.'
                  : 'Dépose ton export Enedis pour voir les coûts.'}
              </p>
            )}
          </div>
        </div>

        <p className="mt-3 font-data text-[10.5px] text-ink-40">
          Estimation indicative TTC, hors promotions et remises. Tarifs réglementés de vente
          {gridDate !== null && ` en vigueur depuis le ${formatParisDate(`${gridDate}T12:00:00Z`)}`}
          , source :{' '}
          <a
            href="https://www.cre.fr/documents/open-data/historique-des-tarifs-reglementes-de-vente-delectricite-pour-les-consommateurs-residentiels.html"
            target="_blank"
            rel="noreferrer"
            className="border-b border-dashed border-line-strong hover:border-accent hover:text-accent"
          >
            open data CRE
          </a>
          . Les offres des fournisseurs de marché arriveront avec la collecte automatisée de leurs
          grilles. Pour décider, le comparateur officiel du Médiateur national de l'énergie fait
          foi.
        </p>
      </>
    )
  }

  return (
    <section
      aria-label="Compare ta conso"
      className="rounded-(--radius-card) border border-line bg-panel p-4 shadow-(--shadow-card)"
    >
      <h2 className="mb-2 font-data text-[11px] font-semibold tracking-[0.16em] text-ink-40 uppercase">
        Compare ta conso{' '}
        <span className="font-normal tracking-normal normal-case">
          ce que ta consommation coûterait aux tarifs réglementés, abonnement compris
        </span>
      </h2>
      {body}
    </section>
  )
}
