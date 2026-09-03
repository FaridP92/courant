-- 0019 : socle du chat "Pose ta question".
--
-- Principe (brief 7.2) : le SQL genere par le modele ne s'execute JAMAIS
-- directement. Triple verrou :
--   1. validation structurelle cote fonction Vercel (un seul SELECT, relations
--      whitelistees, LIMIT force) ;
--   2. role dedie read_only_chat, sans droit d'ecriture, qui ne voit QUE le
--      schema chat (vues stables pensees pour la generation) ;
--   3. execution via run_chat_query : requete enveloppee dans une sous-requete
--      (un point-virgule casse la syntaxe au lieu d'executer un second ordre)
--      et LIMIT 200 structurel. Timeout effectif du chemin API : 8 s via le
--      rolconfig d'authenticator (PostgREST), plus l'annulation cote Vercel.
-- NOTE : le SET LOCAL ROLE initial de cette migration etait refuse par
-- Postgres dans une fonction SECURITY DEFINER ; corrige en 0020 (la fonction
-- appartient a read_only_chat).

create schema chat;

create view chat.national as
select ts, maturity, consommation, prevision_j, prevision_j1, nucleaire,
       hydraulique, pompage, eolien, solaire, gaz, fioul, charbon, bioenergies,
       ech_physiques, taux_co2
from ingest.eco2mix_national;
comment on view chat.national is
  'Mesures nationales eCO2mix au quart d''heure depuis 2012 (MW ; taux_co2 en g/kWh ; ech_physiques negatif = la France exporte).';

create view chat.regional as
select e.region_code, r.name as region_name, e.ts, e.maturity, e.consommation,
       e.thermique, e.nucleaire, e.eolien, e.solaire, e.hydraulique, e.pompage,
       e.bioenergies, e.ech_physiques
from ingest.eco2mix_regional e
join ingest.regions r on r.code = e.region_code;
comment on view chat.regional is
  'Mesures regionales eCO2mix (12 regions, 24 mois glissants, MW).';

create view chat.metropoles as
select epci_code, name, ts, consommation
from ingest.metropoles;
comment on view chat.metropoles is
  'Consommation des metropoles (MW), 7 jours glissants.';

create view chat.tempo_days as
select day, color, source_updated_at
from ingest.tempo_days;
comment on view chat.tempo_days is
  'Calendrier Tempo depuis septembre 2014 (BLUE/WHITE/RED, saison du 1er septembre au 31 aout).';

create view chat.ecowatt_days as
select day, dvalue, message, generated_at
from ingest.ecowatt_days;
comment on view chat.ecowatt_days is
  'Signal Ecowatt par jour (1 vert, 2 orange, 3 rouge), archive depuis aout 2026.';

create view chat.ecowatt_hours as
select day, pas, hvalue
from ingest.ecowatt_hours;
comment on view chat.ecowatt_hours is
  'Signal Ecowatt horaire (0 vert bas carbone, 1 vert, 2 orange, 3 rouge).';

create view chat.regions as
select code, name from ingest.regions;
comment on view chat.regions is 'Referentiel des regions (code INSEE, nom).';

create role read_only_chat nologin;
grant usage on schema chat to read_only_chat;
grant select on all tables in schema chat to read_only_chat;
alter default privileges in schema chat grant select on tables to read_only_chat;
alter role read_only_chat set statement_timeout = '3s';
grant read_only_chat to postgres;

create or replace function public.run_chat_query(q text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if length(q) > 2000 then
    return jsonb_build_object('error', 'requete trop longue');
  end if;
  set local statement_timeout = '3s';
  set local role read_only_chat;
  execute 'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from ('
          || q || ') q limit 200) t'
  into result;
  return jsonb_build_object('rows', result);
exception when others then
  return jsonb_build_object('error', sqlerrm);
end;
$$;
revoke all on function public.run_chat_query(text) from public, anon, authenticated;
grant execute on function public.run_chat_query(text) to service_role;

create table ingest.chat_questions (
  id bigint generated always as identity primary key,
  asked_at timestamptz not null default now(),
  question text not null,
  generated_sql text,
  status text not null check (status in ('answered', 'refused', 'guard_rejected', 'error')),
  rows_returned integer,
  duration_ms integer
);
comment on table ingest.chat_questions is
  'Journal du chat pour amelioration continue. Aucune donnee personnelle.';
alter table ingest.chat_questions enable row level security;

create or replace function public.log_chat_question(
  p_question text,
  p_generated_sql text,
  p_status text,
  p_rows_returned integer,
  p_duration_ms integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into ingest.chat_questions (question, generated_sql, status, rows_returned, duration_ms)
  values (left(p_question, 500), left(p_generated_sql, 2000), p_status, p_rows_returned, p_duration_ms);
end;
$$;
revoke all on function public.log_chat_question(text, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.log_chat_question(text, text, text, integer, integer)
  to service_role;
