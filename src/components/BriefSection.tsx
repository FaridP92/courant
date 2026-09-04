import type { DailyBrief } from '../lib/api.ts'
import { formatParisClock, formatParisDate } from '../lib/format.ts'
import { SectionHeader } from './SectionHeader.tsx'

type QueryStatus = 'pending' | 'error' | 'success'

/** Le brief du matin : la prose est rédigée par IA, mais chaque chiffre vient
 * d'un calcul SQL sur les données de la veille (traçé en base avec le brief). */
export function BriefSection({ brief, status }: { brief: DailyBrief | null; status: QueryStatus }) {
  if (brief === null && status === 'pending') return null
  return (
    <section aria-label="Le brief du matin" className="panel p-5 md:p-6">
      <SectionHeader
        title="Le brief du matin"
        subtitle="La journée d'hier en quelques phrases, rédigées par IA à partir des chiffres calculés en base."
      />
      {brief === null ? (
        <p className="text-[15px] leading-relaxed text-ink-60">
          Le premier brief sera rédigé demain matin vers 07 h 30.
        </p>
      ) : (
        <>
          <p className="max-w-[68ch] text-[16px] leading-relaxed text-ink-100">{brief.body}</p>
          <p className="mt-4 border-t border-line pt-3 text-[12.5px] leading-relaxed text-ink-40">
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
