-- Fix: service_volume_message_volume timed out (500) for wide windows.
--
-- Root cause: as a `language sql` function with a multi-CTE body, Postgres
-- cannot inline it, so it plans the query WITHOUT visibility into the actual
-- p_from/p_to argument values. For a 30-day window on the largest real store
-- (GALLO Matriz, ~174k messages), that produced a plan reading ~204k buffers
-- (~9.5-9.8s) instead of the ~42-44k buffers (~0.2s) an equivalent query with
-- literal values achieves — well past the `authenticated` role's 8s
-- statement_timeout, so PostgREST returned 500 on every call.
--
-- Fix: rewrite as `language plpgsql` with the query inlined directly (no
-- dynamic SQL/EXECUTE — that reintroduces reparse overhead without fixing the
-- plan). plpgsql's executor plans each embedded query with the actual bound
-- parameter values, avoiding the pathological plan. Verified byte-for-byte
-- identical output against the previous implementation before applying.
create or replace function public.service_volume_message_volume(
  p_store_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_granularity text default 'day',
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
    'totalSent', coalesce((select sum(sent) from series), 0)::int,
    'totalReceived', coalesce((select sum(received) from series), 0)::int
  )
  into result;
  return result;
end;
$function$;

grant execute on function
  public.service_volume_message_volume(uuid, timestamptz, timestamptz, text, uuid)
to authenticated;
