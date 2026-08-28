-- Correction : la consommation du dataset consolidé est au pas 30 min (48/96 points),
-- la formule somme/4 sous-comptait donc l'énergie de moitié. moyenne(MW) x 24 h est
-- robuste quelle que soit la densité d'échantillonnage (hypothèse : trous uniformes).

drop view if exists public.v_national_daily;
drop materialized view if exists marts.national_daily;

create materialized view marts.national_daily as
select
  (ts at time zone 'Europe/Paris')::date as day_paris,
  count(*) filter (where consommation is not null) as points_consommation,
  count(*) filter (where nucleaire is not null) as points_production,
  min(maturity) as maturity,
  avg(consommation)::integer as avg_consommation_mw,
  max(consommation) as max_consommation_mw,
  min(consommation) as min_consommation_mw,
  round(avg(consommation) * 24)::bigint as energy_mwh,
  round(avg(nucleaire) * 24)::bigint as nuclear_mwh,
  round(avg(eolien) * 24)::bigint as wind_mwh,
  round(avg(solaire) * 24)::bigint as solar_mwh,
  round(avg(hydraulique) * 24)::bigint as hydro_mwh,
  round(avg(gaz) * 24)::bigint as gas_mwh,
  round(avg(charbon) * 24)::bigint as coal_mwh,
  round(avg(fioul) * 24)::bigint as oil_mwh,
  round(avg(bioenergies) * 24)::bigint as bio_mwh,
  max(solaire) as max_solaire_mw,
  max(eolien) as max_eolien_mw,
  avg(taux_co2)::smallint as avg_co2_g_kwh,
  round(avg(ech_physiques) * 24)::bigint as net_physical_exchange_mwh,
  min(ech_physiques) as peak_export_mw_signed
from ingest.eco2mix_national
where consommation is not null or nucleaire is not null
group by 1
with data;

create unique index national_daily_day_paris_idx on marts.national_daily (day_paris);

create view public.v_national_daily as
select * from marts.national_daily;

grant select on public.v_national_daily to anon, authenticated;
