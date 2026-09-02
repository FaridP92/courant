import { isDefaultFilters, MATURITIES, toggleWithFloor, type Filters } from '../lib/filters.ts'
import { ToggleChip } from './controls/ToggleChip.tsx'
import { RangeSelector } from './RangeSelector.tsx'

interface FilterBarProps {
  filters: Filters
  onChange: (patch: Partial<Filters>) => void
  onReset: () => void
  /** Points portant encore une mesure après filtrage, sur le total de la série. */
  kept: number
  total: number
}

const MATURITY_FLOOR = 'Au moins une maturité doit rester retenue'

export function FilterBar({ filters, onChange, onReset, kept, total }: FilterBarProps) {
  const maturityFiltered = filters.maturity.size < MATURITIES.length

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <RangeSelector
        value={filters.range}
        onChange={(range) => {
          onChange({ range })
        }}
      />
      <div
        role="group"
        aria-label="Maturité des mesures"
        title="Maturité des mesures nationales : courbe, mix et sparklines"
        className="flex flex-wrap items-center gap-1 font-data text-[11.5px] text-ink-60"
      >
        {MATURITIES.map((option) => {
          const pressed = filters.maturity.has(option.value)
          return (
            <ToggleChip
              key={option.value}
              label={option.label}
              pressed={pressed}
              title={option.hint}
              lockedReason={pressed && filters.maturity.size <= 1 ? MATURITY_FLOOR : undefined}
              onToggle={() => {
                onChange({ maturity: toggleWithFloor(filters.maturity, option.value) })
              }}
            />
          )
        })}
      </div>
      {/* le filtre ne fait jamais disparaître des points en silence : il dit combien il en écarte */}
      {maturityFiltered && kept < total && (
        <p className="font-data text-[11px] text-ink-40" title="Points portant encore une mesure">
          {kept} points sur {total}
        </p>
      )}
      {!isDefaultFilters(filters) && (
        <button
          type="button"
          onClick={onReset}
          title="Revenir à la vue par défaut"
          className="rounded-md border border-line-strong px-2 py-0.5 font-data text-[11.5px] text-ink-60 transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Réinitialiser
        </button>
      )}
    </div>
  )
}
