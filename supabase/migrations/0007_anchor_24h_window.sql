-- La fenêtre du graphe 24 h était ancrée sur max(ts), or le dataset temps réel
-- contient des lignes de prévision jusqu'à J+1 : la fenêtre montrait surtout du vide.
-- Nouvel ancrage : le dernier point complet, avec 20 h d'historique et 4 h de
-- prévisions devant (le curseur MAINTENANT tombe aux 5/6 de la largeur, comme la maquette).

drop view public.v_national_24h;

create view public.v_national_24h as
with last_complete as (
  select max(ts) as ts from ingest.eco2mix_national where consommation is not null
)
select e.ts, e.maturity, e.consommation, e.prevision_j1, e.prevision_j,
       e.nucleaire, e.hydraulique, e.pompage, e.eolien, e.solaire, e.gaz, e.fioul, e.charbon,
       e.bioenergies, e.ech_physiques, e.taux_co2
from ingest.eco2mix_national e, last_complete
where e.ts >= last_complete.ts - interval '20 hours'
  and e.ts <= last_complete.ts + interval '4 hours'
order by e.ts;

grant select on public.v_national_24h to anon, authenticated;
