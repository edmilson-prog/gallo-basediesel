-- PRD-214 follow-up (part 2) — server-side "Carga por vendedor" + "Heatmap de
-- volume" for the Painel de Atendimento.
--
-- After 20260716183000 moved the headline KPIs to an RPC, these two cards were
-- the LAST consumers of the client-side managerDashboard.snapshot() on the
-- Atendimento tab — and that snapshot still drained every scoped message (both
-- windows) through the raw `/rest/v1/messages` endpoint, paying the per-row
-- `can_access_conversation` RLS check. On a 30-day window in the largest store
-- that's 50k+ rows → past the `authenticated` 8s statement_timeout → 500 on
-- every chunk, killing BOTH cards (seller load doesn't even need messages).
--
-- These two RPCs remove the last raw-messages read from the page:
--
-- service_volume_seller_load — count of OPEN conversations (aguardando /
-- em_andamento / aguardando_cliente) per assigned seller. Current-state
-- number: ignores the time window, mirrors the old client aggregation over
-- snapshot.openConversations (unassigned conversations are ignored — the
-- orphan queue lives in the inbox).
--
-- service_volume_heatmap — inbound customer messages bucketed by
-- (day-of-week × hour). Buckets are computed in America/Sao_Paulo, matching
-- every other service_volume_* RPC (see 20260624170000). NOTE: the old client
-- code bucketed in the VIEWER's browser timezone; for this team (all in
-- Brazil, UTC−3, no DST since 2019) the numbers are identical — verified
-- empirically against the old JS aggregation with TZ=America/Sao_Paulo on
-- real production data. `extract(dow)` is 0=Sunday..6=Saturday, same as JS
-- `Date#getDay()`, so the grid indexes line up 1:1.
--
-- Both are `language plpgsql` — the planner pathology fixed in
-- 20260716180000 showed multi-CTE `language sql` functions can be planned
-- blind to the real argument values.

create or replace function public.service_volume_seller_load(
  p_store_id uuid,
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
  loads as (
    select c.assigned_seller_id as seller_id, count(*)::int as active_count
    from public.conversations c cross join guard g
    where g.role in ('owner', 'manager')
      and (g.eff_store is null or c.store_id = g.eff_store)
      and (p_seller_id is null or c.assigned_seller_id = p_seller_id)
      and ('demo-seed' = any(c.tags)) is not true
      and c.status in ('aguardando', 'em_andamento', 'aguardando_cliente')
      and c.assigned_seller_id is not null
    group by c.assigned_seller_id
  )
  select jsonb_build_object(
    'rows', coalesce(
      (select jsonb_agg(
         jsonb_build_object('sellerId', seller_id, 'activeCount', active_count)
         order by active_count desc, seller_id)
       from loads),
      '[]'::jsonb)
  )
  into result;
  return result;
end;
$function$;

grant execute on function
  public.service_volume_seller_load(uuid, uuid)
to authenticated;

create or replace function public.service_volume_heatmap(
  p_store_id uuid,
  p_from timestamptz,
  p_to timestamptz,
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
  cells as (
    select
      extract(dow from m.sent_at at time zone 'America/Sao_Paulo')::int as day,
      extract(hour from m.sent_at at time zone 'America/Sao_Paulo')::int as hour,
      count(*)::int as n
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    cross join guard g
    where g.role in ('owner', 'manager')
      and (g.eff_store is null or c.store_id = g.eff_store)
      and (p_seller_id is null or c.assigned_seller_id = p_seller_id)
      and ('demo-seed' = any(c.tags)) is not true
      and m.direction = 'in' and m.author_type = 'customer'
      and m.sent_at >= p_from and m.sent_at <= p_to
    group by 1, 2
  )
  select jsonb_build_object(
    'rows', coalesce(
      (select jsonb_agg(
         jsonb_build_object('day', day, 'hour', hour, 'count', n)
         order by day, hour)
       from cells),
      '[]'::jsonb),
    'totalMessages', coalesce((select sum(n)::int from cells), 0)
  )
  into result;
  return result;
end;
$function$;

grant execute on function
  public.service_volume_heatmap(uuid, timestamptz, timestamptz, uuid)
to authenticated;
