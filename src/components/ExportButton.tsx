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
      className="rounded-md border border-line-strong px-2.5 py-1 font-data text-xs text-ink-60 transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40"
    >
      ↓ {label}
    </button>
  )
}
