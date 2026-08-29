-- Les flux frontaliers de la carte lisent les échanges commerciaux par frontière :
-- v_national_latest les expose désormais (le typage strict du front a levé le manque).
drop view public.v_national_latest;

create view public.v_national_latest as
select ts, maturity, consommation, prevision_j1, prevision_j,
       nucleaire, hydraulique, pompage, eolien, solaire, gaz, fioul, charbon,
       bioenergies, ech_physiques, taux_co2,
       ech_comm_angleterre, ech_comm_espagne, ech_comm_italie, ech_comm_suisse,
       ech_comm_allemagne_belgique,
       updated_at
from marts.national_last_complete;

grant select on public.v_national_latest to anon, authenticated;
