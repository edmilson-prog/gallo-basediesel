-- Bell notification for a MANUALLY-invited collaborator (the AddCollaboratorDialog
-- path). @mention-driven adds (source='mention') are NOT notified here — the
-- existing notify_conversation_note_mentions trigger (20260614120000) already
-- sends a "fulano mencionou você" notification for the same event, and sending
-- a second one here would duplicate it. The floating CollaboratorAddedPrompt
-- (frontend, realtime-driven) reacts to BOTH sources — it's a separate, purely
-- visual signal ("you now have access"), not the bell.
create or replace function public.notify_conversation_participant_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_added_by_name text;
begin
  if new.source <> 'manual' then
    return new;
  end if;

  select coalesce(nullif(s.attendant_name, ''), s.full_name)
    into v_added_by_name
  from public.sellers s
  where s.id = new.added_by;

  insert into public.notifications
    (dedupe_key, lifecycle, type, category, severity, recipient_id, recipient_type,
     store_id, title, body, entity_ref, status, channels, source, created_at)
  select
    'conv-participant-' || new.conversation_id::text || '-' || new.seller_id::text,
    'event',
    'conversa.colaboradorAdicionado',
    'operational',
    'info',
    new.seller_id::text,
    'seller',
    c.store_id,
    coalesce(v_added_by_name, 'Um atendente') || ' adicionou você a uma conversa',
    null,
    jsonb_build_object('type', 'conversation', 'id', new.conversation_id::text),
    'unread',
    array['inApp']::text[],
    'rule',
    now()
  from public.conversations c
  where c.id = new.conversation_id;

  return new;
end;
$function$;

drop trigger if exists conversation_participants_notify_added on public.conversation_participants;
create trigger conversation_participants_notify_added
  after insert on public.conversation_participants
  for each row
  execute function public.notify_conversation_participant_added();
