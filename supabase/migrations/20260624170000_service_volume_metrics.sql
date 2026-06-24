-- PRD-214 — Service-volume metrics (read-only foundation).
--
-- Six SECURITY DEFINER aggregation functions that feed the Painel de
-- Atendimento (atendimentoMetrics provider). They REPLACE per-row RLS with an
-- in-function gate (role + store + demo-seed) so aggregating over ~66k messages
-- stays fast — mirroring public.whatsapp_delivery_health.
--
-- Scope A (read-only): no new table, no trigger. "Novo atendimento" = first
-- contact (conversations.created_at); reopens are deferred (scope B).
-- Buckets are computed in America/Sao_Paulo and keyed to match the frontend
-- engine bucketKey: day/week = 'YYYY-MM-DD' (week = ISO Monday), month = 'YYYY-MM'.
-- Owner: optional p_store_id (cross-store when null). Manager: forced to its own
-- store. demo-seed conversations are always excluded.

-- ── Novos atendimentos (primeiro contato) ────────────────────────────────────
create or replace function public.service_volume_novos_atendimentos(
  p_store_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_granularity text default 'day',
  p_seller_id uuid default null
) returns jsonb
language sql stable security definer set search_path to ''
as $function$
  with guard as (
    select
      public.current_app_role() as role,
      case when public.current_app_role() = 'manager'
           then public.current_store_id() else p_store_id end as eff_store,
      case when lower(coalesce(nullif(p_granularity, ''), 'day'))
                in ('day', 'week', 'month')
           then lower(coalesce(nullif(p_granularity, ''), 'day'))
           else 'day' end as g
  ),
  base as (
    select c.created_at, g.g
    from public.conversations c
    cross join guard g
    where g.role in ('owner', 'manager')
      and (g.eff_store is null or c.store_id = g.eff_store)
      and (p_seller_id is null or c.assigned_seller_id = p_seller_id)
      and ('demo-seed' = any(c.tags)) is not true
  ),
  cur as (
    select case g
             when 'month' then to_char(date_trunc('month', created_at at time zone 'America/Sao_Paulo'), 'YYYY-MM')
             else to_char(date_trunc(g, created_at at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD')
           end as bucket
    from base
    where created_at >= p_from and created_at <= p_to
  ),
  series as (
    select bucket, count(*)::int as value from cur group by bucket
  ),
  totals as (select count(*)::int as total from cur),
  prev as (
    select count(*)::int as prev_total
    from base
    where created_at >= p_from - (p_to - p_from) and created_at < p_from
  )
  select jsonb_build_object(
    'series', coalesce((
      select jsonb_agg(jsonb_build_object('bucket', bucket, 'value', value) order by bucket)
      from series), '[]'::jsonb),
    'total', (select total from totals),
    'averagePerDay', round(
      (select total from totals)::numeric
      / greatest(1, ((p_to at time zone 'America/Sao_Paulo')::date
                    - (p_from at time zone 'America/Sao_Paulo')::date) + 1), 1),
    'deltaPct', (
      select case when p.prev_total = 0 then null
                  else round(((t.total - p.prev_total)::numeric / p.prev_total) * 100)::int end
      from totals t, prev p),
    'historyStartsAt', null
  );
$function$;

-- ── Chats acumulados (cumulativo dentro da janela) ───────────────────────────
create or replace function public.service_volume_accumulated_chats(
  p_store_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_granularity text default 'day',
  p_seller_id uuid default null
) returns jsonb
language sql stable security definer set search_path to ''
as $function$
  with guard as (
    select
      public.current_app_role() as role,
      case when public.current_app_role() = 'manager'
           then public.current_store_id() else p_store_id end as eff_store,
      case when lower(coalesce(nullif(p_granularity, ''), 'day'))
                in ('day', 'week', 'month')
           then lower(coalesce(nullif(p_granularity, ''), 'day'))
           else 'day' end as g
  ),
  base as (
    select c.created_at, g.g
    from public.conversations c
    cross join guard g
    where g.role in ('owner', 'manager')
      and (g.eff_store is null or c.store_id = g.eff_store)
      and (p_seller_id is null or c.assigned_seller_id = p_seller_id)
      and ('demo-seed' = any(c.tags)) is not true
  ),
  cur as (
    select case g
             when 'month' then to_char(date_trunc('month', created_at at time zone 'America/Sao_Paulo'), 'YYYY-MM')
             else to_char(date_trunc(g, created_at at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD')
           end as bucket
    from base
    where created_at >= p_from and created_at <= p_to
  ),
  series as (
    select bucket, count(*)::int as value from cur group by bucket
  ),
  cumulative as (
    select bucket, sum(value) over (order by bucket)::int as value from series
  )
  select jsonb_build_object(
    'series', coalesce((
      select jsonb_agg(jsonb_build_object('bucket', bucket, 'value', value) order by bucket)
      from cumulative), '[]'::jsonb),
    'total', (select count(*)::int from base)
  );
$function$;

-- ── Distribuição de status (snapshot atual) ──────────────────────────────────
create or replace function public.service_volume_status_distribution(
  p_store_id uuid,
  p_seller_id uuid default null
) returns jsonb
language sql stable security definer set search_path to ''
as $function$
  with guard as (
    select
      public.current_app_role() as role,
      case when public.current_app_role() = 'manager'
           then public.current_store_id() else p_store_id end as eff_store
  ),
  base as (
    select c.status
    from public.conversations c
    cross join guard g
    where g.role in ('owner', 'manager')
      and (g.eff_store is null or c.store_id = g.eff_store)
      and (p_seller_id is null or c.assigned_seller_id = p_seller_id)
      and ('demo-seed' = any(c.tags)) is not true
  ),
  slices as (
    select status, count(*)::int as count from base group by status
  )
  select jsonb_build_object(
    'slices', coalesce((
      select jsonb_agg(jsonb_build_object('status', status, 'count', count) order by status)
      from slices), '[]'::jsonb),
    'total', (select count(*)::int from base)
  );
$function$;
