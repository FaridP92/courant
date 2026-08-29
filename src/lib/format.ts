/**
 * Formats d'affichage : chiffres français (virgule décimale) et heures Europe/Paris.
 * Les valeurs source sont en MW (contrat ODRÉ), l'UI parle en GW.
 */

const gwFormat = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const gwSignedFormat = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'always',
})

const parisClock = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  minute: '2-digit',
})

const parisDate = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

export function formatGigawatts(mw: number): string {
  return gwFormat.format(mw / 1000)
}

export function formatSignedGigawatts(mw: number): string {
  return gwSignedFormat.format(mw / 1000)
}

export function formatWholePercent(share: number): string {
  return String(Math.round(share * 100))
}

const signedPercentFormat = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'always',
})

export function formatSignedPercent(fraction: number): string {
  // fr-FR insere une espace insecable (fine ou classique) avant % ; on normalise
  return signedPercentFormat.format(fraction).replace(/[\u202f\u00a0]/g, ' ')
}

export function formatParisClock(iso: string | Date): string {
  return parisClock.format(new Date(iso))
}

export function formatParisDate(iso: string | Date): string {
  return parisDate.format(new Date(iso))
}

const parisDayKey = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Libellé de fraîcheur du brief ; précise le jour dès que le point n'est plus d'aujourd'hui. */
export function formatFreshness(iso: string, now: Date = new Date()): string {
  const t = new Date(iso)
  const dayKey = parisDayKey.format(t)
  if (dayKey === parisDayKey.format(now)) {
    return `données de ${formatParisClock(t)}`
  }
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000)
  if (dayKey === parisDayKey.format(yesterday)) {
    return `données d'hier, ${formatParisClock(t)}`
  }
  return `données du ${formatParisDate(t)}, ${formatParisClock(t)}`
}
