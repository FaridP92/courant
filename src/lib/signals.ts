/**
 * Logique pure des signaux Ecowatt et Tempo (contrat vérifié : guide API RTE
 * Ecowatt v5.0.0 + payloads réels du 2026-08-29).
 * dvalue : 1 vert, 2 orange, 3 rouge. hvalue : 0 vert + production décarbonée
 * (nouveauté v5), 1 vert, 2 orange, 3 rouge. Le jour courant peut publier des
 * heures partielles : aucun calcul ne suppose 24 pas.
 */
import type { EcowattDay, EcowattHour, TempoSnapshot } from './api.ts'

const parisDayKey = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Le jour civil courant à Paris, au format ISO (les signaux RTE vivent dans ce fuseau). */
export function parisDayIso(now: Date = new Date()): string {
  return parisDayKey.format(now)
}

const dayShort = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
})

const dayWeekday = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long' })

/** La date vue comme un jour civil, sans que le fuseau du navigateur la décale. */
const atNoonUtc = (day: string) => new Date(`${day}T12:00:00Z`)

/** Libellé court d'une tuile jour : "sam 29" (sans le point de l'abréviation fr). */
export function formatDayShort(day: string): string {
  return dayShort.format(atNoonUtc(day)).replace('.', '')
}

function nextDay(day: string): string {
  const d = atNoonUtc(day)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** "Aujourd'hui", "Demain", sinon le jour de la semaine capitalisé. */
function formatDayRelative(day: string, today: string): string {
  if (day === today) return "Aujourd'hui"
  if (day === nextDay(today)) return 'Demain'
  const weekday = dayWeekday.format(atNoonUtc(day))
  return weekday.charAt(0).toUpperCase() + weekday.slice(1)
}

export interface HourRange {
  from: number
  /** Borne haute exclusive : { from: 18, to: 20 } couvre 18 h à 19 h 59. */
  to: number
}

/** Plages contiguës des pas horaires qui vérifient le prédicat. */
export function hourRanges(
  hours: readonly EcowattHour[] | null,
  match: (hvalue: number) => boolean,
): HourRange[] {
  if (hours === null) return []
  const ranges: HourRange[] = []
  const sorted = [...hours].sort((a, b) => a.pas - b.pas)
  let lastTo = -1
  for (const hour of sorted) {
    if (!match(hour.hvalue)) continue
    const last = ranges[ranges.length - 1]
    if (hour.pas === lastTo && last !== undefined) {
      last.to = hour.pas + 1
    } else {
      ranges.push({ from: hour.pas, to: hour.pas + 1 })
    }
    lastTo = hour.pas + 1
  }
  return ranges
}

const hourLabel = (h: number) => (h === 0 || h === 24 ? 'minuit' : `${String(h)} h`)

/** "entre 18 h et 20 h puis entre 22 h et minuit", ou "toute la journée". */
export function formatRanges(ranges: readonly HourRange[]): string {
  const only = ranges.length === 1 ? ranges[0] : undefined
  if (only?.from === 0 && only.to === 24) return 'toute la journée'
  return ranges.map((r) => `entre ${hourLabel(r.from)} et ${hourLabel(r.to)}`).join(' puis ')
}

/**
 * La phrase de synthèse Ecowatt, dérivée des seules données :
 * priorité au premier jour tendu (avec ses heures), sinon la fenêtre bas
 * carbone du jour (hvalue 0), sinon un vert simple. Null sans données.
 */
export function ecowattNote(days: readonly EcowattDay[], today: string): string | null {
  if (days.length === 0) return null

  const tense = days.find((d) => d.dvalue >= 2)
  if (tense !== undefined) {
    // les plages citées correspondent exactement au niveau annoncé : un jour rouge
    // aux heures mixtes ne sur-alerte jamais ses heures orange
    const level = tense.dvalue >= 3 ? 3 : 2
    const ranges = hourRanges(tense.hours, (v) => v === level)
    const when = ranges.length > 0 ? ` ${formatRanges(ranges)}` : ''
    const label = formatDayRelative(tense.day, today)
    return level === 3
      ? `${label} : système électrique très tendu${when}, des coupures sont possibles sans baisse de la consommation.`
      : `${label} : système électrique tendu${when}, les éco-gestes comptent.`
  }

  const todaySignal = days.find((d) => d.day === today)
  if (todaySignal !== undefined) {
    const decarb = hourRanges(todaySignal.hours, (v) => v === 0)
    if (decarb.length > 0) {
      return `Aujourd'hui : électricité particulièrement bas carbone ${formatRanges(decarb)}.`
    }
  }

  // la promesse ne dépasse jamais l'horizon réellement reçu
  return days.length <= 1
    ? "Aucune tension attendue aujourd'hui."
    : 'Aucune tension attendue sur les prochains jours.'
}

/** La phrase Tempo : couleur de demain et implication tarifaire, sans invention. */
export function tempoNote(snapshot: TempoSnapshot): string {
  switch (snapshot.tomorrow_color) {
    case 'RED':
      return 'Demain jour rouge : électricité plus chère de 6 h à 22 h pour les abonnés Tempo.'
    case 'WHITE':
      return 'Demain jour blanc : tarif intermédiaire pour les abonnés Tempo.'
    case 'BLUE':
      return 'Demain jour bleu : le tarif le plus avantageux pour les abonnés Tempo.'
    case null:
      // 10 h 20 : heure constatée sur les updated_date réels (contrat migration 0015)
      return 'Couleur de demain publiée par RTE vers 10 h 20.'
  }
}

/** Résumé textuel du détail horaire d'un jour Ecowatt, du plus critique au bas
 * carbone, honnête sur la couverture (le jour courant peut être partiel). */
export function ecowattDaySummary(day: EcowattDay): string {
  const hours = day.hours ?? []
  if (hours.length === 0) return 'heures non publiées'
  const parts: string[] = []
  const red = hourRanges(day.hours, (v) => v === 3)
  const orange = hourRanges(day.hours, (v) => v === 2)
  const decarb = hourRanges(day.hours, (v) => v === 0)
  if (red.length > 0) parts.push(`très tendu ${formatRanges(red)}`)
  if (orange.length > 0) parts.push(`tendu ${formatRanges(orange)}`)
  if (decarb.length > 0) parts.push(`bas carbone ${formatRanges(decarb)}`)
  if (parts.length === 0) {
    return hours.length === 24 ? 'vert toute la journée' : 'vert sur les heures publiées'
  }
  // la couverture partielle est toujours dite, tension ou pas
  if (hours.length < 24) parts.push('reste du jour non publié')
  return parts.join(' · ')
}
