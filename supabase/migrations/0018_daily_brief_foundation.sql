-- 0018 : le brief du matin. Les FAITS sont calcules en SQL depuis les donnees
-- de la veille ; le modele de langue (Mistral, via n8n) ne fait que la prose
-- autour de ces chiffres et n'invente rien. Le jsonb des faits est archive avec
-- chaque brief pour la tracabilite.

create table ingest.daily_briefs (
  day date primary key,
  body text not null,
  model text not null,
  facts jsonb not null,
  generated_at timestamptz not null default now()
);
comment on table ingest.daily_briefs is
  'Brief quotidien redige par IA : day = journee resumee (la veille de la generation).';
alter table ingest.daily_briefs enable row level security;

-- Les chiffres de la veille (jour civil Europe/Paris), null la ou la donnee manque.
create or replace function public.get_brief_facts()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d date := (now() at time zone 'Europe/Paris')::date - 1;
  facts jsonb;
begin
  select jsonb_build_object(
    'day', d,
    'points', count(*),
    'avg_conso_mw', round(avg(consommation)),
    'peak_conso_mw', max(consommation),
    'peak_ts', (
      select n2.ts from ingest.eco2mix_national n2
      where (n2.ts at time zone 'Europe/Paris')::date = d and n2.consommation is not null
      order by n2.consommation desc, n2.ts asc limit 1
    ),
    'low_conso_mw', min(consommation),
    'nuclear_share_pct', round(
      100.0 * sum(nucleaire) / nullif(
        sum(coalesce(nucleaire, 0) + coalesce(hydraulique, 0) + coalesce(eolien, 0)
          + coalesce(solaire, 0) + coalesce(gaz, 0) + coalesce(fioul, 0)
          + coalesce(charbon, 0) + coalesce(bioenergies, 0)), 0)
    ),
    'renewables_share_pct', round(
      100.0 * sum(coalesce(hydraulique, 0) + coalesce(eolien, 0) + coalesce(solaire, 0)
        + coalesce(bioenergies, 0)) / nullif(
        sum(coalesce(nucleaire, 0) + coalesce(hydraulique, 0) + coalesce(eolien, 0)
          + coalesce(solaire, 0) + coalesce(gaz, 0) + coalesce(fioul, 0)
          + coalesce(charbon, 0) + coalesce(bioenergies, 0)), 0)
    ),
    'net_export_avg_mw', round(avg(-ech_physiques)),
    'max_solaire_mw', max(solaire),
    'max_eolien_mw', max(eolien),
    'avg_co2_g_kwh', round(avg(taux_co2))
  )
  into facts
  from ingest.eco2mix_national
  where (ts at time zone 'Europe/Paris')::date = d and consommation is not null;

  facts := facts || jsonb_build_object(
    'tempo_today', (select color from ingest.tempo_days t where t.day = d + 1),
    'tempo_tomorrow', (select color from ingest.tempo_days t where t.day = d + 2),
    'ecowatt_today_dvalue', (select dvalue from ingest.ecowatt_days e where e.day = d + 1)
  );
  return facts;
end;
$$;
revoke all on function public.get_brief_facts() from public, anon, authenticated;
grant execute on function public.get_brief_facts() to service_role;

create or replace function public.ingest_brief(
  p_day date,
  p_body text,
  p_model text,
  p_facts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into ingest.daily_briefs (day, body, model, facts, generated_at)
  values (p_day, p_body, p_model, p_facts, now())
  on conflict (day) do update set
    body = excluded.body,
    model = excluded.model,
    facts = excluded.facts,
    generated_at = now();
  return jsonb_build_object('day', p_day);
end;
$$;
revoke all on function public.ingest_brief(date, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_brief(date, text, text, jsonb) to service_role;

create or replace view public.v_brief as
select day, body, model, generated_at
from ingest.daily_briefs
order by day desc
limit 1;
comment on view public.v_brief is 'Le dernier brief du matin publie.';
grant select on public.v_brief to anon, authenticated;
