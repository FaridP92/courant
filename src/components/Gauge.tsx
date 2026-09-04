/** Jauge en demi-arc SVG, sobre et honnête : fraction null = arc vide + « n.d. »,
 * fraction au-delà de 1 = arc plein mais valeur affichée réelle. */

const ARC_LENGTH = Math.PI * 40

export function Gauge({
  label,
  fraction,
  valueText,
  hint,
}: {
  label: string
  fraction: number | null
  valueText: string
  hint?: string
}) {
  const filled = fraction === null ? 0 : Math.min(Math.max(fraction, 0), 1) * ARC_LENGTH
  return (
    <div
      role="img"
      aria-label={`${label} : ${valueText}`}
      className="rounded-xl bg-raised px-3 py-3 text-center"
    >
      <div className="relative mx-auto w-full max-w-[110px]">
        <svg viewBox="0 0 100 54" aria-hidden="true" className="block w-full">
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke="var(--color-line-strong)"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${String(filled)} ${String(ARC_LENGTH + 10)}`}
            opacity={fraction === null || filled === 0 ? 0 : 1}
          />
        </svg>
        <p
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 font-display text-[18px] leading-none font-bold text-ink-100 [font-stretch:112%]"
        >
          {valueText}
        </p>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-tight text-ink-60">{label}</p>
      {hint !== undefined && <p className="text-[11px] leading-tight text-ink-40">{hint}</p>}
    </div>
  )
}
