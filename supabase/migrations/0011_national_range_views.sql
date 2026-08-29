-- Courant · Phase 3 : vues de période pour le sélecteur 24 h / 7 j / 30 j du dashboard.
-- Downsampling horaire (moyenne) pour borner les payloads : 7 j = 168 lignes, 30 j = 720.
-- Même forme de colonnes que v_national_24h : le front réutilise les mêmes constructeurs.

create view public.v_national_7d as
select
  date_trunc('hour', ts) as ts,
  min(maturity) as maturity,
  avg(consommation)::integer as consommation,
  avg(prevision_j1)::integer as prevision_j1,
  avg(prevision_j)::integer as prevision_j,
  avg(nucleaire)::integer as nucleaire,
  avg(hydraulique)::integer as hydraulique,
  avg(pompage)::integer as pompage,
  avg(eolien)::integer as eolien,
  avg(solaire)::integer as solaire,
  avg(gaz)::integer as gaz,
  avg(fioul)::integer as fioul,
  avg(charbon)::integer as charbon,
  avg(bioenergies)::integer as bioenergies,
  avg(ech_physiques)::integer as ech_physiques,
  avg(taux_co2)::smallint as taux_co2
from ingest.eco2mix_national
where ts >= now() - interval '7 days'
group by 1
order by 1;

create view public.v_national_30d as
select
  date_trunc('hour', ts) as ts,
  min(maturity) as maturity,
  avg(consommation)::integer as consommation,
  avg(prevision_j1)::integer as prevision_j1,
  avg(prevision_j)::integer as prevision_j,
  avg(nucleaire)::integer as nucleaire,
  avg(hydraulique)::integer as hydraulique,
  avg(pompage)::integer as pompage,
  avg(eolien)::integer as eolien,
  avg(solaire)::integer as solaire,
  avg(gaz)::integer as gaz,
  avg(fioul)::integer as fioul,
  avg(charbon)::integer as charbon,
  avg(bioenergies)::integer as bioenergies,
  avg(ech_physiques)::integer as ech_physiques,
  avg(taux_co2)::smallint as taux_co2
from ingest.eco2mix_national
where ts >= now() - interval '30 days'
group by 1
order by 1;

grant select on public.v_national_7d, public.v_national_30d to anon, authenticated;
