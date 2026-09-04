-- 0023 : offres des fournisseurs de marché (ADR-0009, tranche 2).
-- Les grilles publiques des fournisseurs sont collectées par le WF10 n8n (fiche tarifaire
-- PDF ou page prix -> texte -> extraction Mistral en JSON -> contrôles de plausibilité) et
-- remplacées fournisseur par fournisseur à chaque run complet. Seules les offres a prix
-- fixe ou definies comme une remise sur le tarif reglemente sont retenues ; les offres
-- indexees sur un indice de marche sont exclues (ADR-0009).

create table if not exists ingest.supplier_offers (
  supplier text not null,
  offer text not null,
  option text not null check (option in ('BASE', 'HPHC')),
  p_souscrite smallint not null check (p_souscrite between 3 and 36),
  -- abonnement TTC en euros par an
  fixed_ttc numeric(10, 2) not null check (fixed_ttc between 30 and 3000),
  -- prix TTC du kWh : {"base": x} ou {"hp": x, "hc": y}
  prices_ttc jsonb not null,
  pricing_type text not null check (pricing_type in ('fixe', 'remise_trv')),
  price_locked_until date,
  green boolean not null default false,
  source_url text not null,
  grid_date date,
  -- texte source exact de chaque valeur, pour la tracabilite et la revue
  source_text jsonb,
  checked_at timestamptz not null default now(),
  primary key (supplier, offer, option, p_souscrite)
);

comment on table ingest.supplier_offers is
  'Grilles publiques des fournisseurs de marche, extraites automatiquement (WF10) et controlees.';

-- Remplacement complet d'un fournisseur : les offres absentes du run disparaissent
-- (une offre retiree du marche ne doit pas survivre en base). Chaque enregistrement
-- est verifie : option / prix coherents, valeurs plausibles ; les autres sont
-- rejetes et comptes, jamais corriges en silence.
create or replace function public.ingest_supplier_offers_raw(p_supplier text, records jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, ingest
as $$
declare
  rec jsonb;
  upserted int := 0;
  rejected int := 0;
  reasons jsonb := '[]'::jsonb;
  v_option text;
  v_prices jsonb;
  v_ok boolean;
  v_reason text;
begin
  if p_supplier is null or length(trim(p_supplier)) = 0 then
    raise exception 'p_supplier requis';
  end if;
  create temp table staged (like ingest.supplier_offers) on commit drop;

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
    elsif coalesce(rec->>'pricing_type', '') not in ('fixe', 'remise_trv') then
      v_ok := false; v_reason := 'type de prix non retenu';
    elsif coalesce(rec->>'source_url', '') !~ '^https?://' then
      v_ok := false; v_reason := 'source_url manquante';
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

  -- un run qui n'a rien de valide ne vide pas la base : on garde l'ancienne grille
  if upserted > 0 then
    delete from ingest.supplier_offers where supplier = p_supplier;
    insert into ingest.supplier_offers select * from staged;
  end if;

  return jsonb_build_object('supplier', p_supplier, 'upserted', upserted, 'rejected', rejected,
    'reasons', reasons, 'kept_previous', upserted = 0);
end;
$$;

revoke all on function public.ingest_supplier_offers_raw(text, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_supplier_offers_raw(text, jsonb) to service_role;

-- Vue publique : ce que le front compare, avec la date de la grille et la source.
create or replace view public.v_supplier_offers_current as
select supplier, offer, option, p_souscrite, fixed_ttc, prices_ttc, pricing_type,
  price_locked_until, green, source_url, grid_date, checked_at
from ingest.supplier_offers
order by supplier, offer, option, p_souscrite;

comment on view public.v_supplier_offers_current is
  'Offres des fournisseurs de marche (grilles publiques collectees et controlees par le WF10).';
grant select on public.v_supplier_offers_current to anon, authenticated;
