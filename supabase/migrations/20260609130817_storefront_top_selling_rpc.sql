-- PRD-110 / Storefront anon wiring.
-- Public "best-sellers" ranking for the storefront without exposing the private
-- `orders` table to anon. SECURITY DEFINER reads orders/order_items as the owner
-- (bypassing RLS) but returns ONLY ranked part ids — no order data leaks.
-- Mirrors the previous client-side ranking: paid/partial orders, 90-day window,
-- summed quantity per part. Consistent with the storefront_config RPC pattern.
create or replace function public.storefront_top_selling(
  p_store_id uuid,
  p_limit integer default 2000
)
returns table (part_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select oi.part_id
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.store_id = p_store_id
    and o.payment_status in ('pago', 'parcial')
    and coalesce(o.paid_at, o.updated_at, o.created_at) >= (now() - interval '90 days')
  group by oi.part_id
  order by sum(oi.quantity) desc
  limit greatest(1, least(coalesce(p_limit, 2000), 5000))
$$;

revoke all on function public.storefront_top_selling(uuid, integer) from public;
grant execute on function public.storefront_top_selling(uuid, integer) to anon, authenticated;
