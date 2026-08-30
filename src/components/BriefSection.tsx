import type { DailyBrief } from '../lib/api.ts'
import { formatParisClock, formatParisDate } from '../lib/format.ts'

type QueryStatus = 'pending' | 'error' | 'success'

/** Le brief du matin : la prose est rédigée par IA, mais chaque chiffre vient
 * d'un calcul SQL sur les données de la veille (traçé en base avec le brief). */
export function BriefSection({ brief, status }: { brief: DailyBrief | null; status: QueryStatus }) {
  if (brief === null && status === 'pending') return null
  return (
    <section
      aria-label="Le brief du matin"
      className="rounded-(--radius-card) border border-line bg-panel p-4 shadow-(--shadow-card)"
    >
      <h2 className="mb-2 font-data text-[11px] font-semibold tracking-[0.16em] text-ink-40 uppercase">
        Le brief du matin
      </h2>
      {brief === null ? (
        <p className="font-data text-sm text-ink-40">
          Le premier brief sera rédigé demain matin vers 07 h 30.
        </p>
      ) : (
        <>
          <p className="max-w-[70ch] text-[15px] leading-[1.65] text-ink-100">{brief.body}</p>
          <p className="mt-2.5 font-data text-[11px] text-ink-40">
            Rédigé par IA (Mistral) à partir des données RTE de la veille,{' '}
            {formatParisDate(`${brief.day}T12:00:00Z`)} · publié à{' '}
            {formatParisClock(brief.generated_at)} · les chiffres sont calculés en base, jamais par
            le modèle
          </p>
        </>
      )}
    </section>
  )
}
