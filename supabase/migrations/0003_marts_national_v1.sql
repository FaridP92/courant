-- Courant · Phase 1 : première couche marts nationale + surface API publique.
-- Convention de signe ODRÉ : ech_physiques négatif = la France exporte.
-- NOTE : marts.national_daily est recréée en 0004 (formule d'énergie corrigée).

create view marts.national_last_complete as
select *
from ingest.eco2mix_national
where consommation is not null
  and nucleaire is not null
  and taux_co2 is not null
order by ts desc
limit 1;

create view marts.national_records as
select record_key, label_fr, ts, value, unit from (
  (select 'max_consommation' as record_key, 'Pointe historique de consommation' as label_fr,
          ts, consommation as value, 'MW' as unit
   from ingest.eco2mix_national where consommation is not null
   order by consommation desc, ts limit 1)
  union all
  (select 'max_solaire', 'Record de production solaire', ts, solaire, 'MW'
   from ingest.eco2mix_national where solaire is not null
   order by solaire desc, ts limit 1)
  union all
  (select 'max_eolien', 'Record de production éolienne', ts, eolien, 'MW'
   from ingest.eco2mix_national where eolien is not null
   order by eolien desc, ts limit 1)
  union all
  (select 'max_export', 'Record d''export instantané', ts, -ech_physiques, 'MW'
   from ingest.eco2mix_national where ech_physiques is not null
   order by ech_physiques asc, ts limit 1)
) r;

create view public.v_national_latest as
select ts, maturity, consommation, prevision_j1, prevision_j,
       nucleaire, hydraulique, pompage, eolien, solaire, gaz, fioul, charbon,
       bioenergies, ech_physiques, taux_co2, updated_at
from marts.national_last_complete;

create view public.v_national_24h as
select ts, maturity, consommation, prevision_j1, prevision_j,
       nucleaire, hydraulique, pompage, eolien, solaire, gaz, fioul, charbon,
       bioenergies, ech_physiques, taux_co2
from ingest.eco2mix_national
where ts >= (select max(ts) from ingest.eco2mix_national) - interval '24 hours'
order by ts;

create view public.v_national_records as
select * from marts.national_records;

grant select on public.v_national_latest, public.v_national_24h, public.v_national_records
  to anon, authenticated;

-- Rafraîchissement des marts, appelé par n8n après ingestion (service_role uniquement).
-- Non-concurrent à dessein : PostgREST exécute les RPC dans une transaction.
create or replace function public.refresh_national_marts()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  refresh materialized view marts.national_daily;
end;
$$;

revoke all on function public.refresh_national_marts() from public, anon, authenticated;
grant execute on function public.refresh_national_marts() to service_role;
