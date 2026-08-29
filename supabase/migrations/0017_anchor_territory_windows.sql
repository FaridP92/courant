-- 0017 : fenetres de l'Explorateur ancrees sur le dernier point publie.
--
-- Meme lecon que la migration 0007 cote national : une fenetre bornee sur now()
-- se vide entierement si l'ingestion s'arrete plus de 26 h, alors que les jauges
-- (v_regional_latest, sans borne) continuent d'afficher des chiffres. On ancre
-- donc sur max(ts) du realise : source en retard = fenetre en retard mais pleine,
-- et l'UI date ce qu'elle montre. Aligne aussi les grants sur les vues
-- precedentes (anon + authenticated).

create or replace view public.v_regional_24h as
with last as (
  select max(ts) as ts from ingest.eco2mix_regional where consommation is not null
)
select e.region_code, r.name as region_name, e.ts, e.consommation, e.thermique,
       e.nucleaire, e.eolien, e.solaire, e.hydraulique, e.pompage, e.bioenergies,
       e.ech_physiques
from ingest.eco2mix_regional e
join ingest.regions r on r.code = e.region_code
cross join last
where e.ts > last.ts - interval '26 hours' and e.ts <= last.ts
order by e.region_code, e.ts;

create or replace view public.v_regional_7d as
with last as (
  select max(ts) as ts from ingest.eco2mix_regional where consommation is not null
)
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
cross join last
where e.ts > last.ts - interval '7 days' and e.ts <= last.ts
group by e.region_code, date_trunc('hour', e.ts)
order by e.region_code, ts;

create or replace view public.v_regional_30d as
with last as (
  select max(ts) as ts from ingest.eco2mix_regional where consommation is not null
)
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
cross join last
where e.ts > last.ts - interval '30 days' and e.ts <= last.ts
group by e.region_code, date_trunc('hour', e.ts)
order by e.region_code, ts;

grant select on public.v_regional_24h to anon, authenticated;
grant select on public.v_regional_7d to anon, authenticated;
grant select on public.v_regional_30d to anon, authenticated;
grant select on public.v_metropoles_7d to anon, authenticated;
