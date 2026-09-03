import { describe, expect, it } from 'vitest'
import { buildAnswerMessages, buildPlanMessages, parsePlan } from './chatPrompts.ts'

describe('parsePlan', () => {
  it('lit un plan SQL ou un refus depuis le JSON du modèle', () => {
    expect(parsePlan('{"sql": "select 1"}')).toEqual({ sql: 'select 1' })
    expect(parsePlan('{"refusal": "hors périmètre"}')).toEqual({ refusal: 'hors périmètre' })
  })

  it('tolère du texte autour du JSON, refuse le reste', () => {
    expect(parsePlan('Voici : {"sql": "select 1"} merci')).toEqual({ sql: 'select 1' })
    expect(parsePlan('pas de json')).toBeNull()
    expect(parsePlan('{"autre": 1}')).toBeNull()
    expect(parsePlan('{"sql": 42}')).toBeNull()
  })
})

describe('prompts', () => {
  it('le prompt de plan contient le schéma, les règles, la date du jour et la question', () => {
    const messages = buildPlanMessages(
      'Record de consommation cet hiver ?',
      new Date('2026-09-03T10:00:00Z'),
    )
    // le modèle ne connaît pas la date : on la lui donne, avec les bornes de saison Tempo
    expect(messages[0]?.content).toContain('2026-09-03')
    expect(messages[0]?.content).toContain('a commence le 2026-09-01')
    expect(messages[0]?.content).toContain('du 2025-09-01 au 2026-09-01 exclu')
    const system = messages[0]?.content ?? ''
    expect(system).toContain('chat.national')
    expect(system).toContain('chat.tempo_days')
    expect(system).toContain('Europe/Paris')
    expect(system).toContain('LIMIT')
    // les lignes de prévision sont nulles : « en ce moment » ne doit jamais être max(ts)
    expect(system).toContain('jamais max(ts)')
    expect(system).toContain('ts_paris')
    expect(messages[1]?.content).toContain('Record de consommation cet hiver ?')
  })

  it("le prompt de réponse porte le résultat et l'exigence d'honnêteté", () => {
    const messages = buildAnswerMessages('Question ?', [{ record_mw: 102098 }])
    expect(messages[0]?.content).toMatch(/uniquement/i)
    expect(messages[1]?.content).toContain('102098')
  })
})
