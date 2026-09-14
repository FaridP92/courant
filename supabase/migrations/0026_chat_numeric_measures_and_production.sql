-- 0026 : coherence des ratios du chat avec le brief du matin.
--
-- Bug observe en production (13 septembre 2026) : a la question « part du
-- solaire hier a midi ? », le modele a genere (solaire / consommation) * 100 et
-- le chat a repondu 0 %, alors que le brief du meme jour annoncait un pic
-- solaire a 17,8 GW. Les colonnes de mesure des vues du schema chat etaient
-- des integer herites d'ingest : en PostgreSQL, 17316 / 40798 entre entiers
-- vaut 0. Regle 5 du projet (aucune donnee fausse dans l'UI) : la protection
-- doit etre deterministe, cote base, et non dependre du style SQL du modele.
--
-- Deux changements, sans toucher aux tables ingest ni aux marts :
--   1. toutes les mesures des vues chat sont exposees en numeric ; toute
--      division ecrite par le modele devient decimale ;
--   2. une colonne production (somme des filieres, hors pompage et hors
--      echanges) est ajoutee a chat.national et chat.regional, avec la meme
--      definition que les parts du brief du matin (migration 0018), pour que
--      « part du solaire » ait un seul denominateur dans tout le produit.
-- production est NULL sur les lignes de prevision (consommation NULL), comme
-- les autres mesures.
--
-- CREATE OR REPLACE VIEW ne peut pas changer le type d'une colonne existante :
-- les vues sont supprimees puis recreees. Les droits de read_only_chat sont
-- reconduits par les privileges par defaut du schema chat (migration 0019) ;
-- ils sont neanmoins reaffirmes explicitement ci-dessous.

drop view if exists chat.national;
create view chat.national as
select ts,
       maturity,
       consommation::numeric as consommation,
       case
         when consommation is null then null
         else coalesce(nucleaire, 0) + coalesce(hydraulique, 0) + coalesce(eolien, 0)
            + coalesce(solaire, 0) + coalesce(gaz, 0) + coalesce(fioul, 0)
            + coalesce(charbon, 0) + coalesce(bioenergies, 0)
       end::numeric as production,
       prevision_j::numeric as prevision_j,
       prevision_j1::numeric as prevision_j1,
       nucleaire::numeric as nucleaire,
       hydraulique::numeric as hydraulique,
       pompage::numeric as pompage,
       eolien::numeric as eolien,
       solaire::numeric as solaire,
       gaz::numeric as gaz,
       fioul::numeric as fioul,
       charbon::numeric as charbon,
       bioenergies::numeric as bioenergies,
       ech_physiques::numeric as ech_physiques,
       taux_co2::numeric as taux_co2
from ingest.eco2mix_national;
comment on view chat.national is
  'Mesures nationales eCO2mix au quart d''heure depuis 2012 (numeric, MW ; taux_co2 en g/kWh ; ech_physiques negatif = la France exporte ; production = somme des filieres hors pompage et echanges, comme dans le brief du matin).';

drop view if exists chat.regional;
create view chat.regional as
select e.region_code,
       r.name as region_name,
       e.ts,
       e.maturity,
       e.consommation::numeric as consommation,
       case
         when e.consommation is null then null
         else coalesce(e.thermique, 0) + coalesce(e.nucleaire, 0) + coalesce(e.eolien, 0)
            + coalesce(e.solaire, 0) + coalesce(e.hydraulique, 0) + coalesce(e.bioenergies, 0)
       end::numeric as production,
       e.thermique::numeric as thermique,
       e.nucleaire::numeric as nucleaire,
       e.eolien::numeric as eolien,
       e.solaire::numeric as solaire,
       e.hydraulique::numeric as hydraulique,
       e.pompage::numeric as pompage,
       e.bioenergies::numeric as bioenergies,
       e.ech_physiques::numeric as ech_physiques
from ingest.eco2mix_regional e
join ingest.regions r on r.code = e.region_code;
comment on view chat.regional is
  'Mesures regionales eCO2mix (12 regions, 24 mois glissants, numeric, MW ; production = somme des filieres hors pompage).';

drop view if exists chat.metropoles;
create view chat.metropoles as
select epci_code, name, ts, consommation::numeric as consommation
from ingest.metropoles;
comment on view chat.metropoles is
  'Consommation des metropoles (numeric, MW), 7 jours glissants.';

grant select on chat.national, chat.regional, chat.metropoles to read_only_chat;
