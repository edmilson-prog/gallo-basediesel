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
-- Idempotent: both inserts are driven from ONE orphan set (conversations with
-- NO event at all), captured once in the `orphans` CTE. Every statement in a
-- WITH clause shares the snapshot taken before any of them runs, so the
-- opening insert's new rows can never hide conversations from the closing
-- insert — and on a re-run `orphans` is empty, so both inserts affect 0 rows.
-- Rollback:
--   delete from public.conversation_activity
--   where actor_kind = 'system' and actor_id is null
--     and type in ('created','status') and from_seller_id is null and to_seller_id is null
--     and created_at < timestamptz '2026-07-04 01:43:17+00';

with orphans as (
  select c.id, c.customer_id, c.lead_id, c.store_id, c.status, c.created_at, c.closed_at
  from public.conversations c
  where c.created_at < timestamptz '2026-07-04 01:43:17+00'
    and not exists (select 1 from public.conversation_activity a where a.conversation_id = c.id)
),
opened as (
  insert into public.conversation_activity(
    conversation_id, customer_id, lead_id, store_id, type,
    from_status, to_status, actor_id, actor_kind, created_at)
  select o.id, o.customer_id, o.lead_id, o.store_id, 'created',
         null, null, null, 'system', o.created_at
  from orphans o
  returning 1
)
insert into public.conversation_activity(
  conversation_id, customer_id, lead_id, store_id, type,
  from_status, to_status, actor_id, actor_kind, created_at)
select o.id, o.customer_id, o.lead_id, o.store_id, 'status',
       null, o.status, null, 'system', o.closed_at
from orphans o
where o.closed_at is not null;
