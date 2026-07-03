-- Inbox wait-time counter: track when a conversation entered the manual queue.
-- The frontend only reads queued_at; a trigger keeps it in sync, mirroring the
-- app's isQueuedConversation rule. Order matters: backfill BEFORE the trigger
-- exists so the one-time UPDATE is not intercepted and reverted.

-- 1. Column
alter table public.conversations
  add column if not exists queued_at timestamptz;

-- 2. One-time backfill for conversations currently in the queue.
update public.conversations
set queued_at = coalesce(last_message_at, created_at)
where status = 'aguardando'
  and assigned_seller_id is null
  and coalesce(is_sdr_active, false) = false
  and queued_at is null;

-- 3. Trigger function: set on queue entry, clear on exit, keep while queued.
create or replace function public.set_conversation_queued_at()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  new_q boolean := (new.status = 'aguardando'
                    and new.assigned_seller_id is null
                    and coalesce(new.is_sdr_active, false) = false);
  old_q boolean;
begin
  if tg_op = 'INSERT' then
    new.queued_at := case when new_q then now() else null end;
    return new;
  end if;

  old_q := (old.status = 'aguardando'
            and old.assigned_seller_id is null
            and coalesce(old.is_sdr_active, false) = false);

  if new_q and not old_q then
    new.queued_at := now();      -- entered (or re-entered) the queue
  elsif not new_q then
    new.queued_at := null;       -- left the queue
  end if;
  -- stayed queued (e.g. another inbound message) -> keep new.queued_at (== old)

  return new;
end;
$$;

-- 4. Trigger
drop trigger if exists trg_set_conversation_queued_at on public.conversations;
create trigger trg_set_conversation_queued_at
before insert or update on public.conversations
for each row execute function public.set_conversation_queued_at();
