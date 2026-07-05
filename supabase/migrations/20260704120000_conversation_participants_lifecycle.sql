-- Colaboradores por demanda (conversation_participants lifecycle):
-- 1) tag the row's origin (manual invite vs @mention auto-add) so the UI can
--    show "via @menção" and the notify trigger (next migration) can decide
--    whether to fire a bell notification.
-- 2) cp_write (a single ALL policy) cannot let a participant delete their OWN
--    row without also letting them insert/update arbitrary rows — Postgres
--    RLS policies are all-or-nothing per USING/WITH CHECK pair for `for all`.
--    Split into cp_insert (unchanged: staff or the conversation's assignee)
--    and cp_delete (same, PLUS the participant removing themselves).
-- 3) "resolvida"/"arquivada" already means "no owner" for assigned_seller_id
--    (see docs/dev/attendance-close-history.md); mirror that for collaborators
--    — a closed conversation starts its next round of collaboration empty.

alter table public.conversation_participants
  add column if not exists source text not null default 'manual'
  check (source in ('manual', 'mention'));

drop policy if exists cp_write on public.conversation_participants;

drop policy if exists cp_insert on public.conversation_participants;
create policy cp_insert on public.conversation_participants
  for insert to authenticated
  with check (
    (select public.is_staff())
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.assigned_seller_id = (select public.current_seller_id())
    )
  );

drop policy if exists cp_delete on public.conversation_participants;
create policy cp_delete on public.conversation_participants
  for delete to authenticated
  using (
    (select public.is_staff())
    or seller_id = (select public.current_seller_id())
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.assigned_seller_id = (select public.current_seller_id())
    )
  );

create or replace function public.clear_conversation_participants_on_close()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status in ('resolvida', 'arquivada') and old.status is distinct from new.status then
    delete from public.conversation_participants where conversation_id = new.id;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_clear_participants_on_close on public.conversations;
create trigger trg_clear_participants_on_close
  after update of status on public.conversations
  for each row
  execute function public.clear_conversation_participants_on_close();
