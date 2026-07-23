-- Echo continuity window (decision 2026-07-23 —
-- docs/dev/conversation-split-echo-after-close.md §7 item 3): conversations
-- gain a `closed_at` column maintained by trigger, so the waha-webhook echo
-- path can cheaply ask "was this contact's conversation closed less than N
-- hours ago?" and APPEND to it (without reopening) instead of splitting the
-- thread. The trigger makes maintenance universal — every writer that flips
-- `status` (close RPC, archive, webhook reopen, app status dropdown, data
-- migrations) keeps the column correct without remembering it exists.

alter table public.conversations add column if not exists closed_at timestamptz;

create or replace function public.conversations_maintain_closed_at()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if tg_op = 'INSERT' then
    -- History importers insert conversations already closed — stamp them so
    -- an immediate phone follow-up can still ride the continuity window.
    if new.status in ('resolvida', 'arquivada') and new.closed_at is null then
      new.closed_at := now();
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    if new.status in ('resolvida', 'arquivada') then
      new.closed_at := now();
    else
      new.closed_at := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists conversations_maintain_closed_at on public.conversations;
create trigger conversations_maintain_closed_at
before insert or update of status on public.conversations
for each row
execute function public.conversations_maintain_closed_at();

-- Backfill currently-closed conversations: the close instant comes from the
-- activity trail when available (it exists since 2026-07-04); older closed
-- conversations fall back to updated_at (close writes touch it), then
-- created_at. Open conversations stay NULL.
update public.conversations c
   set closed_at = a.last_close
  from (
    select conversation_id, max(created_at) as last_close
      from public.conversation_activity
     where to_status in ('resolvida', 'arquivada')
     group by conversation_id
  ) a
 where a.conversation_id = c.id
   and c.status in ('resolvida', 'arquivada')
   and c.closed_at is null;

update public.conversations
   set closed_at = coalesce(updated_at, created_at)
 where status in ('resolvida', 'arquivada')
   and closed_at is null;
