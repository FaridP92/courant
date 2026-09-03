-- 0020 : correctif du verrou d'execution du chat.
-- Postgres interdit SET LOCAL ROLE dans une fonction SECURITY DEFINER
-- ("cannot set parameter role within security-definer function").
-- La voie propre : run_chat_query appartient a read_only_chat ; SECURITY DEFINER
-- execute donc avec les droits de ce role (lecture seule sur le seul schema
-- chat), sans aucune bascule de role au runtime. Le droit CREATE sur public
-- n'est accorde que le temps du transfert de propriete, puis revoque.
-- Timeout : le SET LOCAL interne ne peut pas interrompre le statement en cours
-- (timer arme au demarrage) ; la borne effective du chemin API est le
-- statement_timeout=8s du role authenticator (PostgREST), doublee de
-- l'annulation a 8 s cote fonction Vercel.

create or replace function public.run_chat_query(q text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if length(q) > 2000 then
    return jsonb_build_object('error', 'requete trop longue');
  end if;
  set local statement_timeout = '3s';
  execute 'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from ('
          || q || ') q limit 200) t'
  into result;
  return jsonb_build_object('rows', result);
exception when others then
  return jsonb_build_object('error', sqlerrm);
end;
$$;

grant create on schema public to read_only_chat;
alter function public.run_chat_query(text) owner to read_only_chat;
revoke create on schema public from read_only_chat;

revoke all on function public.run_chat_query(text) from public, anon, authenticated;
grant execute on function public.run_chat_query(text) to service_role;
