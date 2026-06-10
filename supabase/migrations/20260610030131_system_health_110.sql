-- PRD-110 — System health: DB liveness ping for the `health` Edge Function
-- and owner-only metric RPCs for the /app/gestao/saude dashboard.

-- 1) health_ping: minimal liveness probe. Executable ONLY by service_role
--    (the health function's client) — app users have no reason to call it.
create or replace function public.health_ping()
returns text
language sql
stable
set search_path = ''
as $$ select 'ok' $$;

revoke execute on function public.health_ping() from public, anon, authenticated;
grant execute on function public.health_ping() to service_role;

-- 2) system_health_cron_jobs: pg_cron job roster with each job's latest run.
--    SECURITY DEFINER because cron.* belongs to postgres; scoped to the owner
--    role via the same silent-filter pattern used by the mv_*_read() RPCs.
create or replace function public.system_health_cron_jobs()
returns table (
  jobname text,
  schedule text,
  active boolean,
  last_run_status text,
  last_run_started_at timestamptz,
  last_run_duration_ms numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    j.jobname::text,
    j.schedule::text,
    j.active,
    r.status::text,
    r.start_time,
    round(extract(epoch from (r.end_time - r.start_time)) * 1000)
  from cron.job j
  left join lateral (
    select d.status, d.start_time, d.end_time
    from cron.job_run_details d
    where d.jobid = j.jobid
    order by d.start_time desc
    limit 1
  ) r on true
  where public.current_app_role() = 'owner'
  order by j.jobname;
$$;

revoke execute on function public.system_health_cron_jobs() from public, anon;
grant execute on function public.system_health_cron_jobs() to authenticated;

-- 3) system_health_db_stats: database size and connection counters.
--    Owner-only (returns null for everyone else).
create or replace function public.system_health_db_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.current_app_role() = 'owner' then
    jsonb_build_object(
      'db_size_bytes', pg_database_size(current_database()),
      'public_tables_count',
        (select count(*) from pg_catalog.pg_tables where schemaname = 'public'),
      'active_connections',
        (select count(*) from pg_catalog.pg_stat_activity where state = 'active'),
      'total_connections',
        (select count(*) from pg_catalog.pg_stat_activity)
    )
  else null end;
$$;

revoke execute on function public.system_health_db_stats() from public, anon;
grant execute on function public.system_health_db_stats() to authenticated;
