-- 0016 : series temporelles par territoire pour l'Explorateur.
--
-- Le front interroge toujours UN territoire a la fois (region_code=eq.XX ou
-- epci_code=eq.XX) : les vues exposent toutes les regions/metropoles et
-- PostgREST filtre. Granularites : 24 h au pas source (15 ou 30 min selon
-- maturite), 7 j et 30 j en moyenne horaire. Les metropoles n'ont que 7 jours
-- d'historique (purge a l'ingestion) : pas de vue 30 j, le front le dit.

create or replace view public.v_regional_24h as
select e.region_code, r.name as region_name, e.ts, e.consommation, e.thermique,
       e.nucleaire, e.eolien, e.solaire, e.hydraulique, e.pompage, e.bioenergies,
       e.ech_physiques
from ingest.eco2mix_regional e
join ingest.regions r on r.code = e.region_code
where e.ts >= now() - interval '26 hours' and e.ts <= now()
order by e.region_code, e.ts;
comment on view public.v_regional_24h is
  'Series regionales 24 h glissantes au pas source ; filtrer par region_code.';
grant select on public.v_regional_24h to anon;

create or replace view public.v_regional_7d as
select e.region_code, min(r.name) as region_name,
       date_trunc('hour', e.ts) as ts,
       round(avg(e.consommation))::int as consommation,
       round(avg(e.thermique))::int as thermique,
       round(avg(e.nucleaire))::int as nucleaire,
       round(avg(e.eolien))::int as eolien,
       round(avg(e.solaire))::int as solaire,
       round(avg(e.hydraulique))::int as hydraulique,
       round(avg(e.pompage))::int as pompage,
       round(avg(e.bioenergies))::int as bioenergies,
       round(avg(e.ech_physiques))::int as ech_physiques
from ingest.eco2mix_regional e
join ingest.regions r on r.code = e.region_code
where e.ts >= now() - interval '7 days' and e.ts <= now()
group by e.region_code, date_trunc('hour', e.ts)
order by e.region_code, ts;
comment on view public.v_regional_7d is
  'Series regionales 7 jours en moyenne horaire ; filtrer par region_code.';
grant select on public.v_regional_7d to anon;

create or replace view public.v_regional_30d as
select e.region_code, min(r.name) as region_name,
       date_trunc('hour', e.ts) as ts,
       round(avg(e.consommation))::int as consommation,
       round(avg(e.thermique))::int as thermique,
       round(avg(e.nucleaire))::int as nucleaire,
       round(avg(e.eolien))::int as eolien,
       round(avg(e.solaire))::int as solaire,
       round(avg(e.hydraulique))::int as hydraulique,
       round(avg(e.pompage))::int as pompage,
       round(avg(e.bioenergies))::int as bioenergies,
       round(avg(e.ech_physiques))::int as ech_physiques
from ingest.eco2mix_regional e
join ingest.regions r on r.code = e.region_code
where e.ts >= now() - interval '30 days' and e.ts <= now()
group by e.region_code, date_trunc('hour', e.ts)
order by e.region_code, ts;
comment on view public.v_regional_30d is
  'Series regionales 30 jours en moyenne horaire ; filtrer par region_code.';
grant select on public.v_regional_30d to anon;

create or replace view public.v_metropoles_7d as
select epci_code, name, ts, consommation
from ingest.metropoles
where ts <= now()
order by epci_code, ts;
comment on view public.v_metropoles_7d is
  'Series metropoles sur la fenetre 7 jours conservee en base ; filtrer par epci_code.';
grant select on public.v_metropoles_7d to anon;
