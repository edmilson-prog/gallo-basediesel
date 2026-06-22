-- Fix: a non-staff seller (atendente) could SEE a pool conversation in the Inbox
-- but could NOT read the linked customer/lead, so the contact rendered as
-- "Lead anônimo" with no phone number for essentially every pool conversation.
--
-- Root cause — an asymmetry between two RLS decisions that should agree:
--   * public.can_access_conversation(id) grants VISIBILITY of a conversation for
--     assigned seller OR participant OR the POOL (unassigned conversations on an
--     instance the seller can access, or unassigned non-WhatsApp conversations).
--   * public.seller_handles_customer/lead(id) — the clause that lets customers_select
--     / leads_select READ the linked record — only matched
--     `cv.assigned_seller_id = current_seller_id()` (ASSIGNED conversations only).
--
-- So the seller saw the conversation (and its messages, already governed by
-- can_access_conversation) but the customer/lead row was blocked by RLS, and the
-- frontend's silent `.catch(() => null)` turned that 403 into "Lead anônimo".
--
-- This realigns the read of the linked customer/lead to the SAME boundary that
-- already governs conversation/message access — public.can_access_conversation —
-- making it the single source of truth. The change is strictly ADDITIVE: the new
-- predicate is a superset of the previous one (assigned-to-me is one of the OR
-- branches inside can_access_conversation), so it can only GRANT access, never
-- restrict it, and never expands beyond the boundary the seller already has on the
-- conversation itself. Owner/Gestor are unaffected (is_staff() short-circuits first).
--
-- The helpers stay SECURITY DEFINER so their internal lookup bypasses conversations
-- RLS without recursion; can_access_conversation is likewise SECURITY DEFINER and
-- does not read customers/leads, so there is no policy cycle.

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
      and public.can_access_conversation(cv.id)
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
      and public.can_access_conversation(cv.id)
  );
$$;

-- Re-assert grants (idempotent; CREATE OR REPLACE preserves them, but keep explicit
-- for parity with the original migration and a clean re-run from scratch).
revoke all on function public.seller_handles_customer(uuid) from public;
revoke all on function public.seller_handles_lead(uuid) from public;
grant execute on function public.seller_handles_customer(uuid) to authenticated;
grant execute on function public.seller_handles_lead(uuid) to authenticated;

-- No new indexes needed: the EXISTS filters public.conversations by customer_id /
-- lead_id, and migration 20260614183000 already created the composite indexes
-- idx_conversations_customer_assigned (customer_id, assigned_seller_id) and
-- idx_conversations_lead_assigned (lead_id, assigned_seller_id), whose leading
-- column already serves these lookups.
