-- Courant · Phase 3 : marts régionaux et surface API publique carte + métropoles.

create materialized view marts.regional_daily as
select
  (ts at time zone 'Europe/Paris')::date as day_paris,
  region_code,
  count(*) filter (where consommation is not null) as points_consommation,
  min(maturity) as maturity,
  avg(consommation)::integer as avg_consommation_mw,
  max(consommation) as max_consommation_mw,
  round(avg(consommation) * 24)::bigint as energy_mwh,
  round(avg(eolien) * 24)::bigint as wind_mwh,
  round(avg(solaire) * 24)::bigint as solar_mwh,
  round(avg(hydraulique) * 24)::bigint as hydro_mwh,
  round(avg(nucleaire) * 24)::bigint as nuclear_mwh,
  round(avg(ech_physiques) * 24)::bigint as net_physical_exchange_mwh
from ingest.eco2mix_regional
where consommation is not null
group by 1, 2
with data;

create unique index regional_daily_day_region_idx on marts.regional_daily (day_paris, region_code);

create view marts.regional_last_complete as
select distinct on (e.region_code)
  e.region_code, r.name as region_name, e.ts, e.maturity, e.consommation, e.thermique,
  e.nucleaire, e.eolien, e.solaire, e.hydraulique, e.pompage, e.bioenergies, e.ech_physiques
from ingest.eco2mix_regional e
join ingest.regions r on r.code = e.region_code
where e.consommation is not null
order by e.region_code, e.ts desc;

create view public.v_regional_latest as
select * from marts.regional_last_complete;

create view public.v_metropoles_6h as
with anchor as (
  select max(ts) as ts from ingest.metropoles where consommation is not null
)
select m.epci_code, m.name, m.ts, m.consommation
from ingest.metropoles m, anchor
where m.ts >= anchor.ts - interval '6 hours'
  and m.ts <= anchor.ts
order by m.name, m.ts;

grant select on public.v_regional_latest, public.v_metropoles_6h to anon, authenticated;

create or replace function public.refresh_marts()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  refresh materialized view marts.national_daily;
  refresh materialized view marts.regional_daily;
end;
$$;

revoke all on function public.refresh_marts() from public, anon, authenticated;
grant execute on function public.refresh_marts() to service_role;
