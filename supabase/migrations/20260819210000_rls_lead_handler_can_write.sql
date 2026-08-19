-- Fix: the attendant assigned to a conversation could READ the anchored lead but
-- not WRITE to it, so every inline edit of the Atendimento lateral panel answered
-- HTTP 406 ("Não foi possível salvar a alteração.") for a non-staff seller whose
-- carteira does not own the lead.
--
-- Measured in production (JWT of a `seller_internal` who is the assigned attendant
-- of a lead owned by another seller): `select` returns 1 row, `update` affects 0.
-- Zero rows plus PostgREST `.single()` (src/providers/data/impl/supabase/leads.ts,
-- `update`) is what surfaces as 406 — a permission denial that never raises 42501,
-- which is why the UI could only offer a generic failure.
--
-- The read half of this rule landed in 20260614183000, deliberately read-only at
-- the time. The product rule has since moved on and the write half was never
-- brought along:
--   * 20260723190000 `convert_lead_mark` authorizes exactly
--     `is_staff() or seller_id = current_seller_id() or seller_handles_lead()`;
--   * the panel gates its edits on `isAssignee`
--     (src/features/leads/components/panel/LeadPanelBody.tsx) precisely so there is
--     no second access rule to keep in sync with the RLS.
-- The result was a deadlock: the attendant may CONVERT the lead into a customer,
-- but may not fill in the CPF/CNPJ that the conversion checklist requires.
--
-- Two policies, one asymmetry. `lead_funnel_entries` carries the identical gap and
-- breaks the identical panel: the "Funis" block calls moveEntry/updateEntry
-- (src/features/funnels/hooks/useEntryMutations.ts), which end in the same
-- `.select().single()` and therefore the same 406.
--
-- Both clauses are additive — they can only grant, never restrict — and the helper
-- is index-covered by `idx_conversations_lead_assigned (lead_id, assigned_seller_id)`.
-- Branch ORDER is load-bearing: the two cheap checks short-circuit first, so staff
-- and the owner never pay for the EXISTS.

alter policy leads_update on public.leads
  using (
    store_id = (select public.current_store_id())
    and (
      (select public.is_staff())
      or seller_id = (select public.current_seller_id())
      or public.seller_handles_lead(id)
    )
  )
  with check (
    store_id = (select public.current_store_id())
    and (
      (select public.is_staff())
      or seller_id = (select public.current_seller_id())
      or public.seller_handles_lead(id)
    )
  );

-- The funnel half needs no ownership guard of its own: `guard_lead_funnel_entry_update`
-- (BEFORE UPDATE, security definer, 20260723121000) already re-derives store_id and
-- seller_id from the lead on every update and makes lead_id/funnel_id immutable, so
-- the columns this policy really authorizes are stage_id and estimated_value.
alter policy lead_funnel_entries_update on public.lead_funnel_entries
  using (
    store_id = (select public.current_store_id())
    and (
      (select public.is_staff())
      or seller_id = (select public.current_seller_id())
      or public.seller_handles_lead(lead_id)
    )
  )
  with check (
    store_id = (select public.current_store_id())
    and (
      (select public.is_staff())
      or seller_id = (select public.current_seller_id())
      or public.seller_handles_lead(lead_id)
    )
  );

-- Carteira ownership stays exactly where 20260614183000 left it: handling a
-- conversation grants access to the lead's DATA, never to its ownership and never
-- to its conversion record.
--
-- Without this guard the new clause would widen more than intended. `with check`
-- cannot see the OLD row, and `seller_handles_lead(id)` depends on
-- conversations.assigned_seller_id — not on leads.seller_id — so it stays true for
-- ANY new value: an attendant could rewrite `leads.seller_id` to themselves, to a
-- third seller, or to null and still satisfy the policy, silently moving the lead
-- between carteiras (and, through `leads_sync_funnel_entries`, its funnel entries
-- with it). Today no non-staff seller can change that column at all: `with check`
-- forces the resulting owner to be themselves and `using` forces the previous owner
-- to be themselves, so the only write that passes is a no-op. The trigger restates
-- that invariant where the policy can no longer express it.
--
-- `converted_to_customer_id` is guarded on the same grounds, but only for the branch
-- this migration opens — staff and the lead's own owner keep the direct path they
-- already had, so the change stays strictly additive. Writing that column directly
-- skips every validation in `convert_lead_mark` (same-store check, "customer not
-- found in store", the PRD-217 RN-05 ad_touches provenance stamp) while still firing
-- the destructive `leads_reanchor_converted` trigger. The UI never takes that path
-- anyway: conversion goes exclusively through the RPC (`markConverted`).
--
-- Scoped to end-user sessions on purpose. Edge Functions connect as `service_role`
-- and legitimately stamp the owner — `waha-webhook` assigns `seller_id` on the first
-- reply, and imports land leads owner-less for the rotation to claim later. Those
-- sessions, and `security definer` functions such as `convert_lead_mark`, run under
-- a different `current_user` and are exempt.
create or replace function public.guard_lead_owner_change()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if new.seller_id is distinct from old.seller_id and not public.is_staff() then
    raise exception 'not authorized to change the owner of lead %', old.id
      using errcode = '42501';
  end if;

  if new.converted_to_customer_id is distinct from old.converted_to_customer_id
     and not public.is_staff()
     and old.seller_id is distinct from (select public.current_seller_id()) then
    raise exception 'lead % must be converted through convert_lead_mark', old.id
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- `before update of <cols>` only fires when the column appears in the SET list, and
-- `leadPatchToRow` only includes them when the caller explicitly patches them — so
-- an ordinary panel edit never reaches this trigger, and `is distinct from` makes it
-- a no-op even when it does.
drop trigger if exists leads_guard_owner_change on public.leads;
create trigger leads_guard_owner_change
  before update of seller_id, converted_to_customer_id on public.leads
  for each row
  execute function public.guard_lead_owner_change();
