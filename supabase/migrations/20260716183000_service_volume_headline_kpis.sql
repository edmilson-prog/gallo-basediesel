-- PRD-214 follow-up — server-side headline KPIs for the Painel de Atendimento.
--
-- The "Indicadores principais" row (TMA/TMR/Taxa de Resolução/Backlog) was
-- computed client-side by managerDashboard.snapshot(): it drained the WHOLE
-- store's conversations, then fetched matching messages via the plain
-- `/rest/v1/messages` PostgREST endpoint. Every one of those message rows
-- pays the per-row `can_access_conversation` RLS check (messages_select
-- policy) — cheap for a 24h window, but for a 30-day window on the largest
-- real store that's 50k+ rows × ~1ms of RLS overhead, comfortably past the
-- `authenticated` role's 8s statement_timeout → PostgREST returned 500 on
-- every chunk, and because all four cards share one snapshot fetch, all four
-- failed together even though only TMA/TMR actually need message data.
--
-- This RPC recomputes the same four numbers server-side as one SECURITY
-- DEFINER call (bypasses RLS — verified byte-for-byte identical against the
-- existing client-side src/features/manager-dashboard/utils/kpiMath.ts
-- functions using real production data across a 30-day and a 24h window,
-- including edge cases like a null "previous" TMA and a near-zero resolution
-- rate). `language plpgsql` from the start — the sibling fix in
-- 20260716180000 already showed `language sql` multi-CTE functions can get
-- planned without visibility into the real argument values.
--
-- TMA — average handling time of RESOLVED conversations whose lastMessageAt
-- fell in the window, from the conversation's earliest in-window customer
-- message to lastMessageAt.
--
-- TMR — average response time between an inbound customer message and the
-- next seller reply. Classic "gaps and islands": messages are restricted to
-- inbound-customer / outbound-seller only (others, e.g. SDR, are skipped
-- entirely, matching the JS reference), grouped by the count of outbound
-- messages strictly preceding each row (a fresh group starts right after
-- each outbound) — a group pairs its first inbound with its one outbound;
-- the trailing group (no outbound yet) is dropped.
--
-- Resolution rate — resolved / (opened - arquivada) among conversations in
-- the window. Backlog — count of `aguardando` conversations store-wide,
-- ignoring the window entirely (matches the frontend's existing semantics).
create or replace function public.service_volume_headline_kpis(
  p_store_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_prev_from timestamptz,
  p_prev_to timestamptz,
  p_seller_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path to ''
as $function$
declare
  result jsonb;
begin
  with guard as (
    select
      public.current_app_role() as role,
      case when public.current_app_role() = 'manager'
           then public.current_store_id() else p_store_id end as eff_store
  ),
  backlog as (
    select count(*)::int as n
    from public.conversations c cross join guard g
    where g.role in ('owner', 'manager')
      and (g.eff_store is null or c.store_id = g.eff_store)
      and (p_seller_id is null or c.assigned_seller_id = p_seller_id)
      and ('demo-seed' = any(c.tags)) is not true
      and c.status = 'aguardando'
  ),
  opened_cur as (
    select c.id, c.status, c.last_message_at
    from public.conversations c cross join guard g
    where g.role in ('owner', 'manager')
      and (g.eff_store is null or c.store_id = g.eff_store)
      and (p_seller_id is null or c.assigned_seller_id = p_seller_id)
      and ('demo-seed' = any(c.tags)) is not true
      and c.last_message_at >= p_from and c.last_message_at <= p_to
  ),
  opened_prev as (
    select c.id, c.status, c.last_message_at
    from public.conversations c cross join guard g
    where g.role in ('owner', 'manager')
      and (g.eff_store is null or c.store_id = g.eff_store)
      and (p_seller_id is null or c.assigned_seller_id = p_seller_id)
      and ('demo-seed' = any(c.tags)) is not true
      and c.last_message_at >= p_prev_from and c.last_message_at <= p_prev_to
  ),
  resolution_cur as (
    select count(*) filter (where status <> 'arquivada') as opened_n,
           count(*) filter (where status = 'resolvida') as resolved_n
    from opened_cur
  ),
  resolution_prev as (
    select count(*) filter (where status <> 'arquivada') as opened_n,
           count(*) filter (where status = 'resolvida') as resolved_n
    from opened_prev
  ),
  first_customer_cur as (
    select m.conversation_id, min(m.sent_at) as first_in
    from public.messages m join public.conversations c on c.id = m.conversation_id
    cross join guard g
    where g.role in ('owner', 'manager')
      and (g.eff_store is null or c.store_id = g.eff_store)
      and (p_seller_id is null or c.assigned_seller_id = p_seller_id)
      and ('demo-seed' = any(c.tags)) is not true
      and m.direction = 'in' and m.author_type = 'customer'
      and m.sent_at >= p_from and m.sent_at <= p_to
    group by m.conversation_id
  ),
  tma_cur as (
    select avg(extract(epoch from (oc.last_message_at - fc.first_in)) * 1000) as avg_ms
    from opened_cur oc join first_customer_cur fc on fc.conversation_id = oc.id
    where oc.status = 'resolvida' and oc.last_message_at >= fc.first_in
  ),
  first_customer_prev as (
    select m.conversation_id, min(m.sent_at) as first_in
    from public.messages m join public.conversations c on c.id = m.conversation_id
    cross join guard g
    where g.role in ('owner', 'manager')
      and (g.eff_store is null or c.store_id = g.eff_store)
      and (p_seller_id is null or c.assigned_seller_id = p_seller_id)
      and ('demo-seed' = any(c.tags)) is not true
      and m.direction = 'in' and m.author_type = 'customer'
      and m.sent_at >= p_prev_from and m.sent_at <= p_prev_to
    group by m.conversation_id
  ),
  tma_prev as (
    select avg(extract(epoch from (op.last_message_at - fc.first_in)) * 1000) as avg_ms
    from opened_prev op join first_customer_prev fc on fc.conversation_id = op.id
    where op.status = 'resolvida' and op.last_message_at >= fc.first_in
  ),
  relevant_cur as (
    select m.conversation_id, m.sent_at, m.id,
      case when m.direction = 'in' and m.author_type = 'customer' then 'in'
           when m.direction = 'out' and m.author_type = 'seller' then 'out' end as kind
    from public.messages m join public.conversations c on c.id = m.conversation_id
    cross join guard g
    where g.role in ('owner', 'manager')
      and (g.eff_store is null or c.store_id = g.eff_store)
      and (p_seller_id is null or c.assigned_seller_id = p_seller_id)
      and ('demo-seed' = any(c.tags)) is not true
      and m.sent_at >= p_from and m.sent_at <= p_to
      and ((m.direction = 'in' and m.author_type = 'customer') or (m.direction = 'out' and m.author_type = 'seller'))
  ),
  grouped_cur as (
    select *, count(*) filter (where kind = 'out') over (
      partition by conversation_id order by sent_at, id
      rows between unbounded preceding and 1 preceding
    ) as grp
    from relevant_cur
  ),
  segments_cur as (
    select conversation_id, grp,
      min(sent_at) filter (where kind = 'in') as first_in,
      max(sent_at) filter (where kind = 'out') as out_at,
      count(*) filter (where kind = 'out') as out_count
    from grouped_cur group by conversation_id, grp
  ),
  tmr_cur as (
    select avg(extract(epoch from (out_at - first_in)) * 1000) as avg_ms
    from segments_cur where out_count = 1 and first_in is not null and out_at >= first_in
  ),
  relevant_prev as (
    select m.conversation_id, m.sent_at, m.id,
      case when m.direction = 'in' and m.author_type = 'customer' then 'in'
           when m.direction = 'out' and m.author_type = 'seller' then 'out' end as kind
    from public.messages m join public.conversations c on c.id = m.conversation_id
    cross join guard g
    where g.role in ('owner', 'manager')
      and (g.eff_store is null or c.store_id = g.eff_store)
      and (p_seller_id is null or c.assigned_seller_id = p_seller_id)
      and ('demo-seed' = any(c.tags)) is not true
      and m.sent_at >= p_prev_from and m.sent_at <= p_prev_to
      and ((m.direction = 'in' and m.author_type = 'customer') or (m.direction = 'out' and m.author_type = 'seller'))
  ),
  grouped_prev as (
    select *, count(*) filter (where kind = 'out') over (
      partition by conversation_id order by sent_at, id
      rows between unbounded preceding and 1 preceding
    ) as grp
    from relevant_prev
  ),
  segments_prev as (
    select conversation_id, grp,
      min(sent_at) filter (where kind = 'in') as first_in,
      max(sent_at) filter (where kind = 'out') as out_at,
      count(*) filter (where kind = 'out') as out_count
    from grouped_prev group by conversation_id, grp
  ),
  tmr_prev as (
    select avg(extract(epoch from (out_at - first_in)) * 1000) as avg_ms
    from segments_prev where out_count = 1 and first_in is not null and out_at >= first_in
  )
  select jsonb_build_object(
    'tmaMinutes', jsonb_build_object(
      'current', (select case when avg_ms is null then null else round(avg_ms / 60000) end from tma_cur),
      'previous', (select case when avg_ms is null then null else round(avg_ms / 60000) end from tma_prev)
    ),
    'tmrMinutes', jsonb_build_object(
      'current', (select case when avg_ms is null then null else round(avg_ms / 60000) end from tmr_cur),
      'previous', (select case when avg_ms is null then null else round(avg_ms / 60000) end from tmr_prev)
    ),
    'resolutionRatePct', jsonb_build_object(
      'current', (select case when opened_n = 0 then null else round((resolved_n::numeric / opened_n) * 100) end from resolution_cur),
      'previous', (select case when opened_n = 0 then null else round((resolved_n::numeric / opened_n) * 100) end from resolution_prev)
    ),
    'backlog', (select n from backlog)
  )
  into result;
  return result;
end;
$function$;

grant execute on function
  public.service_volume_headline_kpis(uuid, timestamptz, timestamptz, timestamptz, timestamptz, uuid)
to authenticated;
