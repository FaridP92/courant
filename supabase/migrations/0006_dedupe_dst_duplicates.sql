-- Jours de changement d'heure (mars) : la source publie l'heure locale inexistante
-- (02:00-02:45) avec le même date_heure UTC que 03:00-03:45. On déduplique par ts :
-- préférence au record avec consommation renseignée, puis à la dernière occurrence.
-- Bug réel attrapé par le test DST du 2025-03-30 avant tout backfill (voir ADR-0003).
create or replace function public.ingest_eco2mix_national_raw(records jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.ingest_eco2mix_national((
    select coalesce(jsonb_agg(rec_obj), '[]'::jsonb)
    from (
      select distinct on ((rec ->> 'date_heure')::timestamptz)
        jsonb_build_object(
          'ts', rec ->> 'date_heure',
          'maturity', case rec ->> 'nature'
            when 'Données temps réel' then 'R'
            when 'Données définitives' then 'D'
            else 'C'
          end,
          'consommation', ingest.safe_int(rec, 'consommation'),
          'prevision_j1', ingest.safe_int(rec, 'prevision_j1'),
          'prevision_j', ingest.safe_int(rec, 'prevision_j'),
          'fioul', ingest.safe_int(rec, 'fioul'),
          'charbon', ingest.safe_int(rec, 'charbon'),
          'gaz', ingest.safe_int(rec, 'gaz'),
          'nucleaire', ingest.safe_int(rec, 'nucleaire'),
          'eolien', ingest.safe_int(rec, 'eolien'),
          'eolien_terrestre', ingest.safe_int(rec, 'eolien_terrestre'),
          'eolien_offshore', ingest.safe_int(rec, 'eolien_offshore'),
          'solaire', ingest.safe_int(rec, 'solaire'),
          'hydraulique', ingest.safe_int(rec, 'hydraulique'),
          'pompage', ingest.safe_int(rec, 'pompage'),
          'bioenergies', ingest.safe_int(rec, 'bioenergies'),
          'ech_physiques', ingest.safe_int(rec, 'ech_physiques'),
          'taux_co2', ingest.safe_int(rec, 'taux_co2'),
          'ech_comm_angleterre', ingest.safe_int(rec, 'ech_comm_angleterre'),
          'ech_comm_espagne', ingest.safe_int(rec, 'ech_comm_espagne'),
          'ech_comm_italie', ingest.safe_int(rec, 'ech_comm_italie'),
          'ech_comm_suisse', ingest.safe_int(rec, 'ech_comm_suisse'),
          'ech_comm_allemagne_belgique', ingest.safe_int(rec, 'ech_comm_allemagne_belgique'),
          'fioul_tac', ingest.safe_int(rec, 'fioul_tac'),
          'fioul_cogen', ingest.safe_int(rec, 'fioul_cogen'),
          'fioul_autres', ingest.safe_int(rec, 'fioul_autres'),
          'gaz_tac', ingest.safe_int(rec, 'gaz_tac'),
          'gaz_cogen', ingest.safe_int(rec, 'gaz_cogen'),
          'gaz_ccg', ingest.safe_int(rec, 'gaz_ccg'),
          'gaz_autres', ingest.safe_int(rec, 'gaz_autres'),
          'hydraulique_fil_eau_eclusee', ingest.safe_int(rec, 'hydraulique_fil_eau_eclusee'),
          'hydraulique_lacs', ingest.safe_int(rec, 'hydraulique_lacs'),
          'hydraulique_step_turbinage', ingest.safe_int(rec, 'hydraulique_step_turbinage'),
          'bioenergies_dechets', ingest.safe_int(rec, 'bioenergies_dechets'),
          'bioenergies_biomasse', ingest.safe_int(rec, 'bioenergies_biomasse'),
          'bioenergies_biogaz', ingest.safe_int(rec, 'bioenergies_biogaz'),
          'stockage_batterie', ingest.safe_int(rec, 'stockage_batterie'),
          'destockage_batterie', ingest.safe_int(rec, 'destockage_batterie')
        ) as rec_obj
      from jsonb_array_elements(records) with ordinality as t(rec, ord)
      where rec ->> 'date_heure' is not null
      order by (rec ->> 'date_heure')::timestamptz,
               (rec ->> 'consommation') is null,
               ord desc
    ) dedup
  ));
$$;

revoke all on function public.ingest_eco2mix_national_raw(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_eco2mix_national_raw(jsonb) to service_role;
