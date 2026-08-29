import type { ReactNode } from 'react'
import { Sparkline } from './Sparkline.tsx'

interface KpiCardProps {
  label: string
  value: string
  unit: string
  detail: ReactNode
  sparkValues: readonly (number | null)[]
  sparkColor: string
  sparkFilled?: boolean
}

export function KpiCard({
  label,
  value,
  unit,
  detail,
  sparkValues,
  sparkColor,
  sparkFilled,
}: KpiCardProps) {
  return (
    <article className="flex flex-col gap-1.5 rounded-(--radius-card) border border-line bg-panel p-4 shadow-(--shadow-card)">
      <p className="font-data text-[11px] font-semibold tracking-[0.14em] text-ink-40 uppercase">
        {label}
      </p>
      <p className="font-display text-[32px] leading-none font-extrabold tracking-tight text-ink-100 [font-stretch:115%]">
        {value}
        <span className="ml-1 text-[15px] font-semibold text-ink-60">{unit}</span>
      </p>
      <p className="font-data text-[11.5px] text-ink-60">{detail}</p>
      <div className="mt-auto pt-1" aria-hidden="true">
        <Sparkline values={sparkValues} color={sparkColor} filled={sparkFilled ?? false} />
      </div>
    </article>
  )
}
