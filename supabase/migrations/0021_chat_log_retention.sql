-- 0021 : minimisation du journal du chat (RGPD, sobriete du brief).
-- La question est du texte libre : un visiteur peut y ecrire ce qu'il veut.
-- On ne stocke ni IP ni identifiant, la question est tronquee a 500 caracteres,
-- et le journal est purge au fil de l'eau : toute ligne de plus de 90 jours
-- disparait a la prochaine ecriture (pas de cron supplementaire a surveiller).

create or replace function public.log_chat_question(
  p_question text,
  p_generated_sql text,
  p_status text,
  p_rows_returned integer,
  p_duration_ms integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from ingest.chat_questions where asked_at < now() - interval '90 days';
  insert into ingest.chat_questions (question, generated_sql, status, rows_returned, duration_ms)
  values (left(p_question, 500), left(p_generated_sql, 2000), p_status, p_rows_returned, p_duration_ms);
end;
$$;
revoke all on function public.log_chat_question(text, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.log_chat_question(text, text, text, integer, integer)
  to service_role;
