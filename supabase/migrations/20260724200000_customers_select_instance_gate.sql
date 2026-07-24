-- customers_select leaked customers across the instance gate.
--
-- The "2 portões" model (v0.110.0 Turnstile) makes the WhatsApp instance the
-- master gate for Atendimento: lose access to the number and you lose the
-- conversations assigned to you on it. `can_access_conversation` enforces that.
-- `seller_handles_customer` did NOT — it matched on `assigned_seller_id` alone —
-- so a seller who no longer has access to an instance kept seeing the CUSTOMER
-- RECORDS behind conversations assigned to them on that instance, even though
-- the conversations themselves were correctly hidden.
--
-- Measured on production before this migration: seller "lucas" saw 11 customers,
-- 2 of which were owned by another seller with no conversation he could access.
-- This is what the rls-regression suite has been failing on since 2026-07-17.
--
-- Two changes, one behaviour:
--
-- 1. `seller_accessible_customer_ids()` becomes the single source of truth,
--    SET-RETURNING on purpose. A boolean helper called from a policy runs once
--    PER ROW; naively adding the instance filter inside the old helper measured
--    569 ms against 100 ms (5.7x worse) — the same per-row RLS pathology that
--    forced the 20260619170000 hotfix. As a set, the planner hashes it once:
--    the same query measured 29 ms, i.e. 3.4x FASTER than the leaking version.
--
-- 2. `seller_handles_customer` is kept (other code and docs reference it) but
--    now delegates to that set, so the two can never drift apart again.
--
-- Scope note: the set covers the ASSIGNED branch only, exactly like the helper
-- it replaces. Conversation participants/collaborators still do not gain access
-- to the customer record — unchanged, pre-existing behaviour, deliberately not
-- widened here.

create or replace function public.seller_accessible_customer_ids()
returns setof uuid
language sql
stable
security definer
set search_path to ''
as $$
  select distinct cv.customer_id
    from public.conversations cv
   where cv.customer_id is not null
     and cv.assigned_seller_id = public.current_seller_id()
     and (
       cv.whatsapp_account_id is null
       or cv.whatsapp_account_id in (select public.current_seller_accessible_account_ids())
     );
$$;

revoke all on function public.seller_accessible_customer_ids() from public, anon;
grant execute on function public.seller_accessible_customer_ids() to authenticated;

-- Kept for compatibility; now instance-aware through the shared set.
create or replace function public.seller_handles_customer(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select p_customer_id in (select public.seller_accessible_customer_ids());
$$;

drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers
  for select
  to authenticated
  using (
    store_id = (select public.current_store_id())
    and (
      (select public.is_staff())
      or seller_id = (select public.current_seller_id())
      or id in (select public.seller_accessible_customer_ids())
    )
  );
