import { downloadCsv, type CsvValue } from '../lib/csv.ts'

interface ExportButtonProps {
  rows: readonly Record<string, CsvValue>[]
  filename: string
  label?: string
}

/** Exporte en CSV exactement ce que la vue affiche. */
export function ExportButton({ rows, filename, label = 'CSV' }: ExportButtonProps) {
  return (
    <button
      type="button"
      title={`Exporter ${filename}`}
      aria-label={`Exporter ${filename}`}
      disabled={rows.length === 0}
      onClick={() => {
        downloadCsv(rows, filename)
      }}
      className="btn-secondary gap-1.5 px-3 py-1.5 text-[13px] disabled:opacity-40"
    >
      ↓ {label}
    </button>
  )
}
