/**
 * Garde structurel du SQL généré par le modèle pour le chat (brief 7.2).
 * Première ligne de défense, volontairement paranoïaque : tout ce qui n'est pas
 * un unique SELECT lisible sur les vues du schéma chat est refusé. Les défenses
 * suivantes vivent en base : rôle read_only_chat sans écriture limité au schéma
 * chat, enveloppe en sous-requête (multi-ordres impossibles), LIMIT 200
 * structurel et statement_timeout de 8 s sur le chemin API (migrations 0019/0020).
 */

export type GuardResult = { ok: true; sql: string } | { ok: false; reason: string }

/** Les seules relations que le SQL généré peut toucher. */
export const CHAT_RELATIONS: readonly string[] = [
  'chat.national',
  'chat.regional',
  'chat.metropoles',
  'chat.tempo_days',
  'chat.ecowatt_days',
  'chat.ecowatt_hours',
  'chat.regions',
]

const MAX_SQL_LENGTH = 1500
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

/** Mots interdits où qu'ils apparaissent (hors littéraux : voir neutralisation). */
const FORBIDDEN_WORDS = [
  'insert',
  'update',
  'delete',
  'merge',
  'drop',
  'alter',
  'create',
  'grant',
  'revoke',
  'truncate',
  'copy',
  'vacuum',
  'call',
  'do',
  'execute',
  'prepare',
  'deallocate',
  'listen',
  'notify',
  'refresh',
  'reindex',
  'cluster',
  'comment',
  'security',
  'savepoint',
  'rollback',
  'commit',
  'begin',
  'set',
  'reset',
  'show',
  'explain',
  'analyze',
  'lock',
  'into',
  'returning',
  'pg_sleep',
  'pg_read_file',
  'pg_ls_dir',
  'pg_stat_file',
  'pg_terminate_backend',
  'pg_cancel_backend',
  'lo_import',
  'lo_export',
  'dblink',
  'current_setting',
  'set_config',
  'pg_catalog',
  'information_schema',
  'pg_roles',
  'pg_user',
  'pg_shadow',
  'pg_settings',
  'pg_stat_activity',
  'pg_notify',
  'current_user',
  'session_user',
  'current_database',
  'version',
  'recursive',
]

/** Remplace le contenu des littéraux simples par du vide : les dates et libellés
 * ('Europe/Paris', 'RED'...) ne déclenchent jamais les règles de mots. */
function withoutStringLiterals(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'/g, '?')
}

export function guardSql(raw: string): GuardResult {
  let sql = raw.trim()
  if (sql === '') return { ok: false, reason: 'requête vide' }
  if (sql.length > MAX_SQL_LENGTH) return { ok: false, reason: 'requête trop longue' }

  // un point-virgule final unique est toléré, tout autre est un second ordre
  sql = sql.replace(/;\s*$/, '')
  if (sql.includes(';')) return { ok: false, reason: 'point-virgule interdit (un seul ordre)' }

  if (sql.includes('"')) {
    return { ok: false, reason: 'identifiants entre guillemets interdits' }
  }

  const bare = withoutStringLiterals(sql)
  if (bare.includes("'")) {
    return { ok: false, reason: 'littéral de texte non fermé' }
  }
  if (bare.includes('--') || bare.includes('/*') || bare.includes('*/')) {
    return { ok: false, reason: 'commentaires interdits' }
  }

  const lower = bare.toLowerCase()
  if (!/^\s*(select|with)\b/.test(lower)) {
    return { ok: false, reason: 'seul un SELECT est accepté' }
  }

  for (const word of FORBIDDEN_WORDS) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(lower)) {
      return { ok: false, reason: `mot interdit : ${word}` }
    }
  }

  // les noms de CTE deviennent des relations autorisées pour cette requête
  const allowed = new Set<string>(CHAT_RELATIONS)
  for (const match of lower.matchAll(/\b(?:with|,)\s*([a-z_][a-z0-9_]*)\s+as\s*\(/g)) {
    const name = match[1]
    if (name !== undefined) allowed.add(name)
  }

  for (const match of lower.matchAll(/\b(?:from|join)\s+(?:lateral\s+)?([a-z_][a-z0-9_.]*)/g)) {
    const relation = match[1]
    if (relation === undefined) continue
    if (!allowed.has(relation)) {
      return { ok: false, reason: `relation non autorisée : ${relation}` }
    }
  }

  // LIMIT final : présent et plafonné, sinon ajouté
  const limitMatch = /\blimit\s+(\d+)\s*$/i.exec(sql)
  if (limitMatch?.[1] !== undefined) {
    if (Number(limitMatch[1]) > MAX_LIMIT) {
      sql = sql.replace(/\blimit\s+\d+\s*$/i, `limit ${String(MAX_LIMIT)}`)
    }
  } else if (!/\blimit\s+\d+/i.test(sql)) {
    sql = `${sql} limit ${String(DEFAULT_LIMIT)}`
  }

  return { ok: true, sql }
}
