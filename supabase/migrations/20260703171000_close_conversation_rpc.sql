-- close_conversation: atomic terminal-status close (resolvida/arquivada).
-- Unassigns the seller and clears is_sdr_active in the same UPDATE, which
-- fires the conversation_activity_capture trigger (Task 4 migration).

create or replace function public.close_conversation(
  p_conversation_id uuid,
  p_status text
)
returns setof public.conversations
language plpgsql
security definer
set search_path to ''
as $$
begin
  if p_status not in ('resolvida', 'arquivada') then
    raise exception 'invalid close status %', p_status using errcode = '22023';
  end if;
  if not public.can_access_conversation(p_conversation_id) then
    raise exception 'not allowed to close conversation %', p_conversation_id
      using errcode = '42501';
  end if;
  return query
    update public.conversations
       set status = p_status,
           assigned_seller_id = null,
           is_sdr_active = false,
           updated_at = now()
     where id = p_conversation_id
    returning *;
end;
$$;

revoke all on function public.close_conversation(uuid, text) from public;
grant execute on function public.close_conversation(uuid, text) to authenticated;
