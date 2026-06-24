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

-- ── Mensagens enviadas vs recebidas (por bucket) ─────────────────────────────
create or replace function public.service_volume_message_volume(
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
    select m.sent_at, m.direction, g.g
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    cross join guard g
    where g.role in ('owner', 'manager')
      and (g.eff_store is null or c.store_id = g.eff_store)
      and (p_seller_id is null or c.assigned_seller_id = p_seller_id)
      and ('demo-seed' = any(c.tags)) is not true
      and m.sent_at >= p_from and m.sent_at <= p_to
  ),
  bucketed as (
    select case g
             when 'month' then to_char(date_trunc('month', sent_at at time zone 'America/Sao_Paulo'), 'YYYY-MM')
             else to_char(date_trunc(g, sent_at at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD')
           end as bucket,
           direction
    from base
  ),
  series as (
    select bucket,
           count(*) filter (where direction = 'out')::int as sent,
           count(*) filter (where direction = 'in')::int as received
    from bucketed group by bucket
  )
  select jsonb_build_object(
    'series', coalesce((
      select jsonb_agg(jsonb_build_object('bucket', bucket, 'sent', sent, 'received', received) order by bucket)
      from series), '[]'::jsonb),
    'totalSent', (select count(*)::int from base where direction = 'out'),
    'totalReceived', (select count(*)::int from base where direction = 'in')
  );
$function$;

-- ── Mensagens por atendente (atribuição por responsável da conversa) ──────────
create or replace function public.service_volume_messages_by_user(
  p_store_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_seller_id uuid default null,
  p_audience text default 'all'
) returns jsonb
language sql stable security definer set search_path to ''
as $function$
  with guard as (
    select
      public.current_app_role() as role,
      case when public.current_app_role() = 'manager'
           then public.current_store_id() else p_store_id end as eff_store,
      case when lower(coalesce(nullif(p_audience, ''), 'all'))
                in ('human', 'automation', 'all')
           then lower(coalesce(nullif(p_audience, ''), 'all'))
           else 'all' end as aud
  ),
  base as (
    select m.author_type, c.assigned_seller_id
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    cross join guard g
    where g.role in ('owner', 'manager')
      and (g.eff_store is null or c.store_id = g.eff_store)
      and (p_seller_id is null or c.assigned_seller_id = p_seller_id)
      and ('demo-seed' = any(c.tags)) is not true
      and m.direction = 'out'
      and m.author_type <> 'customer'
      and m.sent_at >= p_from and m.sent_at <= p_to
  ),
  classified as (
    select case when author_type = 'sdr' then 'automation' else 'human' end as kind,
           assigned_seller_id
    from base
  ),
  filtered as (
    select c.kind, c.assigned_seller_id
    from classified c cross join guard g
    where g.aud = 'all' or g.aud = c.kind
  ),
  human_rows as (
    select f.assigned_seller_id as seller_id,
           coalesce(s.full_name, 'Sem responsável') as name,
           'seller'::text as author_type,
           count(*)::int as count
    from filtered f
    left join public.sellers s on s.id = f.assigned_seller_id
    where f.kind = 'human'
    group by f.assigned_seller_id, s.full_name
  ),
  auto_rows as (
    select null::uuid as seller_id, 'SDR (automação)'::text as name,
           'sdr'::text as author_type, count(*)::int as count
    from filtered where kind = 'automation'
    having count(*) > 0
  ),
  rows as (
    select * from human_rows
    union all
    select * from auto_rows
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sellerId', seller_id, 'name', name, 'authorType', author_type, 'count', count) order by count desc)
      from rows), '[]'::jsonb),
    'audience', (select aud from guard)
  );
$function$;

-- ── Tempo médio de atendimento (proxy last_message_at − created_at) ───────────
create or replace function public.service_volume_handle_time(
  p_store_id uuid,
  p_from timestamptz,
  p_to timestamptz,
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
  durs as (
    select extract(epoch from (c.last_message_at - c.created_at)) * 1000 as ms
    from public.conversations c
    cross join guard g
    where g.role in ('owner', 'manager')
      and (g.eff_store is null or c.store_id = g.eff_store)
      and (p_seller_id is null or c.assigned_seller_id = p_seller_id)
      and ('demo-seed' = any(c.tags)) is not true
      and c.created_at >= p_from and c.created_at <= p_to
      and c.last_message_at is not null
  ),
  pos as (select ms from durs where ms > 0)
  select case when (select count(*) from pos) = 0
    then jsonb_build_object('averageMs', 0, 'medianMs', null, 'cycleCount', 0, 'deltaPct', null)
    else jsonb_build_object(
      'averageMs', (select round(avg(ms))::bigint from pos),
      'medianMs', (select round(percentile_cont(0.5) within group (order by ms))::bigint from pos),
      'cycleCount', (select count(*)::int from pos),
      'deltaPct', null
    )
  end;
$function$;

-- ── Grants ───────────────────────────────────────────────────────────────────
grant execute on function
  public.service_volume_novos_atendimentos(uuid, timestamptz, timestamptz, text, uuid),
  public.service_volume_accumulated_chats(uuid, timestamptz, timestamptz, text, uuid),
  public.service_volume_status_distribution(uuid, uuid),
  public.service_volume_message_volume(uuid, timestamptz, timestamptz, text, uuid),
  public.service_volume_messages_by_user(uuid, timestamptz, timestamptz, uuid, text),
  public.service_volume_handle_time(uuid, timestamptz, timestamptz, uuid)
to authenticated;
