import { useMemo, useState } from 'react'
import type { TempoCalendarDay, TrvTariff } from '../lib/api.ts'
import { parseEnedisCsv, type EnedisCurve } from '../lib/enedisCsv.ts'
import { formatParisDate } from '../lib/format.ts'
import {
  computeBase,
  computeHphc,
  computeTempo,
  splitByTempo,
  splitHphc,
  type CostBreakdown,
  type OffPeakWindow,
} from '../lib/tariffs.ts'

/**
 * « Compare ta conso » (ADR-0009) : la consommation ne quitte jamais le navigateur.
 * Deux entrées : saisie manuelle (annuelle) ou export Enedis (courbe 30 min, période
 * du fichier). Tarifs réglementés depuis l'open data CRE ; le coût Tempo exact
 * s'appuie sur le calendrier réel des couleurs.
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
  tariff: TrvTariff | null
}

function CostCell({ value }: { value: number | null }) {
  return (
    <td className="px-2 py-1.5 text-right font-data text-ink-100">
      {value === null ? '' : euros.format(value)}
    </td>
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
  const [power, setPower] = useState(6)
  const [annualKwh, setAnnualKwh] = useState('')
  const [knowsHphc, setKnowsHphc] = useState(false)
  const [hpKwh, setHpKwh] = useState('')
  const [hcKwh, setHcKwh] = useState('')
  const [offPeakFrom, setOffPeakFrom] = useState(22)
  const [offPeakTo, setOffPeakTo] = useState(6)
  const [curve, setCurve] = useState<EnedisCurve | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  const powers = useMemo(
    () => [...new Set(tariffs.map((t) => t.p_souscrite))].sort((a, b) => a - b),
    [tariffs],
  )
  const tariffFor = (option: TrvTariff['option']): TrvTariff | null =>
    tariffs.find((t) => t.option === option && t.p_souscrite === power) ?? null
  const windows: OffPeakWindow[] = [{ from: offPeakFrom, to: offPeakTo }]
  const calendarMap = useMemo(
    () => new Map(calendar.map((d) => [d.day, d.color] as const)),
    [calendar],
  )

  const prorata = (annual: number, days: number) => (annual * days) / 365

  // la période du fichier : les coûts se calculent SUR CETTE PÉRIODE, abonnement au prorata
  const curveDays =
    curve === null
      ? null
      : Math.max(1, Math.round((Date.parse(curve.to) - Date.parse(curve.from)) / 86_400_000) + 1)

  const rows: Row[] = (['BASE', 'HPHC', 'TEMPO'] as const).map((option) => {
    const tariff = tariffFor(option)
    if (tariff === null) {
      return { option, cost: null, reason: 'grille indisponible pour cette puissance', tariff }
    }
    if (mode === 'manual') {
      const total = Number(annualKwh)
      const hp = Number(hpKwh)
      const hc = Number(hcKwh)
      if (option === 'BASE') {
        const kwh = knowsHphc ? hp + hc : total
        if (!(kwh > 0)) return { option, cost: null, reason: null, tariff }
        return { option, cost: computeBase(kwh, tariff), reason: null, tariff }
      }
      if (option === 'HPHC') {
        if (!knowsHphc || !(hp + hc > 0)) {
          return {
            option,
            cost: null,
            reason: 'nécessite votre répartition heures pleines / heures creuses',
            tariff,
          }
        }
        return { option, cost: computeHphc({ hp, hc }, tariff), reason: null, tariff }
      }
      return {
        option,
        cost: null,
        reason: 'nécessite votre courbe de charge Enedis (couleurs Tempo jour par jour)',
        tariff,
      }
    }
    if (curve === null || curveDays === null) return { option, cost: null, reason: null, tariff }
    const scaled = { ...tariff, fixed_ttc: prorata(tariff.fixed_ttc, curveDays) }
    if (option === 'BASE')
      return { option, cost: computeBase(curve.totalKwh, scaled), reason: null, tariff }
    if (option === 'HPHC') {
      return {
        option,
        cost: computeHphc(splitHphc(curve.readings, windows), scaled),
        reason: null,
        tariff,
      }
    }
    const split = splitByTempo(curve.readings, calendarMap, windows)
    if (split.uncoveredKwh > 0) {
      return {
        option,
        cost: null,
        reason: `${kwhFormat.format(split.uncoveredKwh)} kWh tombent hors du calendrier Tempo connu (400 derniers jours)`,
        tariff,
      }
    }
    return { option, cost: computeTempo(split.buckets, scaled), reason: null, tariff }
  })

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
  const inputClass =
    'w-full rounded-md border border-line-strong bg-raised px-2.5 py-1.5 font-data text-sm text-ink-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent'
  const labelClass = 'block font-data text-[10.5px] tracking-[0.08em] text-ink-40 uppercase'

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

      {tariffs.length === 0 && tariffsStatus !== 'pending' ? (
        <p className="font-data text-sm text-ink-40">
          Grilles tarifaires indisponibles pour le moment.
        </p>
      ) : (
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
                  value={power}
                  onChange={(e) => {
                    setPower(Number(e.target.value))
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
                  {!knowsHphc && (
                    <div>
                      <label htmlFor="compare-kwh" className={labelClass}>
                        Consommation annuelle (kWh)
                      </label>
                      <input
                        id="compare-kwh"
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={annualKwh}
                        onChange={(e) => {
                          setAnnualKwh(e.target.value)
                        }}
                        className={inputClass}
                      />
                    </div>
                  )}
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
                      <div>
                        <label htmlFor="compare-hp" className={labelClass}>
                          Heures pleines (kWh)
                        </label>
                        <input
                          id="compare-hp"
                          type="number"
                          min={0}
                          value={hpKwh}
                          onChange={(e) => {
                            setHpKwh(e.target.value)
                          }}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label htmlFor="compare-hc" className={labelClass}>
                          Heures creuses (kWh)
                        </label>
                        <input
                          id="compare-hc"
                          type="number"
                          min={0}
                          value={hcKwh}
                          onChange={(e) => {
                            setHcKwh(e.target.value)
                          }}
                          className={inputClass}
                        />
                      </div>
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
                        type="number"
                        min={0}
                        max={23}
                        value={offPeakFrom}
                        onChange={(e) => {
                          setOffPeakFrom(Number(e.target.value))
                        }}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label htmlFor="compare-hc-to" className={labelClass}>
                        à (heure)
                      </label>
                      <input
                        id="compare-hc-to"
                        type="number"
                        min={0}
                        max={23}
                        value={offPeakTo}
                        onChange={(e) => {
                          setOffPeakTo(Number(e.target.value))
                        }}
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <p className="font-data text-[10.5px] text-ink-40">
                    Espace client Enedis → Suivre mes mesures → Télécharger mes données, au pas de
                    30 minutes. Le fichier ne quitte jamais votre navigateur : rien n'est envoyé ni
                    conservé.
                  </p>
                  {fileError !== null && (
                    <p className="font-data text-xs text-signal-tense" role="alert">
                      {fileError}
                    </p>
                  )}
                  {curve !== null && curveDays !== null && (
                    <p className="font-data text-[11px] text-ink-60">
                      {kwhFormat.format(curve.totalKwh)} kWh sur {String(curveDays)} jours, du{' '}
                      {formatParisDate(curve.from)} au {formatParisDate(curve.to)}, pas de{' '}
                      {String(curve.stepMinutes)} min
                      {curve.skippedRows > 0 &&
                        ` (${String(curve.skippedRows)} lignes illisibles ignorées)`}
                      .
                    </p>
                  )}
                </>
              )}
            </div>

            <div>
              {hasAnyCost ||
              rows.some((r) => r.reason !== null && (mode === 'file' ? curve !== null : true)) ? (
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
                          kWh
                        </th>
                        <th scope="col" className="px-2 py-1.5 text-right font-semibold">
                          Total TTC
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.option} className="border-b border-line/60">
                          <th
                            scope="row"
                            className="px-2 py-1.5 text-left font-normal text-ink-100"
                          >
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
                  {mode === 'file' && curveDays !== null && (
                    <p className="mt-1 font-data text-[10.5px] text-ink-40">
                      Coûts sur la période du fichier ({String(curveDays)} jours), abonnement au
                      prorata.
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
            {gridDate !== null &&
              ` en vigueur depuis le ${formatParisDate(`${gridDate}T12:00:00Z`)}`}
            , source :{' '}
            <a
              href="https://www.cre.fr/documents/open-data/historique-des-tarifs-reglementes-de-vente-delectricite-pour-les-consommateurs-residentiels.html"
              className="border-b border-dashed border-line-strong hover:border-accent hover:text-accent"
            >
              open data CRE
            </a>
            . Les offres des fournisseurs de marché arriveront avec la collecte automatisée de leurs
            grilles. Pour décider, le comparateur officiel du Médiateur national de l'énergie fait
            foi.
          </p>
        </>
      )}
    </section>
  )
}
