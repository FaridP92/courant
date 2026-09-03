/**
 * Prompts du chat "Pose ta question" (brief 7.2). Deux étapes : le modèle
 * propose UN SELECT sur les seules vues du schéma chat (ou un refus honnête),
 * puis rédige la réponse à partir du seul résultat SQL. Le texte utilisateur
 * n'est jamais interpolé dans du SQL : il ne sert qu'à formuler la question.
 */

export interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

/** Le contrat de données exposé au modèle : vues, colonnes, unités, périodes. */
const SCHEMA_DOC = [
  'Vues PostgreSQL disponibles (lecture seule) :',
  '- chat.national(ts timestamptz, maturity, consommation, prevision_j, prevision_j1, nucleaire, hydraulique, pompage, eolien, solaire, gaz, fioul, charbon, bioenergies, ech_physiques, taux_co2)',
  "  Mesures nationales au quart d'heure depuis 2012. Valeurs en MW ; taux_co2 en g/kWh ; ech_physiques negatif = la France exporte ; pompage negatif = stockage.",
  '- chat.regional(region_code, region_name, ts, maturity, consommation, thermique, nucleaire, eolien, solaire, hydraulique, pompage, bioenergies, ech_physiques)',
  '  Mesures des 12 regions metropolitaines, 24 mois glissants, MW.',
  '- chat.metropoles(epci_code, name, ts, consommation) : consommation des metropoles, 7 jours glissants, MW.',
  "- chat.tempo_days(day date, color, source_updated_at) : calendrier Tempo depuis septembre 2014 ; color vaut 'BLUE', 'WHITE' ou 'RED' ; la saison va du 1er septembre au 31 aout.",
  '- chat.ecowatt_days(day date, dvalue, message, generated_at) : signal Ecowatt par jour depuis aout 2026 ; dvalue 1 vert, 2 orange, 3 rouge.',
  '- chat.ecowatt_hours(day date, pas, hvalue) : signal Ecowatt horaire ; pas 0 a 23 ; hvalue 0 vert bas carbone, 1 vert, 2 orange, 3 rouge.',
  '- chat.regions(code, name) : referentiel des regions (code INSEE).',
].join('\n')

const parisDate = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const parisIso = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** La saison Tempo en cours commence le 1er septembre le plus recent. */
function tempoSeasonStart(todayIso: string): string {
  const year = Number(todayIso.slice(0, 4))
  const month = Number(todayIso.slice(5, 7))
  return `${String(month >= 9 ? year : year - 1)}-09-01`
}

export function buildPlanMessages(question: string, now: Date = new Date()): ChatMessage[] {
  const todayIso = parisIso.format(now)
  const seasonStart = tempoSeasonStart(todayIso)
  const previousSeasonStart = `${String(Number(seasonStart.slice(0, 4)) - 1)}-09-01`
  return [
    {
      role: 'system',
      content: [
        "Tu es le traducteur SQL du chat de Courant, tableau de bord public de l'electricite francaise.",
        `Aujourd'hui : ${parisDate.format(now)} (${todayIso}, heure de Paris). La saison Tempo en cours a commence le ${seasonStart} ; la saison derniere va du ${previousSeasonStart} au ${seasonStart} exclu. Le mot hiver designe par defaut le dernier hiver ecoule (decembre a fevrier) sauf indication contraire.`,
        SCHEMA_DOC,
        '',
        'Regles imperatives :',
        '- reponds UNIQUEMENT par un objet json : {"sql": "..."} ou {"refusal": "..."} ;',
        '- un seul SELECT PostgreSQL, sans point-virgule, sans commentaire, sans identifiant entre guillemets ;',
        '- uniquement les vues listees ci-dessus, rien d autre ;',
        '- toujours terminer par LIMIT (200 maximum) ;',
        "- les ts sont en UTC : pour raisonner en heure ou jour francais, utiliser (ts at time zone 'Europe/Paris') ;",
        "- l'hiver francais chevauche deux annees (decembre a fevrier) ;",
        '- les lignes les plus recentes de chat.national sont des PREVISIONS dont les mesures (consommation, production, echanges) sont NULL : « en ce moment », « actuellement », « la derniere mesure » signifient la derniere ligne ou la colonne demandee est non nulle (where colonne is not null order by ts desc limit 1), jamais max(ts) ;',
        "- quand tu renvoies un horodatage, renvoie-le en heure francaise : (ts at time zone 'Europe/Paris') as ts_paris ;",
        '- si la question sort de ces donnees (meteo, prix, autres pays, opinions, conseils personnels...) ou demande autre chose qu une lecture, reponds {"refusal": "phrase courte en francais expliquant que le chat ne couvre que les donnees electriques publiques du tableau de bord"}.',
      ].join('\n'),
    },
    { role: 'user', content: question },
  ]
}

export function buildAnswerMessages(question: string, rows: readonly unknown[]): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        "Tu rediges la reponse du chat de Courant, tableau de bord public de l'electricite francaise.",
        'Reponds en 1 ou 2 phrases en francais, ton factuel et accessible.',
        'Utilise uniquement les valeurs presentes dans le resultat SQL fourni : aucun chiffre invente, aucune extrapolation.',
        'Les puissances sont en MW : au-dela de 1000 MW, exprime-les en GW avec une decimale et une virgule (ex. 44,5 GW).',
        "Si le resultat est vide, dis simplement qu'aucune donnee ne correspond a la question.",
        'Une colonne ts_paris est deja en heure francaise ; une colonne ts brute est en UTC (ajoute une heure en hiver, deux en ete) : donne toujours les heures en heure francaise.',
        "N'utilise jamais de tiret long.",
      ].join('\n'),
    },
    {
      role: 'user',
      content: `Question : ${question}\n\nResultat SQL (JSON) :\n${JSON.stringify(rows).slice(0, 4000)}`,
    },
  ]
}

export type ChatPlan = { sql: string } | { refusal: string }

/** Lit le JSON du modèle, tolérant au texte parasite autour de l'objet. */
export function parsePlan(text: string): ChatPlan | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1))
    if (typeof parsed !== 'object' || parsed === null) return null
    const record = parsed as Record<string, unknown>
    if (typeof record.sql === 'string') return { sql: record.sql }
    if (typeof record.refusal === 'string') return { refusal: record.refusal }
    return null
  } catch {
    return null
  }
}
