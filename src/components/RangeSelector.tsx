import type { NationalRange } from '../lib/api.ts'
import { SegmentedControl, type SegmentedOption } from './controls/SegmentedControl.tsx'

const RANGES: readonly SegmentedOption<NationalRange>[] = [
  { value: '24h', label: '24 h', title: "Dernières 24 heures, au quart d'heure" },
  { value: '7d', label: '7 j', title: '7 derniers jours, moyenne horaire' },
  { value: '30d', label: '30 j', title: '30 derniers jours, moyenne horaire' },
]

interface RangeSelectorProps {
  value: NationalRange
  onChange: (range: NationalRange) => void
  /** Périodes indisponibles pour le contexte courant, avec la raison en title. */
  disabled?: Partial<Record<NationalRange, string>> | undefined
}

export function RangeSelector({ value, onChange, disabled }: RangeSelectorProps) {
  return (
    <SegmentedControl
      label="Période affichée"
      options={RANGES}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  )
}
