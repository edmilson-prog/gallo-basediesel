-- PRD-117 — last inbound timestamp helper (24h session window UX).
-- Frontend sugar over the PRD-115 boolean pre-check: returns WHEN the customer
-- last wrote so the UI can render a live countdown ("fecha em 8h 27min").
-- SECURITY INVOKER on purpose: RLS on public.messages applies, so a seller can
-- only resolve the timestamp of conversations they are allowed to read
-- (invisible conversation => null => UI treats the window as closed).
create or replace function public.last_inbound_at(p_conversation_id uuid)
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select max(sent_at)
  from public.messages
  where conversation_id = p_conversation_id
    and direction = 'in';
$$;

comment on function public.last_inbound_at(uuid) is
  'PRD-117: timestamp of the customer''s last inbound message — feeds the 24h session-window countdown. SECURITY INVOKER (RLS applies).';

revoke execute on function public.last_inbound_at(uuid) from public, anon;
grant execute on function public.last_inbound_at(uuid) to authenticated;
