-- Fix: a seller assigned to a conversation could not READ the linked customer/lead
-- when that record still belonged to another seller's carteira (per-seller RLS).
-- Symptom: a transferred conversation ("transferir atendimento") showed an empty fiche
-- ("Cliente não encontrado") and the contact rendered as "Lead anônimo" for the
-- receiving seller, because customers_select / leads_select scoped reads to
-- is_staff() OR seller_id = current_seller_id() only.
--
-- This grants READ-ONLY visibility of the customer/lead linked to a conversation
-- assigned to the current seller, WITHOUT transferring carteira ownership
-- (customers.seller_id / leads.seller_id stay with the original owner). The change is
-- additive: the new clause can only GRANT access, never restrict existing access.
--
-- The helpers are SECURITY DEFINER so their internal lookup bypasses conversations RLS;
-- this is safe because they constrain strictly to the caller's own seller via
-- public.current_seller_id(), so a seller can only ever match their OWN assignments.

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

-- NOTE: conversations.lead_id is TEXT (stores the uuid as a string), unlike
-- conversations.customer_id which is uuid — so cast the uuid param to text.
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

revoke all on function public.seller_handles_customer(uuid) from public;
revoke all on function public.seller_handles_lead(uuid) from public;
grant execute on function public.seller_handles_customer(uuid) to authenticated;
grant execute on function public.seller_handles_lead(uuid) to authenticated;

-- Supporting indexes for the per-row EXISTS lookups (idempotent).
create index if not exists idx_conversations_customer_assigned
  on public.conversations (customer_id, assigned_seller_id);
create index if not exists idx_conversations_lead_assigned
  on public.conversations (lead_id, assigned_seller_id);

-- Extend the SELECT policies. The cheap checks short-circuit first, so the EXISTS
-- helper only runs for rows that are neither store-staff-visible nor owned.
alter policy customers_select on public.customers
  using (
    store_id = (select public.current_store_id())
    and (
      (select public.is_staff())
      or seller_id = (select public.current_seller_id())
      or public.seller_handles_customer(id)
    )
  );

alter policy leads_select on public.leads
  using (
    store_id = (select public.current_store_id())
    and (
      (select public.is_staff())
      or seller_id = (select public.current_seller_id())
      or public.seller_handles_lead(id)
    )
  );
