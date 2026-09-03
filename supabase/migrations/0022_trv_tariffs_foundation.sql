-- 0022 : tarifs reglementes de vente (TRV Bleu residentiel) depuis l'open data
-- de la CRE (ADR-0009). Trois fichiers officiels (Option_Base, Option_HPHC,
-- Option_Tempo), historique depuis 2012 : une ligne par option, periode de
-- validite et puissance souscrite. date_fin null = grille en vigueur.
-- Les prix sont stockes en jsonb par composante pour absorber les trois
-- structures (base ; hp/hc ; six prix Tempo) sans multiplier les colonnes.

create table ingest.trv_tariffs (
  option text not null check (option in ('BASE', 'HPHC', 'TEMPO')),
  date_debut date not null,
  date_fin date,
  p_souscrite smallint not null check (p_souscrite between 3 and 36),
  fixed_ht numeric(10, 2) not null,
  fixed_ttc numeric(10, 2) not null,
  prices_ht jsonb not null,
  prices_ttc jsonb not null,
  source_url text not null,
  updated_at timestamptz not null default now(),
  primary key (option, date_debut, p_souscrite)
);
comment on table ingest.trv_tariffs is
  'TRV Bleu residentiel (CRE open data). fixed_* : abonnement annuel en euros ; prices_* : euros par kWh par composante (base | hp, hc | hp_bleu, hc_bleu, hp_blanc, hc_blanc, hp_rouge, hc_rouge).';
alter table ingest.trv_tariffs enable row level security;

-- n8n transporte les lignes deja typees (dates ISO, nombres) ; la base valide et upserte.
create or replace function public.ingest_trv_raw(p_option text, p_source_url text, records jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
  r jsonb;
begin
  for r in select * from jsonb_array_elements(records) loop
    -- une ligne sans abonnement (grille inexistante pour cette puissance) est ignoree
    if (r ->> 'fixed_ttc') is null or (r ->> 'fixed_ttc') = '' then
      continue;
    end if;
    insert into ingest.trv_tariffs
      (option, date_debut, date_fin, p_souscrite, fixed_ht, fixed_ttc, prices_ht, prices_ttc, source_url, updated_at)
    values (
      p_option,
      (r ->> 'date_debut')::date,
      nullif(r ->> 'date_fin', '')::date,
      (r ->> 'p_souscrite')::smallint,
      (r ->> 'fixed_ht')::numeric,
      (r ->> 'fixed_ttc')::numeric,
      r -> 'prices_ht',
      r -> 'prices_ttc',
      p_source_url,
      now()
    )
    on conflict (option, date_debut, p_souscrite) do update set
      date_fin = excluded.date_fin,
      fixed_ht = excluded.fixed_ht,
      fixed_ttc = excluded.fixed_ttc,
      prices_ht = excluded.prices_ht,
      prices_ttc = excluded.prices_ttc,
      source_url = excluded.source_url,
      updated_at = now();
    n := n + 1;
  end loop;
  return jsonb_build_object('upserted', n);
end;
$$;
revoke all on function public.ingest_trv_raw(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_trv_raw(text, text, jsonb) to service_role;

-- La grille en vigueur, pour le calcul cote navigateur.
create or replace view public.v_trv_current as
select option, p_souscrite, date_debut, fixed_ht, fixed_ttc, prices_ht, prices_ttc, source_url, updated_at
from ingest.trv_tariffs
where date_fin is null
order by option, p_souscrite;
comment on view public.v_trv_current is 'TRV Bleu en vigueur par option et puissance souscrite (CRE).';
grant select on public.v_trv_current to anon, authenticated;

-- Le calendrier Tempo des 400 derniers jours : le cout Tempo exact de l'annee
-- de l'utilisateur se calcule dans son navigateur, jour par jour.
create or replace view public.v_tempo_calendar as
select day, color
from ingest.tempo_days
where day >= (now() at time zone 'Europe/Paris')::date - 400
order by day;
comment on view public.v_tempo_calendar is 'Couleurs Tempo des 400 derniers jours (calcul local du cout Tempo).';
grant select on public.v_tempo_calendar to anon, authenticated;
