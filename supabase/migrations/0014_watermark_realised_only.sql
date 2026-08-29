-- 0014 : le watermark d'ingestion ne compte que les lignes REALISEES.
--
-- Bug corrige : les datasets tr publient des lignes de prevision jusqu'a J+1
-- (consommation nulle, seuls prevision_j/j1 renseignes). max(ts) brut sautait
-- donc a J+1 21:45 et le delta n8n (since = watermark - lookback 24 h) demarrait
-- DANS LE FUTUR : le realise du jour n'etait plus jamais rafraichi apres sa
-- premiere ingestion (gel constate le 2026-08-29 : dernier realise 03:45 UTC).
-- Le watermark devient max(ts) des lignes dont la consommation est renseignee ;
-- les previsions au-dela sont de toute facon reprises par le delta (ts > since).

create or replace function public.get_eco2mix_national_watermark()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'max_ts', max(ts) filter (where consommation is not null),
    'row_count', count(*)
  ) from ingest.eco2mix_national;
$$;

create or replace function public.get_eco2mix_regional_watermark()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'max_ts', max(ts) filter (where consommation is not null),
    'row_count', count(*)
  ) from ingest.eco2mix_regional;
$$;

create or replace function public.get_metropoles_watermark()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'max_ts', max(ts) filter (where consommation is not null),
    'row_count', count(*)
  ) from ingest.metropoles;
$$;
