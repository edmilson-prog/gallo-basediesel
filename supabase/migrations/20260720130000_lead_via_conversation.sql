-- =============================================================================
-- Lead fiche via conversation (spec: docs/superpowers/specs/2026-07-18-lead-fiche-lateral.md)
--
-- Since Funnel Frente 3 most conversations anchor on a LEAD (customer_id null):
-- the fiche panel needs the lead, but the per-owner `leads_select` RLS hides an
-- OWNERLESS lead from non-staff — exactly the attendant profile operating the
-- pool. Mirror of `conversation_customer` (20260620120000, "2 portões" model):
-- gate ONCE by can_access_conversation, return 0/1 row, touch NO leads policy.
--
-- Join casts `l.id::text = c.lead_id` (conversations.lead_id is TEXT) — the
-- established pattern of conversation_contacts / idle_conversation_alerts;
-- never casts lead_id to uuid, so a malformed value yields 0 rows instead of
-- an exception.
-- =============================================================================

create or replace function public.lead_via_conversation(conv uuid)
returns setof public.leads
language sql
stable
security definer
set search_path to ''
as $function$
  select l.*
  from public.conversations c
  join public.leads l on l.id::text = c.lead_id
  where c.id = conv
    and public.can_access_conversation(conv);
$function$;

revoke all on function public.lead_via_conversation(uuid) from public, anon;
grant execute on function public.lead_via_conversation(uuid) to authenticated;
