-- 0025 : remplacement PAR DOCUMENT (une fiche tarifaire lue et verifiee remplace ses
-- offres ; une fiche en echec conserve ses lignes precedentes ; une fiche retiree de la
-- liste des sources voit ses lignes supprimees). Corrige aussi la table temporaire de
-- 0023/0024 (LIKE sans INCLUDING n'heritait pas de la cle primaire, d'ou l'echec
-- « no unique or exclusion constraint matching the ON CONFLICT specification »).
drop function if exists public.ingest_supplier_offers_raw(text, jsonb);

create or replace function public.ingest_supplier_offers_raw(
  p_supplier text, p_replace_urls jsonb, p_known_urls jsonb, records jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, ingest
as $$
declare
  rec jsonb;
  upserted int := 0;
  rejected int := 0;
  removed int := 0;
  reasons jsonb := '[]'::jsonb;
  v_option text;
  v_prices jsonb;
  v_ok boolean;
  v_reason text;
begin
  if p_supplier is null or length(trim(p_supplier)) = 0 then
    raise exception 'p_supplier requis';
  end if;
  create temp table staged (like ingest.supplier_offers including all) on commit drop;

  for rec in select * from jsonb_array_elements(coalesce(records, '[]'::jsonb)) loop
    v_ok := true;
    v_reason := null;
    v_option := upper(rec->>'option');
    v_prices := rec->'prices_ttc';
    if v_option not in ('BASE', 'HPHC') then
      v_ok := false; v_reason := 'option inconnue';
    elsif v_option = 'BASE' and not (jsonb_typeof(v_prices->'base') = 'number') then
      v_ok := false; v_reason := 'prix base manquant';
    elsif v_option = 'HPHC' and not (jsonb_typeof(v_prices->'hp') = 'number' and jsonb_typeof(v_prices->'hc') = 'number') then
      v_ok := false; v_reason := 'prix hp/hc manquant';
    elsif exists (
      select 1 from jsonb_each(v_prices) as e(k, v)
      where jsonb_typeof(v) <> 'number' or (v)::text::numeric not between 0.05 and 1.5
    ) then
      v_ok := false; v_reason := 'prix du kWh hors plausibilite (0,05 a 1,50 euro)';
    elsif (rec->>'fixed_ttc') is null or (rec->>'fixed_ttc')::numeric not between 30 and 3000 then
      v_ok := false; v_reason := 'abonnement annuel hors plausibilite (30 a 3000 euros)';
    elsif (rec->>'p_souscrite')::int not between 3 and 36 then
      v_ok := false; v_reason := 'puissance hors plage';
    elsif coalesce(rec->>'pricing_type', '') not in ('fixe', 'remise_trv', 'marche') then
      v_ok := false; v_reason := 'type de prix non retenu';
    elsif coalesce(rec->>'source_url', '') !~ '^https?://' then
      v_ok := false; v_reason := 'source_url manquante';
    elsif not (p_replace_urls ? (rec->>'source_url')) then
      v_ok := false; v_reason := 'source_url hors des documents remplaces';
    end if;

    if not v_ok then
      rejected := rejected + 1;
      reasons := reasons || jsonb_build_object('offer', rec->>'offer', 'option', v_option,
        'p_souscrite', rec->>'p_souscrite', 'reason', v_reason);
      continue;
    end if;

    insert into staged (supplier, offer, option, p_souscrite, fixed_ttc, prices_ttc, pricing_type,
      price_locked_until, green, source_url, grid_date, source_text, checked_at)
    values (p_supplier, rec->>'offer', v_option, (rec->>'p_souscrite')::int,
      (rec->>'fixed_ttc')::numeric, v_prices, rec->>'pricing_type',
      nullif(rec->>'price_locked_until', '')::date, coalesce((rec->>'green')::boolean, false),
      rec->>'source_url', nullif(rec->>'grid_date', '')::date, rec->'source_text', now())
    on conflict (supplier, offer, option, p_souscrite) do nothing;
    upserted := upserted + 1;
  end loop;

  -- les fiches lues remplacent leurs lignes ; les fiches disparues de la liste sont purgees
  delete from ingest.supplier_offers
  where supplier = p_supplier
    and (p_replace_urls ? source_url or not (coalesce(p_known_urls, '[]'::jsonb) ? source_url));
  get diagnostics removed = row_count;
  insert into ingest.supplier_offers select * from staged;

  return jsonb_build_object('supplier', p_supplier, 'upserted', upserted, 'rejected', rejected,
    'removed', removed, 'reasons', reasons, 'kept_previous', upserted = 0);
end;
$$;

revoke all on function public.ingest_supplier_offers_raw(text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_supplier_offers_raw(text, jsonb, jsonb, jsonb) to service_role;
