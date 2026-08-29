import type { NationalRange } from '../lib/api.ts'

const RANGES: { value: NationalRange; label: string; title: string }[] = [
  { value: '24h', label: '24 h', title: "Dernières 24 heures, au quart d'heure" },
  { value: '7d', label: '7 j', title: '7 derniers jours, moyenne horaire' },
  { value: '30d', label: '30 j', title: '30 derniers jours, moyenne horaire' },
]

interface RangeSelectorProps {
  value: NationalRange
  onChange: (range: NationalRange) => void
  /** Périodes indisponibles pour le contexte courant, avec la raison en title. */
  disabled?: Partial<Record<NationalRange, string>>
}

export function RangeSelector({ value, onChange, disabled = {} }: RangeSelectorProps) {
  return (
    <div
      role="group"
      aria-label="Période affichée"
      className="flex overflow-hidden rounded-md border border-line-strong"
    >
      {RANGES.map((range) => (
        <button
          key={range.value}
          type="button"
          title={disabled[range.value] ?? range.title}
          aria-pressed={value === range.value}
          disabled={disabled[range.value] !== undefined}
          onClick={() => {
            onChange(range.value)
          }}
          className={`px-3 py-1 font-data text-xs transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 ${
            value === range.value
              ? 'bg-accent font-semibold text-abyss'
              : 'text-ink-60 hover:text-ink-100'
          }`}
        >
          {range.label}
        </button>
      ))}
    </div>
  )
}
