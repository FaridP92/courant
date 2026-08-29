/**
 * Export CSV des séries affichées : ce que l'utilisateur voit, il peut l'emporter.
 * Format : séparateur point-virgule (convention des tableurs français), UTF-8 avec BOM
 * pour qu'Excel lise correctement les accents.
 */

export type CsvValue = string | number | boolean | null | undefined

export function toCsv(rows: readonly Record<string, CsvValue>[]): string {
  if (rows.length === 0) return ''
  const first = rows[0]
  if (first === undefined) return ''
  const headers = Object.keys(first)
  const escape = (value: CsvValue): string => {
    if (value === null || value === undefined) return ''
    const s = String(value)
    return /[;"\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
  }
  const lines = [
    headers.join(';'),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(';')),
  ]
  return `\ufeff${lines.join('\n')}`
}

export function downloadCsv(rows: readonly Record<string, CsvValue>[], filename: string): void {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  // hors du document, le clic est ignoré par certains navigateurs (Safari, Firefox)
  document.body.appendChild(link)
  link.click()
  link.remove()
  // révoquer en synchrone peut annuler le téléchargement que le navigateur vient de lancer
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}
