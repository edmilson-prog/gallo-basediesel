-- Carga por vendedor v2 — the card now counts only OPEN conversations with
-- activity (last_message_at) inside the tab's selected window, instead of the
-- whole accumulated backlog (spec:
-- docs/superpowers/specs/2026-07-16-seller-load-active-window-design.md).
--
-- With real data (2026-07-16) the old all-time count crowned a seller whose
-- book was 75% stale (100 open, 25 active in 7 days) while the genuinely busy
-- sellers ranked below him — the number measured accumulated history, not
-- workload.
--
-- p_from/p_to are optional (null = no cut) so the already-deployed frontend
-- keeps working between migration apply and deploy. The 2-arg function MUST
-- be dropped first: re-creating with a different arity would register an
-- OVERLOAD and PostgREST named calls become ambiguous.

drop function if exists public.service_volume_seller_load(uuid, uuid);

create or replace function public.service_volume_seller_load(
  p_store_id uuid,
  p_seller_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null
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
      and (p_from is null or c.last_message_at >= p_from)
      and (p_to is null or c.last_message_at <= p_to)
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
  public.service_volume_seller_load(uuid, uuid, timestamptz, timestamptz)
to authenticated;
