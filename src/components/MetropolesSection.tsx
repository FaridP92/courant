import type { MetropolePoint } from '../lib/api.ts'
import { formatGigawatts } from '../lib/format.ts'
import { groupMetropoles } from '../lib/metropoles.ts'
import { paletteFor } from '../lib/palette.ts'
import { useTheme } from '../hooks/useTheme.ts'
import { SectionHeader } from './SectionHeader.tsx'
import { Sparkline } from './Sparkline.tsx'

type MetropolesStatus = 'pending' | 'error' | 'success'

export function MetropolesSection({
  points,
  status,
}: {
  points: readonly MetropolePoint[]
  status: MetropolesStatus
}) {
  const { theme } = useTheme()
  const metros = groupMetropoles(points)
  // en cours de chargement : rien à dire encore
  if (metros.length === 0 && status === 'pending') return null
  return (
    <section
      className="panel p-5 md:p-6"
      aria-label="Consommation des principales métropoles, tendance sur 6 heures"
    >
      <SectionHeader
        title="Les grandes métropoles"
        subtitle="Consommation instantanée et tendance des six dernières heures"
      />
      {metros.length === 0 ? (
        // panne ou réponse vide : une indisponibilité honnête, jamais une rubrique fantôme
        <p className="text-sm text-ink-40">
          Consommation des métropoles indisponible pour le moment.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3.5 min-[620px]:grid-cols-3 lg:grid-cols-6">
          {metros.map((metro) => (
            <div key={metro.code} className="rounded-xl border border-line bg-raised p-4">
              <p className="truncate text-[13px] font-medium text-ink-60" title={metro.name}>
                {metro.name.replace(/^Métropole (du |de la |de |d')/, '')}
              </p>
              <p className="my-1.5 font-display text-[26px] leading-none font-bold text-ink-100 [font-stretch:112%]">
                {formatGigawatts(metro.latest)}
                <span className="ml-1 text-[12px] font-medium text-ink-60">GW</span>
              </p>
              <Sparkline values={metro.values} color={paletteFor(theme).accent} filled />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
