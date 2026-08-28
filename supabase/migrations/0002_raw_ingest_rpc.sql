-- Normalisation des enregistrements ODRÉ bruts, côté base (source de vérité unique).
-- n8n envoie les records de l'API/export tels quels ; la base mappe, blinde les casts
-- (valeurs 'ND', '-', vides, colonnes text du dataset consolidé) et upserte.
-- NOTE : le corps de ingest_eco2mix_national_raw est remplacé en 0006 (déduplication DST).

create or replace function ingest.safe_int(rec jsonb, key text)
returns integer
language sql
immutable
as $$
  select case
    when jsonb_typeof(rec -> key) = 'number' then round((rec ->> key)::numeric)::integer
    when (rec ->> key) ~ '^-?[0-9]+([.][0-9]+)?$' then round((rec ->> key)::numeric)::integer
    else null
  end;
$$;

comment on function ingest.safe_int(jsonb, text) is
  'Cast entier tolérant pour les champs ODRÉ : nombres, chaînes numériques, sinon NULL (ND, -, vide).';
