import {
  CO2_THRESHOLDS,
  isDefaultFilters,
  MATURITIES,
  toggleWithFloor,
  type Filters,
} from '../lib/filters.ts'
import { SegmentedControl, type SegmentedOption } from './controls/SegmentedControl.tsx'
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

const NO_THRESHOLD = 'off'

/** Le seuil met en évidence, il ne masque pas : « aucun » est un palier comme les autres. */
const CO2_OPTIONS: readonly SegmentedOption<string>[] = [
  {
    value: NO_THRESHOLD,
    label: 'aucun',
    title: "Aucune mise en évidence de l'intensité carbone",
  },
  ...CO2_THRESHOLDS.map((threshold) => ({
    value: String(threshold),
    label: String(threshold),
    title: `Met en évidence les pas au-dessus de ${String(threshold)} g/kWh`,
  })),
]

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
      <div className="flex items-center gap-1.5">
        <span className="font-data text-[10.5px] tracking-[0.08em] text-ink-40 uppercase">CO2</span>
        <SegmentedControl
          label="Seuil d'intensité CO2"
          options={CO2_OPTIONS}
          value={filters.co2Threshold === null ? NO_THRESHOLD : String(filters.co2Threshold)}
          onChange={(value) => {
            onChange({
              co2Threshold: CO2_THRESHOLDS.find((t) => String(t) === value) ?? null,
            })
          }}
        />
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
