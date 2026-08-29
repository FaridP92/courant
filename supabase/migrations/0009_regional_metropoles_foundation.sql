-- Courant · Phase 3 : données régionales et métropoles.
-- Introspection ODRÉ du 2026-08-29 : le régional agrège le fossile en "thermique",
-- les ratios tco_/tch_ (dérivables) ne sont pas stockés, les types text/int varient
-- entre datasets d'où les casts blindés via ingest.safe_int.
-- (SQL complet appliqué via MCP ; corps identique à la migration en base.)

create table ingest.regions (
  code text primary key,
  name text not null
);
alter table ingest.regions enable row level security;
grant select, insert, update on ingest.regions to service_role;

create table ingest.eco2mix_regional (
  region_code text not null references ingest.regions(code),
  ts timestamptz not null,
  maturity char(1) not null check (maturity in ('R', 'C', 'D')),
  consommation integer,
  thermique integer,
  nucleaire integer,
  eolien integer,
  eolien_terrestre integer,
  eolien_offshore integer,
  solaire integer,
  hydraulique integer,
  pompage integer,
  bioenergies integer,
  ech_physiques integer,
  stockage_batterie integer,
  destockage_batterie integer,
  updated_at timestamptz not null default now(),
  primary key (region_code, ts)
);
comment on table ingest.eco2mix_regional is
  'éCO2mix régional au quart d''heure (12 régions, hors Corse). MW entiers. Rétention : quart d''heure sur 24 mois glissants, agrégats journaliers au-delà (ADR-0002).';
alter table ingest.eco2mix_regional enable row level security;
grant select, insert, update on ingest.eco2mix_regional to service_role;
create index eco2mix_regional_ts_brin on ingest.eco2mix_regional using brin (ts);

create table ingest.metropoles (
  epci_code text not null,
  ts timestamptz not null,
  name text not null,
  consommation integer,
  updated_at timestamptz not null default now(),
  primary key (epci_code, ts)
);
comment on table ingest.metropoles is
  'Consommation temps réel des métropoles. Fenêtre glissante 7 jours (purge à l''ingestion), pas de backfill : usage sparklines uniquement (ADR-0002).';
alter table ingest.metropoles enable row level security;
grant select, insert, update, delete on ingest.metropoles to service_role;

-- RPC (service_role uniquement) :
--   public.ingest_eco2mix_regional_raw(records jsonb) : normalisation, dédup DST
--     par (région, ts), garde de maturité R < C < D, alimente ingest.regions
--   public.ingest_metropoles_raw(records jsonb) : idem métropoles + purge 7 jours
--   public.get_eco2mix_regional_watermark() / public.get_metropoles_watermark()
