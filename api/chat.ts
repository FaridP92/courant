/**
 * /api/chat : le chat "Pose ta question" (brief 7.2).
 * Pipeline : question -> Mistral genere un plan JSON (SQL ou refus) ->
 * garde structurel (chatGuard) -> execution via la RPC run_chat_query
 * (role read_only_chat, LIMIT 200 structurel, timeout 8 s cote base) ->
 * Mistral redige la reponse depuis le seul resultat -> journal sans donnee
 * personnelle. Les secrets ne vivent que dans les variables d'environnement
 * du serveur ; le texte utilisateur n'est jamais interpole dans du SQL.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { guardSql } from '../src/lib/chatGuard.js'
import {
  buildAnswerMessages,
  buildPlanMessages,
  parsePlan,
  type ChatMessage,
} from '../src/lib/chatPrompts.js'

const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions'
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://cwdickfefpobnsceubew.supabase.co'
const MODEL = process.env.MISTRAL_MODEL ?? 'mistral-small-latest'

const UNAVAILABLE = 'Le chat est momentanément indisponible, réessaie dans un instant.'
const OUT_OF_SCOPE = 'Je ne peux pas répondre à cette question avec les données disponibles.'

/** Garde-fou de volume par instance (sans IP : le journal reste sans donnée
 * personnelle). Les instances Fluid servent plusieurs visiteurs : un plafond
 * global par minute suffit à protéger les quotas Mistral et la base. */
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 20
let windowStart = 0
let windowCount = 0

function rateLimited(): boolean {
  const now = Date.now()
  if (now - windowStart > RATE_WINDOW_MS) {
    windowStart = now
    windowCount = 0
  }
  windowCount += 1
  return windowCount > RATE_MAX
}

/** La requête telle que Vercel la livre au handler Node : corps déjà parsé quand
 * le client envoie du JSON, brut sinon. */
type FunctionRequest = IncomingMessage & { body?: unknown }

function send(res: ServerResponse, body: object, status = 200): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

/** Le corps arrive déjà parsé (JSON) ou brut selon le client : on accepte les deux. */
function readQuestion(body: unknown): string {
  let parsed: unknown = body
  if (typeof body === 'string') {
    try {
      parsed = JSON.parse(body)
    } catch {
      return ''
    }
  }
  if (typeof parsed !== 'object' || parsed === null) return ''
  const question = (parsed as { question?: unknown }).question
  return typeof question === 'string' ? question.trim() : ''
}

async function callMistral(messages: ChatMessage[], apiKey: string): Promise<string> {
  const response = await fetch(MISTRAL_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.2,
      max_tokens: 700,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error(`Mistral a répondu ${String(response.status)}`)
  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = payload.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('réponse Mistral sans contenu')
  return content
}

/** La rédaction finale est du texte libre : même appel, sans format JSON forcé. */
async function callMistralText(messages: ChatMessage[], apiKey: string): Promise<string> {
  const response = await fetch(MISTRAL_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.3, max_tokens: 400 }),
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error(`Mistral a répondu ${String(response.status)}`)
  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = payload.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('réponse Mistral sans contenu')
  return content
}

async function callRpc(name: string, body: object, serviceKey: string): Promise<unknown> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) throw new Error(`Supabase a répondu ${String(response.status)}`)
  return response.json()
}

interface LogEntry {
  question: string
  sql: string | null
  status: 'answered' | 'refused' | 'guard_rejected' | 'error'
  rows: number | null
  startedAt: number
}

/** Le journal ne doit jamais faire échouer une réponse. */
async function logQuestion(entry: LogEntry, serviceKey: string): Promise<void> {
  try {
    await callRpc(
      'log_chat_question',
      {
        p_question: entry.question,
        p_generated_sql: entry.sql,
        p_status: entry.status,
        p_rows_returned: entry.rows,
        p_duration_ms: Date.now() - entry.startedAt,
      },
      serviceKey,
    )
  } catch {
    // silencieux : perdre une ligne de journal vaut mieux que perdre la réponse
  }
}

export default async function handler(req: FunctionRequest, res: ServerResponse): Promise<void> {
  const startedAt = Date.now()
  if (req.method !== 'POST') {
    send(res, { answer: 'Méthode non autorisée.' }, 405)
    return
  }
  const mistralKey = process.env.MISTRAL_API_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (mistralKey === undefined || serviceKey === undefined) {
    send(res, { answer: "Le chat n'est pas encore configuré sur ce déploiement." }, 503)
    return
  }
  if (rateLimited()) {
    send(
      res,
      { answer: 'Beaucoup de questions arrivent en même temps, réessaie dans une minute.' },
      429,
    )
    return
  }

  const question = readQuestion(req.body)
  if (question.length < 3 || question.length > 300) {
    send(res, { answer: 'Pose une question en quelques mots (300 caractères max).' }, 400)
    return
  }

  try {
    const plan = parsePlan(await callMistral(buildPlanMessages(question), mistralKey))
    if (plan === null) {
      await logQuestion({ question, sql: null, status: 'error', rows: null, startedAt }, serviceKey)
      send(res, { answer: UNAVAILABLE })
      return
    }
    if ('refusal' in plan) {
      await logQuestion(
        { question, sql: null, status: 'refused', rows: null, startedAt },
        serviceKey,
      )
      send(res, { answer: plan.refusal })
      return
    }

    const guarded = guardSql(plan.sql)
    if (!guarded.ok) {
      await logQuestion(
        { question, sql: plan.sql, status: 'guard_rejected', rows: null, startedAt },
        serviceKey,
      )
      send(res, { answer: OUT_OF_SCOPE })
      return
    }

    const result = (await callRpc('run_chat_query', { q: guarded.sql }, serviceKey)) as {
      rows?: unknown
      error?: unknown
    }
    if (!Array.isArray(result.rows)) {
      await logQuestion(
        { question, sql: guarded.sql, status: 'error', rows: null, startedAt },
        serviceKey,
      )
      send(res, { answer: OUT_OF_SCOPE })
      return
    }

    const rows: unknown[] = result.rows
    const raw = await callMistralText(buildAnswerMessages(question, rows), mistralKey)
    const answer = raw.replace(/[\u2013\u2014\u2015]/g, '-').trim()
    await logQuestion(
      { question, sql: guarded.sql, status: 'answered', rows: rows.length, startedAt },
      serviceKey,
    )
    send(res, { answer, sql: guarded.sql, rowCount: rows.length })
  } catch {
    await logQuestion({ question, sql: null, status: 'error', rows: null, startedAt }, serviceKey)
    send(res, { answer: UNAVAILABLE })
  }
}
