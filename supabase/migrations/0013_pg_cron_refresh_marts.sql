-- Le rafraîchissement des vues matérialisées passait par une RPC PostgREST appelée
-- par n8n : fragile (statement_timeout HTTP, transaction longue). pg_cron le fait
-- désormais dans la base, chaque heure à la minute 25 (après les ingestions de 12/17/22).
create extension if not exists pg_cron;

select cron.schedule(
  'courant-refresh-marts',
  '25 * * * *',
  $$select public.refresh_marts()$$
);
