-- Best-effort backfill of past status transitions from audit_logs. Assignment/
-- transfer history and system reopens before this table existed are NOT
-- reconstructable — the timeline is complete only going forward.
insert into public.conversation_activity(
  conversation_id, customer_id, lead_id, store_id, type,
  from_status, to_status, actor_id, actor_kind, created_at)
select
  al.resource_id::uuid, c.customer_id, c.lead_id, c.store_id, 'status',
  (al.before->>'status'), (al.after->>'status'),
  al.actor_id, 'seller', al."timestamp"
from public.audit_logs al
join public.conversations c on c.id = al.resource_id::uuid
where al.resource = 'conversation'
  and al.action in ('conversation.status_change','conversation.resolve','conversation.archive')
  and (al.after ? 'status')
  -- resource_id is text (guard the ::uuid cast); actor_id is already uuid NOT NULL.
  and al.resource_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  and not exists (
    select 1 from public.conversation_activity ca
    where ca.conversation_id = al.resource_id::uuid
      and ca.created_at = al."timestamp"
      and ca.to_status is not distinct from (al.after->>'status')
  );
