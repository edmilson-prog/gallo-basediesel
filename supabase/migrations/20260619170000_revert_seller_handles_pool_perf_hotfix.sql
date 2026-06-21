-- HOTFIX (revert of 20260619103000): that migration made seller_handles_customer /
-- seller_handles_lead call public.can_access_conversation(cv.id) per row so a non-staff
-- seller could read the contact of any POOL conversation they can access.
--
-- It was correct but NOT scalable: customers_select / leads_select short-circuit on
-- is_staff() / ownership and then call the helper for every remaining row. On a bulk
-- customers scan (the inbox issues customers list with limit 500/1000) the helper ran
-- can_access_conversation — which itself re-runs current_seller_accessible_account_ids()
-- and per-conversation lookups — for ~hundreds of customers. Under the inbox's
-- concurrent query burst this saturated the DB and tripped statement_timeout (8s),
-- surfacing as 500s on /customers, /messages and /customer_notes for non-staff users.
--
-- Restore the fast, index-backed assigned-only predicate (the pre-#120 definition from
-- 20260614183000). Reads of the linked customer/lead are again granted only for
-- conversations ASSIGNED to the caller (plus carteira ownership and is_staff()).
--
-- Known trade-off (re-opened): the contact of a POOL (unassigned) conversation is
-- unreadable again for non-staff sellers → "Lead anônimo" on the inbox list/ficha for
-- pool conversations. A performant pool-aware replacement (avoiding a per-row
-- can_access_conversation call — e.g. a set-based / indexed predicate proven under
-- load) will be engineered separately before re-enabling pool contact reads.

create or replace function public.seller_handles_customer(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.conversations cv
    where cv.customer_id = p_customer_id
      and cv.assigned_seller_id = public.current_seller_id()
  );
$$;

create or replace function public.seller_handles_lead(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.conversations cv
    where cv.lead_id = p_lead_id::text
      and cv.assigned_seller_id = public.current_seller_id()
  );
$$;
