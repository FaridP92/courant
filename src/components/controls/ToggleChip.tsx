import type { ReactNode } from 'react'

/** Critère activable ou désactivable : filière du mix, maturité d'une mesure...
 * Verrouillé, il reste atteignable au clavier et affiche le motif du verrou
 * plutôt que d'ignorer le clic en silence. */
interface ToggleChipProps {
  label: string
  pressed: boolean
  onToggle: () => void
  /** Motif du verrouillage (dernier critère retenu) ; undefined quand le chip est libre. */
  lockedReason?: string | undefined
  title?: string | undefined
  /** Pastille de couleur de la filière, quand le chip sert aussi de légende. */
  color?: string | undefined
  /** Valeur associée affichée à droite du libellé (chiffre du dernier point). */
  value?: ReactNode
}

export function ToggleChip({
  label,
  pressed,
  onToggle,
  lockedReason,
  title,
  color,
  value,
}: ToggleChipProps) {
  const locked = lockedReason !== undefined
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-disabled={locked ? true : undefined}
      title={lockedReason ?? title}
      onClick={() => {
        if (!locked) onToggle()
      }}
      className={`flex items-center gap-1.5 rounded-full border border-transparent px-2.5 py-1 text-[13px] text-ink-60 transition-colors hover:border-line-strong hover:text-ink-100 focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-accent ${pressed ? '' : 'opacity-45'}`}
    >
      {color !== undefined && (
        <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      )}
      <span className={pressed ? '' : 'line-through'}>{label}</span>
      {value !== undefined && (
        <>
          {' '}
          <b className="font-data font-medium text-ink-100">{value}</b>
        </>
      )}
    </button>
  )
}
