import type { MetropolePoint } from '../lib/api.ts'
import { formatGigawatts } from '../lib/format.ts'
import { groupMetropoles } from '../lib/metropoles.ts'
import { accent } from '../lib/palette.ts'
import { Sparkline } from './Sparkline.tsx'

type MetropolesStatus = 'pending' | 'error' | 'success'

export function MetropolesSection({
  points,
  status,
}: {
  points: readonly MetropolePoint[]
  status: MetropolesStatus
}) {
  const metros = groupMetropoles(points)
  // en cours de chargement : rien à dire encore
  if (metros.length === 0 && status === 'pending') return null
  return (
    <section
      className="rounded-(--radius-card) border border-line bg-panel p-4 shadow-(--shadow-card)"
      aria-label="Consommation des principales métropoles, tendance sur 6 heures"
    >
      <h2 className="mb-3 font-data text-[11px] font-semibold tracking-[0.16em] text-ink-40 uppercase">
        Métropoles{' '}
        <span className="font-normal tracking-normal normal-case">
          {metros.length === 0
            ? 'consommation instantanée · tendance 6 h'
            : `consommation instantanée · tendance 6 h · les ${String(metros.length)} plus consommatrices`}
        </span>
      </h2>
      {metros.length === 0 ? (
        // panne ou réponse vide : une indisponibilité honnête, jamais une rubrique fantôme
        <p className="font-data text-sm text-ink-40">
          Consommation des métropoles indisponible pour le moment.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3.5 min-[620px]:grid-cols-3 lg:grid-cols-6">
          {metros.map((metro) => (
            <div
              key={metro.code}
              className="rounded-(--radius-chip) border border-line bg-raised px-3 py-2.5"
            >
              <p
                className="truncate font-data text-[11px] tracking-[0.1em] text-ink-40 uppercase"
                title={metro.name}
              >
                {metro.name.replace(/^Métropole (du |de la |de |d')/, '')}
              </p>
              <p className="my-1 font-display text-[19px] leading-none font-bold text-ink-100 [font-stretch:112%]">
                {formatGigawatts(metro.latest)}
                <span className="ml-1 text-[11px] font-medium text-ink-60">GW</span>
              </p>
              <Sparkline values={metro.values} color={accent} filled />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
