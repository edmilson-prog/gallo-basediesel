-- Record collaborator join/leave in the attendance-history timeline
-- (conversation_activity). Extends the activity type domain and adds a trigger
-- on conversation_participants mirrored by the mock's emitParticipantActivity.

alter table public.conversation_activity
  drop constraint if exists conversation_activity_type_check;
alter table public.conversation_activity
  add constraint conversation_activity_type_check
  check (type in ('created','status','assignment','reopen','participant_add','participant_remove'));

-- The participant (who joined/left) is stored in to_seller_id; actor_id is who
-- performed it (the responsável/staff, or the participant themselves on a
-- self-removal). from_/to_status stay null — a participant change is NOT an
-- owner or status delta (the timeline summary excludes these types from the
-- final-owner computation).
create or replace function public.conversation_participant_activity_capture()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_conv public.conversations%rowtype;
  v_actor uuid := public.current_seller_id();
  v_participant uuid;
  v_type text;
begin
  if tg_op = 'INSERT' then
    v_participant := new.seller_id;
    v_type := 'participant_add';
    select * into v_conv from public.conversations where id = new.conversation_id;
  else
    v_participant := old.seller_id;
    v_type := 'participant_remove';
    select * into v_conv from public.conversations where id = old.conversation_id;
  end if;

  -- Conversation already gone (cascade delete) → nothing to attribute to.
  if v_conv.id is null then
    return coalesce(new, old);
  end if;

  -- Skip the bulk clear fired by clear_conversation_participants_on_close: by the
  -- time that DELETE runs the conversation is already terminal, and the close is
  -- its own history node. A MANUAL remove always happens on an active
  -- conversation, so the terminal-status check cleanly excludes only the clear.
  if tg_op = 'DELETE' and v_conv.status in ('resolvida','arquivada') then
    return old;
  end if;

  insert into public.conversation_activity(
    conversation_id, customer_id, lead_id, store_id, type,
    from_status, to_status, from_seller_id, to_seller_id, actor_id, actor_kind)
  values (
    v_conv.id, v_conv.customer_id, v_conv.lead_id, v_conv.store_id, v_type,
    null, null, null, v_participant, v_actor,
    case when v_actor is null then 'system' else 'seller' end);

  return coalesce(new, old);
end;
$$;

drop trigger if exists conversation_participant_activity_capture on public.conversation_participants;
create trigger conversation_participant_activity_capture
  after insert or delete on public.conversation_participants
  for each row execute function public.conversation_participant_activity_capture();
