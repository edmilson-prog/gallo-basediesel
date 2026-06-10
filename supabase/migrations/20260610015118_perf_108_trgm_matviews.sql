-- PRD-108 — text-search indexes (pg_trgm) + BI materialized views + scheduled refresh.

-- 1) pg_trgm (owner-authorized): indexed ILIKE/similarity for catalog and customer search.
create extension if not exists pg_trgm with schema extensions;

create index if not exists parts_name_trgm_idx
  on public.parts using gin (name extensions.gin_trgm_ops);
create index if not exists parts_oem_codes_text_trgm_idx
  on public.parts using gin (oem_codes_text extensions.gin_trgm_ops);
create index if not exists customers_full_name_trgm_idx
  on public.customers using gin (full_name extensions.gin_trgm_ops);
create index if not exists customers_razao_social_trgm_idx
  on public.customers using gin (razao_social extensions.gin_trgm_ops);
create index if not exists customers_nome_fantasia_trgm_idx
  on public.customers using gin (nome_fantasia extensions.gin_trgm_ops);

-- 2) Partial index for the hot pipeline query: open leads per seller.
create index if not exists leads_open_by_seller_idx
  on public.leads (seller_id, updated_at desc)
  where converted_to_customer_id is null and loss_reason is null;

-- 3) BI materialized views. MVs do not support RLS, so access is revoked from
--    API roles and exposed ONLY through the *_read() RPCs below, which re-apply
--    the store/seller scoping with the same helpers the policies use.
create materialized view public.mv_sales_by_seller_month as
select
  store_id,
  seller_id,
  date_trunc('month', created_at)::date as month,
  count(*) filter (where canceled_at is null)            as orders_count,
  coalesce(sum(total)    filter (where canceled_at is null), 0) as revenue,
  coalesce(sum(discount) filter (where canceled_at is null), 0) as discount_total,
  count(*) filter (where canceled_at is not null)        as canceled_count
from public.orders
group by store_id, seller_id, date_trunc('month', created_at)::date;

create unique index mv_sales_by_seller_month_pk
  on public.mv_sales_by_seller_month (store_id, seller_id, month);

create materialized view public.mv_commissions_by_period as
select
  store_id,
  seller_id,
  period,
  status,
  count(*) as commissions_count,
  coalesce(sum(coalesce(total_commission, value, 0)), 0) as total_amount
from public.commissions
group by store_id, seller_id, period, status;

create unique index mv_commissions_by_period_pk
  on public.mv_commissions_by_period (store_id, seller_id, period, status);

create materialized view public.mv_executive_kpis as
select
  store_id,
  date_trunc('month', created_at)::date as month,
  count(*) filter (where canceled_at is null)            as orders_count,
  coalesce(sum(total) filter (where canceled_at is null), 0) as revenue,
  count(distinct customer_id) filter (where canceled_at is null) as active_customers,
  coalesce(avg(total) filter (where canceled_at is null), 0) as avg_ticket
from public.orders
group by store_id, date_trunc('month', created_at)::date;

create unique index mv_executive_kpis_pk
  on public.mv_executive_kpis (store_id, month);

-- API roles must not read the MVs directly (no RLS on MVs).
revoke all on public.mv_sales_by_seller_month from anon, authenticated;
revoke all on public.mv_commissions_by_period from anon, authenticated;
revoke all on public.mv_executive_kpis from anon, authenticated;

-- 4) Scoped read RPCs (SECURITY DEFINER + the same identity helpers as RLS):
--    staff reads the whole store; a seller reads only their own rows.
create or replace function public.mv_sales_by_seller_month_read()
returns setof public.mv_sales_by_seller_month
language sql stable security definer set search_path = public as $$
  select * from public.mv_sales_by_seller_month
  where store_id = public.current_store_id()
    and (public.is_staff() or seller_id = public.current_seller_id());
$$;

create or replace function public.mv_commissions_by_period_read()
returns setof public.mv_commissions_by_period
language sql stable security definer set search_path = public as $$
  select * from public.mv_commissions_by_period
  where store_id = public.current_store_id()
    and (public.is_staff() or seller_id = public.current_seller_id());
$$;

create or replace function public.mv_executive_kpis_read()
returns setof public.mv_executive_kpis
language sql stable security definer set search_path = public as $$
  select * from public.mv_executive_kpis
  where store_id = public.current_store_id() and public.is_staff();
$$;

revoke execute on function public.mv_sales_by_seller_month_read() from public, anon;
revoke execute on function public.mv_commissions_by_period_read() from public, anon;
revoke execute on function public.mv_executive_kpis_read() from public, anon;
grant execute on function public.mv_sales_by_seller_month_read() to authenticated;
grant execute on function public.mv_commissions_by_period_read() to authenticated;
grant execute on function public.mv_executive_kpis_read() to authenticated;

-- 5) Refresh every 15 minutes (CONCURRENTLY — readers never block).
select cron.schedule(
  'refresh-bi-matviews',
  '*/15 * * * *',
  $$
    refresh materialized view concurrently public.mv_sales_by_seller_month;
    refresh materialized view concurrently public.mv_commissions_by_period;
    refresh materialized view concurrently public.mv_executive_kpis;
  $$
);
