-- log_ingestion_run v2 : retourne aussi le nombre d'échecs consécutifs (alerte n8n après N échecs)
drop function public.log_ingestion_run(text, timestamptz, text, integer, timestamptz, text, jsonb);

create or replace function public.log_ingestion_run(
  p_workflow text,
  p_started_at timestamptz,
  p_status text,
  p_rows_upserted integer default 0,
  p_watermark_ts timestamptz default null,
  p_error text default null,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_consecutive integer;
begin
  insert into ingest.ingestion_runs (workflow, started_at, status, rows_upserted, watermark_ts, error, details)
  values (p_workflow, p_started_at, p_status, p_rows_upserted, p_watermark_ts, p_error, p_details)
  returning id into v_id;

  with recent as (
    select status, row_number() over (order by finished_at desc, id desc) as rn
    from ingest.ingestion_runs
    where workflow = p_workflow
    order by finished_at desc, id desc
    limit 20
  )
  select count(*) into v_consecutive
  from recent
  where rn < coalesce((select min(rn) from recent where status = 'success'), 21);

  return jsonb_build_object('id', v_id, 'consecutive_errors', v_consecutive);
end;
$$;

revoke all on function public.log_ingestion_run(text, timestamptz, text, integer, timestamptz, text, jsonb) from public, anon, authenticated;
grant execute on function public.log_ingestion_run(text, timestamptz, text, integer, timestamptz, text, jsonb) to service_role;
