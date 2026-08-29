-- Unification du prédicat "dernier point complet" (finding du panel Phase 2) :
-- v_national_latest exige consommation + nucléaire + taux_co2 ; la fenêtre 24 h
-- s'ancrait sur la consommation seule, d'où deux horodatages divergents possibles.
-- Prédicat unique désormais : les trois champs, partout (y compris côté front).

drop view public.v_national_24h;

create view public.v_national_24h as
with last_complete as (
  select max(ts) as ts
  from ingest.eco2mix_national
  where consommation is not null and nucleaire is not null and taux_co2 is not null
)
select e.ts, e.maturity, e.consommation, e.prevision_j1, e.prevision_j,
       e.nucleaire, e.hydraulique, e.pompage, e.eolien, e.solaire, e.gaz, e.fioul, e.charbon,
       e.bioenergies, e.ech_physiques, e.taux_co2
from ingest.eco2mix_national e, last_complete
where e.ts >= last_complete.ts - interval '20 hours'
  and e.ts <= last_complete.ts + interval '4 hours'
order by e.ts;

grant select on public.v_national_24h to anon, authenticated;
