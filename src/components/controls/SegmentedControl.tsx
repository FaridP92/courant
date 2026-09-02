/** Choix exclusif en segments (période, granularité...) : un seul contrôle accessible,
 * réutilisé par tous les critères mutuellement exclusifs du tableau de bord. */

export interface SegmentedOption<T extends string> {
  readonly value: T
  readonly label: string
  readonly title: string
}

interface SegmentedControlProps<T extends string> {
  /** Intitulé du groupe, annoncé aux lecteurs d'écran. */
  label: string
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Options indisponibles dans le contexte courant, avec la raison affichée en title. */
  disabled?: Partial<Record<T, string>> | undefined
}

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = {},
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex overflow-hidden rounded-md border border-line-strong"
    >
      {options.map((option) => {
        const unavailable = disabled[option.value]
        return (
          <button
            key={option.value}
            type="button"
            title={unavailable ?? option.title}
            aria-pressed={value === option.value}
            disabled={unavailable !== undefined}
            onClick={() => {
              onChange(option.value)
            }}
            className={`px-3 py-1 font-data text-xs transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 ${
              value === option.value
                ? 'bg-accent font-semibold text-abyss'
                : 'text-ink-60 hover:text-ink-100'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
