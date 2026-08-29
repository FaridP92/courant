-- 0015 : signaux Ecowatt (API RTE v5) et Tempo (API RTE v1.1).
--
-- Contrat source verifie par introspection le 2026-08-29 (payloads reels + guide
-- utilisateur officiel v5.0.0 du 07/11/2023) :
--   Ecowatt GET /signals : 4 jours J..J+3, dvalue 1..3 (vert/orange/rouge),
--   24 pas horaires MAX par jour (le jour courant peut etre PARTIEL, ex officiel
--   demarre a pas 7), hvalue 0..3 (0 = vert + production decarbonee, nouveaute v5).
--   J+3 est initialise tout vert et recalcule vers 17 h (12h15 le vendredi).
--   Quota : 1 appel / 15 min. Dates en heure francaise.
--   Tempo GET /tempo_like_calendars : 1 valeur par jour (minuit-minuit Paris),
--   value BLUE/WHITE/RED, publiee la veille vers 10h20 (updated_date).
-- L'archive se construit au fil de l'eau : on ne supprime jamais les jours passes
-- (volumetrie negligeable, ~9k lignes/an) pour permettre les statistiques.

create table ingest.ecowatt_days (
  day date primary key,
  dvalue smallint not null check (dvalue between 1 and 3),
  message text not null,
  generated_at timestamptz not null,
  updated_at timestamptz not null default now()
);
comment on table ingest.ecowatt_days is
  'Signal Ecowatt par jour (API RTE v5). dvalue 1 vert, 2 orange, 3 rouge.';
alter table ingest.ecowatt_days enable row level security;

create table ingest.ecowatt_hours (
  day date not null references ingest.ecowatt_days(day) on delete cascade,
  pas smallint not null check (pas between 0 and 23),
  hvalue smallint not null check (hvalue between 0 and 3),
  updated_at timestamptz not null default now(),
  primary key (day, pas)
);
comment on table ingest.ecowatt_hours is
  'Signal Ecowatt horaire. hvalue : 0 vert + production decarbonee, 1 vert, 2 orange, 3 rouge. '
  'Un pas absent d''un snapshot n''efface jamais un pas deja stocke (jour courant partiel).';
alter table ingest.ecowatt_hours enable row level security;

create table ingest.tempo_days (
  day date primary key,
  color text not null check (color in ('BLUE', 'WHITE', 'RED')),
  source_updated_at timestamptz not null,
  updated_at timestamptz not null default now()
);
comment on table ingest.tempo_days is
  'Calendrier Tempo (API RTE tempo_like_supply_contract v1.1), un jour = une couleur.';
alter table ingest.tempo_days enable row level security;

-- RPC d'ingestion : n8n transporte le payload API tel quel, la base normalise.
create or replace function public.ingest_ecowatt_raw(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_days integer := 0;
  n_hours integer := 0;
  sig jsonb;
  hr jsonb;
  d date;
begin
  for sig in select * from jsonb_array_elements(payload -> 'signals') loop
    -- 'jour' arrive en heure francaise : la date se lit dans ce fuseau, jamais en UTC
    d := ((sig ->> 'jour')::timestamptz at time zone 'Europe/Paris')::date;
    insert into ingest.ecowatt_days (day, dvalue, message, generated_at, updated_at)
    values (
      d,
      (sig ->> 'dvalue')::smallint,
      btrim(coalesce(sig ->> 'message', '')),
      (sig ->> 'GenerationFichier')::timestamptz,
      now()
    )
    on conflict (day) do update set
      dvalue = excluded.dvalue,
      message = excluded.message,
      generated_at = excluded.generated_at,
      updated_at = now();
    n_days := n_days + 1;

    for hr in select * from jsonb_array_elements(sig -> 'values') loop
      insert into ingest.ecowatt_hours (day, pas, hvalue, updated_at)
      values (d, (hr ->> 'pas')::smallint, (hr ->> 'hvalue')::smallint, now())
      on conflict (day, pas) do update set
        hvalue = excluded.hvalue,
        updated_at = now();
      n_hours := n_hours + 1;
    end loop;
  end loop;
  return jsonb_build_object('days', n_days, 'hours', n_hours);
end;
$$;
revoke all on function public.ingest_ecowatt_raw(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_ecowatt_raw(jsonb) to service_role;

create or replace function public.ingest_tempo_raw(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_days integer := 0;
  v jsonb;
begin
  for v in select * from jsonb_array_elements(payload -> 'tempo_like_calendars' -> 'values') loop
    insert into ingest.tempo_days (day, color, source_updated_at, updated_at)
    values (
      ((v ->> 'start_date')::timestamptz at time zone 'Europe/Paris')::date,
      v ->> 'value',
      (v ->> 'updated_date')::timestamptz,
      now()
    )
    on conflict (day) do update set
      color = excluded.color,
      source_updated_at = excluded.source_updated_at,
      updated_at = now();
    n_days := n_days + 1;
  end loop;
  return jsonb_build_object('days', n_days);
end;
$$;
revoke all on function public.ingest_tempo_raw(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_tempo_raw(jsonb) to service_role;

-- Vues publiques pour le front (lecture anonyme).
create or replace view public.v_ecowatt as
select
  d.day,
  d.dvalue,
  d.message,
  d.generated_at,
  (
    select jsonb_agg(jsonb_build_object('pas', h.pas, 'hvalue', h.hvalue) order by h.pas)
    from ingest.ecowatt_hours h
    where h.day = d.day
  ) as hours
from ingest.ecowatt_days d
where d.day >= (now() at time zone 'Europe/Paris')::date
order by d.day;
comment on view public.v_ecowatt is
  'Fenetre Ecowatt du jour a J+3, heures en tableau jsonb trie par pas.';
grant select on public.v_ecowatt to anon;

create or replace view public.v_tempo as
with paris as (
  select (now() at time zone 'Europe/Paris')::date as today
),
season as (
  -- la saison Tempo court du 1er septembre au 31 aout
  select
    p.today,
    case
      when extract(month from p.today) >= 9
        then make_date(extract(year from p.today)::int, 9, 1)
      else make_date(extract(year from p.today)::int - 1, 9, 1)
    end as season_start
  from paris p
)
select
  s.today,
  s.season_start,
  t_today.color as today_color,
  t_today.source_updated_at as today_updated_at,
  t_tomorrow.color as tomorrow_color,
  t_tomorrow.source_updated_at as tomorrow_updated_at,
  (select count(*) from ingest.tempo_days t
     where t.day between s.season_start and s.today and t.color = 'RED')::int as red_days_used,
  (select count(*) from ingest.tempo_days t
     where t.day between s.season_start and s.today and t.color = 'WHITE')::int as white_days_used,
  (select count(*) from ingest.tempo_days t
     where t.day between s.season_start and s.today and t.color = 'BLUE')::int as blue_days_used
from season s
left join ingest.tempo_days t_today on t_today.day = s.today
left join ingest.tempo_days t_tomorrow on t_tomorrow.day = s.today + 1;
comment on view public.v_tempo is
  'Tempo du jour : couleurs aujourd''hui/demain (null si non publie) et compteurs de la saison en cours.';
grant select on public.v_tempo to anon;
