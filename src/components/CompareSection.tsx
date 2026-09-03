import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { TempoCalendarDay, TrvTariff } from '../lib/api.ts'
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

/**
 * « Compare ta conso » (ADR-0009) : la consommation ne quitte jamais le navigateur.
 * Deux entrées : saisie manuelle (annuelle) ou export Enedis, CSV ou classeur Excel,
 * courbe de charge 30 min ou consommation quotidienne. Coûts sur la période du fichier,
 * abonnement au prorata. Tarifs réglementés depuis l'open data CRE ; le coût Tempo exact
 * s'appuie sur le calendrier réel des couleurs et sur les heures creuses réglementaires
 * de l'option (22 h à 6 h). Quand la donnée ne sépare pas heures pleines et heures
 * creuses (export quotidien), on affiche des bornes exactes, jamais une estimation.
 */

type QueryStatus = 'pending' | 'error' | 'success'
type Mode = 'manual' | 'file'

/** Puissance la plus répandue chez les particuliers. */
const DEFAULT_POWER_KVA = 6

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
  range: CostRange | null
  reason: string | null
}

const rowOf = (option: TrvTariff['option'], patch: Partial<Row>): Row => ({
  option,
  cost: null,
  range: null,
  reason: null,
  ...patch,
})

const positive = (raw: string): number => {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}

const plural = (n: number, word: string): string => `${String(n)} ${word}${n > 1 ? 's' : ''}`

function CostCell({ value, range }: { value: number | null; range: [number, number] | null }) {
  let content: ReactNode
  if (range !== null) content = `${euros.format(range[0])} à ${euros.format(range[1])}`
  else if (value !== null) content = euros.format(value)
  else content = <span className="sr-only">non calculé</span>
  return <td className="px-2 py-1.5 text-right font-data text-ink-100">{content}</td>
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
  const [data, setData] = useState<EnedisData | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  // un fichier déposé pendant la lecture du précédent : seul le dernier compte
  const fileSeq = useRef(0)

  const curve = data?.kind === 'curve' ? data : null
  const daily = data?.kind === 'daily' ? data : null

  const powers = useMemo(
    () => [...new Set(tariffs.map((t) => t.p_souscrite))].sort((a, b) => a - b),
    [tariffs],
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
    return (['BASE', 'HPHC', 'TEMPO'] as const).map((option) => {
      const tariff = tariffs.find((t) => t.option === option && t.p_souscrite === power) ?? null
      if (tariff === null) {
        return rowOf(option, { reason: 'grille indisponible pour cette puissance' })
      }
      if (mode === 'manual') {
        const hp = positive(hpKwh)
        const hc = positive(hcKwh)
        const split = knowsHphc && hp + hc > 0 ? { hp, hc } : null
        if (option === 'BASE') {
          const kwh = split === null ? positive(annualKwh) : split.hp + split.hc
          return rowOf(option, { cost: kwh > 0 ? computeBase(kwh, tariff) : null })
        }
        if (option === 'HPHC') {
          if (!knowsHphc) {
            return rowOf(option, {
              reason: 'cochez « je connais ma répartition » et saisissez vos kWh HP et HC',
            })
          }
          return split === null
            ? rowOf(option, { reason: 'saisissez vos kWh heures pleines et heures creuses' })
            : rowOf(option, { cost: computeHphc(split, tariff) })
        }
        return rowOf(option, {
          reason: 'nécessite votre courbe de charge Enedis (couleurs Tempo jour par jour)',
        })
      }
      if (period === null) return rowOf(option, {})
      const scaled = {
        ...tariff,
        fixed_ttc: (tariff.fixed_ttc * period.days) / period.yearLength,
      }
      if (daily !== null) {
        if (option === 'BASE') return rowOf(option, { cost: computeBase(daily.totalKwh, scaled) })
        if (option === 'HPHC') return rowOf(option, { range: rangeHphc(daily.totalKwh, scaled) })
        const tempo = rangeTempoDaily(daily.days, calendarMap, scaled)
        if (tempo === null) return rowOf(option, {})
        return tempo.uncoveredKwh > 0
          ? rowOf(option, { reason: uncoveredReason(tempo.uncoveredKwh) })
          : rowOf(option, { range: tempo.range })
      }
      if (curve === null) return rowOf(option, {})
      if (option === 'BASE') return rowOf(option, { cost: computeBase(curve.totalKwh, scaled) })
      if (option === 'HPHC') {
        return hphcSplit === null
          ? rowOf(option, {
              reason: "plage d'heures creuses invalide : début et fin doivent différer",
            })
          : rowOf(option, { cost: computeHphc(hphcSplit, scaled) })
      }
      if (tempoSplit === null) return rowOf(option, {})
      return tempoSplit.uncoveredKwh > 0
        ? rowOf(option, { reason: uncoveredReason(tempoSplit.uncoveredKwh) })
        : rowOf(option, { cost: computeTempo(tempoSplit.buckets, scaled) })
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
    daily,
    period,
    hphcSplit,
    tempoSplit,
    calendarMap,
    calendarBounds,
  ])

  const hasAnyCost = rows.some((r) => r.cost !== null || r.range !== null)

  const onFile = (file: File | undefined) => {
    fileSeq.current += 1
    const seq = fileSeq.current
    setData(null)
    setFileError(null)
    if (file === undefined) return
    const reader = new FileReader()
    reader.onload = () => {
      const buffer = reader.result
      if (!(buffer instanceof ArrayBuffer)) {
        setFileError('Impossible de lire ce fichier.')
        return
      }
      void parseEnedisBuffer(buffer).then((outcome) => {
        if (seq !== fileSeq.current) return
        if (outcome.ok) setData(outcome.result)
        else setFileError(outcome.reason)
      })
    }
    reader.onerror = () => {
      setFileError('Impossible de lire ce fichier.')
    }
    reader.readAsArrayBuffer(file)
  }

  const gridDate = tariffs[0]?.date_debut ?? null
  const displayDays = period === null ? null : Math.max(1, Math.round(period.days))

  let summary: string | null = null
  if (curve !== null && displayDays !== null) {
    summary = `${kwhFormat.format(curve.totalKwh)} kWh sur ${plural(displayDays, 'jour')}, du ${formatParisDate(curve.from)} au ${formatParisDate(curve.to)}, pas de ${String(curve.stepMinutes)} min${curve.skippedRows > 0 ? ` (${plural(curve.skippedRows, 'ligne')} écartées)` : ''}.`
  } else if (daily !== null) {
    const missing = daily.dayCount - daily.days.length
    const notes = [
      missing > 0 ? `${plural(missing, 'jour')} sans donnée` : null,
      daily.skippedRows > 0 ? `${plural(daily.skippedRows, 'ligne')} écartées` : null,
    ].filter((n) => n !== null)
    summary = `${kwhFormat.format(daily.totalKwh)} kWh sur ${plural(daily.dayCount, 'jour')} de données quotidiennes, du ${formatParisDate(`${daily.firstDay}T12:00:00Z`)} au ${formatParisDate(`${daily.lastDay}T12:00:00Z`)}${notes.length > 0 ? ` (${notes.join(', ')})` : ''}.`
  }

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
                    Fichier Enedis (CSV ou Excel)
                  </label>
                  <input
                    id="compare-file"
                    type="file"
                    accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(e) => {
                      onFile(e.target.files?.[0])
                    }}
                    className="block w-full font-data text-xs text-ink-60 file:mr-2 file:rounded-md file:border file:border-line-strong file:bg-raised file:px-2.5 file:py-1 file:font-data file:text-xs file:text-ink-60"
                  />
                </div>
                {daily === null && (
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
                )}
                <p className="font-data text-[10.5px] text-ink-40">
                  Espace client Enedis → Suivre mes mesures → Télécharger mes données : la courbe au
                  pas de 30 minutes donne des coûts exacts, la consommation quotidienne des
                  fourchettes. Plage de votre contrat heures creuses ci-dessus ; Tempo applique ses
                  propres heures creuses, 22 h à 6 h. Le fichier ne quitte jamais votre navigateur :
                  rien n'est envoyé ni conservé.
                </p>
                {fileError !== null && (
                  <p className="font-data text-xs text-signal-tense" role="alert">
                    {fileError}
                  </p>
                )}
                <p className="font-data text-[11px] text-ink-60" aria-live="polite">
                  {summary}
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
                          {row.cost === null && row.range === null && row.reason !== null && (
                            <span className="block font-data text-[10.5px] text-ink-40">
                              {row.reason}
                            </span>
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
                        />
                      </tr>
                    ))}
                  </tbody>
                </table>
                {mode === 'file' && displayDays !== null && (
                  <p className="mt-1 font-data text-[10.5px] text-ink-40">
                    Coûts sur la période du fichier ({plural(displayDays, 'jour')}), abonnement au
                    prorata.
                    {daily !== null &&
                      ' Données quotidiennes : heures creuses et Tempo en fourchette, du tout-heures-creuses au tout-heures-pleines. Pour une valeur exacte, activez l’enregistrement de la consommation horaire dans votre espace Enedis, puis exportez la courbe au pas de 30 minutes.'}
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
