import { describe, expect, it } from 'vitest'
import { CHAT_RELATIONS, guardSql } from './chatGuard.ts'

const ok = (sql: string) => {
  const result = guardSql(sql)
  if (!result.ok) throw new Error(`refusé à tort : ${result.reason}`)
  return result.sql
}

const refused = (sql: string) => {
  const result = guardSql(sql)
  if (result.ok) throw new Error(`accepté à tort : ${result.sql}`)
  return result.reason
}

describe('guardSql : requêtes légitimes', () => {
  it('accepte un SELECT simple sur une vue autorisée et force un LIMIT', () => {
    expect(ok('select max(consommation) from chat.national')).toBe(
      'select max(consommation) from chat.national limit 50',
    )
  })

  it('conserve un LIMIT raisonnable existant, y compris un point-virgule final unique', () => {
    expect(ok('select ts, consommation from chat.national order by ts desc limit 10;')).toBe(
      'select ts, consommation from chat.national order by ts desc limit 10',
    )
  })

  it('accepte les CTE, jointures et sous-requêtes sur les vues autorisées', () => {
    ok(
      "with recent as (select * from chat.regional where ts > now() - interval '1 day') " +
        'select r.name, avg(recent.consommation) from recent join chat.regions r on r.code = recent.region_code group by r.name limit 12',
    )
    ok('select * from (select day, color from chat.tempo_days) t limit 5')
  })

  it('accepte les fonctions de date et le fuseau Europe/Paris dans les littéraux', () => {
    ok(
      "select date_trunc('day', ts at time zone 'Europe/Paris') as jour, max(consommation) " +
        'from chat.national group by 1 order by 2 desc limit 7',
    )
  })

  it('toutes les relations whitelistées passent', () => {
    for (const relation of CHAT_RELATIONS) {
      ok(`select count(*) from ${relation} limit 1`)
    }
  })
})

describe('guardSql : requêtes refusées', () => {
  it('refuse le vide, le trop long et le non-SELECT', () => {
    refused('')
    refused('x'.repeat(1600))
    refused('delete from chat.tempo_days')
    refused('explain select * from chat.national')
  })

  it('refuse tout second ordre et les commentaires', () => {
    expect(refused('select 1; drop view chat.national')).toMatch(/point-virgule/)
    refused('select 1 -- commentaire')
    refused('select /* rien */ 1')
  })

  it('refuse les relations hors whitelist, y compris via UNION ou jointure', () => {
    expect(refused('select * from ingest.eco2mix_national limit 1')).toMatch(/ingest/)
    refused('select 1 union all select consommation from marts.national_last_complete')
    refused('select * from chat.national n join pg_tables p on true limit 1')
    refused('select * from unknown_table limit 1')
  })

  it('refuse les mots-clés dangereux où qu ils soient', () => {
    refused('select 1 into tmp from chat.national')
    refused("select set_config('x', 'y', false)")
    refused('select pg_sleep(9)')
    refused('select * from pg_catalog.pg_tables')
    refused('select * from information_schema.tables')
    refused("select current_setting('server_version')")
    refused('create table x as select 1')
    refused('select 1 for update')
  })

  it("refuse l'introspection de session et la récursion (coût non borné)", () => {
    refused('select current_user')
    refused('select session_user, current_database()')
    refused('select version()')
    refused("select pg_notify('canal', 'x')")
    refused('with recursive r as (select 1 union all select 1 from r) select * from r limit 10')
  })

  it('refuse les identifiants entre guillemets doubles (contournement du filtre)', () => {
    refused('select * from "chat"."national" limit 1')
    refused('select "de""lete" from chat.national limit 1')
  })

  it('un LIMIT excessif est ramené au plafond', () => {
    expect(ok('select ts from chat.national limit 10000')).toBe(
      'select ts from chat.national limit 200',
    )
  })

  it('offset reste permis : le mot set n y est pas isolé', () => {
    ok('select ts from chat.national order by ts limit 10 offset 5')
  })
})
