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
    <article className="panel flex flex-col gap-1 p-5">
      <p className="text-[13px] font-medium text-ink-60">{label}</p>
      <p className="font-display text-[34px] leading-none font-extrabold tracking-tight text-ink-100 [font-stretch:112%]">
        {value}
        <span className="ml-1 text-[15px] font-semibold text-ink-40">{unit}</span>
      </p>
      <p className="text-[12.5px] text-ink-40">{detail}</p>
      <div className="mt-auto pt-2" aria-hidden="true">
        <Sparkline values={sparkValues} color={sparkColor} filled={sparkFilled ?? false} />
      </div>
    </article>
  )
}
