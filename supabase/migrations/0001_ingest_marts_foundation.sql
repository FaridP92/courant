-- Courant · Phase 1 : fondations ingest + marts (données nationales éCO2mix)
-- Architecture :
--   ingest : données brutes, RLS verrouillée, écritures uniquement via RPC service_role
--   marts  : entrepôt (vues et vues matérialisées)
--   public : surface API PostgREST = vues minces v_* (lecture anon) + RPC ingest_* (service_role)
-- Exception d'identifiants documentée : les colonnes de mesures reprennent les noms exacts
-- des champs ODRÉ (contrat de source, mapping généré par introspection le 2026-08-28).

create schema if not exists ingest;
create schema if not exists marts;

revoke all on schema ingest from public;
revoke all on schema marts from public;
grant usage on schema ingest to service_role;
grant usage on schema marts to service_role;

create table ingest.eco2mix_national (
  ts timestamptz primary key,
  -- maturité de la donnée : R = temps réel, C = consolidé, D = définitif
  maturity char(1) not null check (maturity in ('R', 'C', 'D')),
  consommation integer,
  prevision_j1 integer,
  prevision_j integer,
  fioul integer,
  charbon integer,
  gaz integer,
  nucleaire integer,
  eolien integer,
  eolien_terrestre integer,
  eolien_offshore integer,
  solaire integer,
  hydraulique integer,
  pompage integer,
  bioenergies integer,
  ech_physiques integer,
  taux_co2 smallint,
  ech_comm_angleterre integer,
  ech_comm_espagne integer,
  ech_comm_italie integer,
  ech_comm_suisse integer,
  ech_comm_allemagne_belgique integer,
  fioul_tac integer,
  fioul_cogen integer,
  fioul_autres integer,
  gaz_tac integer,
  gaz_cogen integer,
  gaz_ccg integer,
  gaz_autres integer,
  hydraulique_fil_eau_eclusee integer,
  hydraulique_lacs integer,
  hydraulique_step_turbinage integer,
  bioenergies_dechets integer,
  bioenergies_biomasse integer,
  bioenergies_biogaz integer,
  stockage_batterie integer,
  destockage_batterie integer,
  updated_at timestamptz not null default now()
);

comment on table ingest.eco2mix_national is
  'éCO2mix national au quart d''heure. Source RTE via ODRÉ. ts en UTC (source Europe/Paris). Valeurs en MW, taux_co2 en g/kWh. Le PK btree sur ts couvre les range scans ; BRIN réservé aux tables régionales plus volumineuses.';
comment on column ingest.eco2mix_national.maturity is
  'R = eco2mix-national-tr, C = consolidé, D = définitif. Un upsert ne dégrade jamais la maturité.';

alter table ingest.eco2mix_national enable row level security;
grant select, insert, update on ingest.eco2mix_national to service_role;

create table ingest.ingestion_runs (
  id bigint generated always as identity primary key,
  workflow text not null,
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  status text not null check (status in ('success', 'error')),
  rows_upserted integer not null default 0,
  watermark_ts timestamptz,
  error text,
  details jsonb not null default '{}'::jsonb
);
comment on table ingest.ingestion_runs is 'Journal des exécutions n8n (WF1 ingestion horaire, WF6 backfill).';
alter table ingest.ingestion_runs enable row level security;
grant select, insert on ingest.ingestion_runs to service_role;

create or replace function public.ingest_eco2mix_national(rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_upserted integer;
begin
  insert into ingest.eco2mix_national (
    ts, maturity, consommation, prevision_j1, prevision_j, fioul, charbon, gaz,
    nucleaire, eolien, eolien_terrestre, eolien_offshore, solaire, hydraulique,
    pompage, bioenergies, ech_physiques, taux_co2, ech_comm_angleterre,
    ech_comm_espagne, ech_comm_italie, ech_comm_suisse, ech_comm_allemagne_belgique,
    fioul_tac, fioul_cogen, fioul_autres, gaz_tac, gaz_cogen, gaz_ccg, gaz_autres,
    hydraulique_fil_eau_eclusee, hydraulique_lacs, hydraulique_step_turbinage,
    bioenergies_dechets, bioenergies_biomasse, bioenergies_biogaz,
    stockage_batterie, destockage_batterie, updated_at
  )
  select
    (r->>'ts')::timestamptz,
    r->>'maturity',
    (r->>'consommation')::integer,
    (r->>'prevision_j1')::integer,
    (r->>'prevision_j')::integer,
    (r->>'fioul')::integer,
    (r->>'charbon')::integer,
    (r->>'gaz')::integer,
    (r->>'nucleaire')::integer,
    (r->>'eolien')::integer,
    (r->>'eolien_terrestre')::integer,
    (r->>'eolien_offshore')::integer,
    (r->>'solaire')::integer,
    (r->>'hydraulique')::integer,
    (r->>'pompage')::integer,
    (r->>'bioenergies')::integer,
    (r->>'ech_physiques')::integer,
    (r->>'taux_co2')::smallint,
    (r->>'ech_comm_angleterre')::integer,
    (r->>'ech_comm_espagne')::integer,
    (r->>'ech_comm_italie')::integer,
    (r->>'ech_comm_suisse')::integer,
    (r->>'ech_comm_allemagne_belgique')::integer,
    (r->>'fioul_tac')::integer,
    (r->>'fioul_cogen')::integer,
    (r->>'fioul_autres')::integer,
    (r->>'gaz_tac')::integer,
    (r->>'gaz_cogen')::integer,
    (r->>'gaz_ccg')::integer,
    (r->>'gaz_autres')::integer,
    (r->>'hydraulique_fil_eau_eclusee')::integer,
    (r->>'hydraulique_lacs')::integer,
    (r->>'hydraulique_step_turbinage')::integer,
    (r->>'bioenergies_dechets')::integer,
    (r->>'bioenergies_biomasse')::integer,
    (r->>'bioenergies_biogaz')::integer,
    (r->>'stockage_batterie')::integer,
    (r->>'destockage_batterie')::integer,
    now()
  from jsonb_array_elements(rows) as r
  on conflict (ts) do update set
    maturity = excluded.maturity,
    consommation = excluded.consommation,
    prevision_j1 = excluded.prevision_j1,
    prevision_j = excluded.prevision_j,
    fioul = excluded.fioul,
    charbon = excluded.charbon,
    gaz = excluded.gaz,
    nucleaire = excluded.nucleaire,
    eolien = excluded.eolien,
    eolien_terrestre = excluded.eolien_terrestre,
    eolien_offshore = excluded.eolien_offshore,
    solaire = excluded.solaire,
    hydraulique = excluded.hydraulique,
    pompage = excluded.pompage,
    bioenergies = excluded.bioenergies,
    ech_physiques = excluded.ech_physiques,
    taux_co2 = excluded.taux_co2,
    ech_comm_angleterre = excluded.ech_comm_angleterre,
    ech_comm_espagne = excluded.ech_comm_espagne,
    ech_comm_italie = excluded.ech_comm_italie,
    ech_comm_suisse = excluded.ech_comm_suisse,
    ech_comm_allemagne_belgique = excluded.ech_comm_allemagne_belgique,
    fioul_tac = excluded.fioul_tac,
    fioul_cogen = excluded.fioul_cogen,
    fioul_autres = excluded.fioul_autres,
    gaz_tac = excluded.gaz_tac,
    gaz_cogen = excluded.gaz_cogen,
    gaz_ccg = excluded.gaz_ccg,
    gaz_autres = excluded.gaz_autres,
    hydraulique_fil_eau_eclusee = excluded.hydraulique_fil_eau_eclusee,
    hydraulique_lacs = excluded.hydraulique_lacs,
    hydraulique_step_turbinage = excluded.hydraulique_step_turbinage,
    bioenergies_dechets = excluded.bioenergies_dechets,
    bioenergies_biomasse = excluded.bioenergies_biomasse,
    bioenergies_biogaz = excluded.bioenergies_biogaz,
    stockage_batterie = excluded.stockage_batterie,
    destockage_batterie = excluded.destockage_batterie,
    updated_at = now()
  -- garde de maturité : un point consolidé ou définitif n'est jamais écrasé par du temps réel
  where (case ingest.eco2mix_national.maturity when 'R' then 1 when 'C' then 2 else 3 end)
     <= (case excluded.maturity when 'R' then 1 when 'C' then 2 else 3 end);
  get diagnostics n_upserted = row_count;
  return jsonb_build_object('upserted', n_upserted);
end;
$$;

create or replace function public.get_eco2mix_national_watermark()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'max_ts', max(ts),
    'row_count', count(*)
  ) from ingest.eco2mix_national;
$$;

create or replace function public.log_ingestion_run(
  p_workflow text,
  p_started_at timestamptz,
  p_status text,
  p_rows_upserted integer default 0,
  p_watermark_ts timestamptz default null,
  p_error text default null,
  p_details jsonb default '{}'::jsonb
)
returns bigint
language sql
security definer
set search_path = ''
as $$
  insert into ingest.ingestion_runs (workflow, started_at, status, rows_upserted, watermark_ts, error, details)
  values (p_workflow, p_started_at, p_status, p_rows_upserted, p_watermark_ts, p_error, p_details)
  returning id;
$$;

revoke all on function public.ingest_eco2mix_national(jsonb) from public, anon, authenticated;
revoke all on function public.get_eco2mix_national_watermark() from public, anon, authenticated;
revoke all on function public.log_ingestion_run(text, timestamptz, text, integer, timestamptz, text, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_eco2mix_national(jsonb) to service_role;
grant execute on function public.get_eco2mix_national_watermark() to service_role;
grant execute on function public.log_ingestion_run(text, timestamptz, text, integer, timestamptz, text, jsonb) to service_role;
