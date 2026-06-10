-- PRD-115 — 24h window pre-check helper (Meta free-text rule).
-- Called by the whatsapp-send Edge Function via service_role BEFORE trying a
-- free-text send on a meta account; PRD-117 builds the full session UX on it.
-- The PRD names crm.is_within_24h_window — repo uses schema public.
create or replace function public.is_within_24h_window(p_conversation_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.messages
    where conversation_id = p_conversation_id
      and direction = 'in'
      and sent_at > now() - interval '24 hours'
  );
$$;

comment on function public.is_within_24h_window(uuid) is
  'PRD-115: true when the customer wrote in the last 24h (Meta free-text window). service_role only.';

-- Server-side helper: not callable from app roles (fail closed).
revoke execute on function public.is_within_24h_window(uuid) from public, anon, authenticated;
