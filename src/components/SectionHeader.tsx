import type { ReactNode } from 'react'

/**
 * Titre de rubrique partagé : un titre lisible en casse normale, une phrase de
 * contexte, et à droite les commandes de la rubrique. Remplace les libellés en
 * petites capitales monospace de la première version, jugés austères.
 */
export function SectionHeader({
  title,
  subtitle,
  actions,
  as = 'h2',
  className = '',
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  as?: 'h2' | 'h3'
  className?: string
}) {
  const Heading = as
  return (
    <div className={`mb-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-3 ${className}`}>
      <div className="min-w-0">
        <Heading className="section-title">{title}</Heading>
        {subtitle !== undefined && <p className="section-subtitle mt-1 max-w-2xl">{subtitle}</p>}
      </div>
      {actions !== undefined && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
