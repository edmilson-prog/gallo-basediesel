-- Backfill for conversations born before the trigger existed.
--
-- Synthesises ONLY what real columns support: the opening (created_at) and,
-- where closed_at exists, the closing. No owner event — we know who owns the
-- conversation but not when they took it, and dating that would be invention.
--
-- to_status on the synthesised opening is NULL on purpose: the real trigger
-- records the status a conversation was born with, and for these rows that
-- value does not exist.
--
-- Idempotent: only touches conversations with no event at all.
-- Rollback:
--   delete from public.conversation_activity
--   where actor_kind = 'system' and actor_id is null
--     and created_at < timestamptz '2026-07-04 01:43:17+00';

insert into public.conversation_activity(
  conversation_id, customer_id, lead_id, store_id, type,
  from_status, to_status, actor_id, actor_kind, created_at)
select c.id, c.customer_id, c.lead_id, c.store_id, 'created',
       null, null, null, 'system', c.created_at
from public.conversations c
where c.created_at < timestamptz '2026-07-04 01:43:17+00'
  and not exists (select 1 from public.conversation_activity a where a.conversation_id = c.id);

insert into public.conversation_activity(
  conversation_id, customer_id, lead_id, store_id, type,
  from_status, to_status, actor_id, actor_kind, created_at)
select c.id, c.customer_id, c.lead_id, c.store_id, 'status',
       null, c.status, null, 'system', c.closed_at
from public.conversations c
where c.created_at < timestamptz '2026-07-04 01:43:17+00'
  and c.closed_at is not null
  and not exists (
    select 1 from public.conversation_activity a
    where a.conversation_id = c.id and a.type = 'status'
  );
