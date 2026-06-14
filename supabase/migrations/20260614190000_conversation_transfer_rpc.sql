-- Seller-initiated conversation transfer.
--
-- A non-staff seller cannot reassign a conversation to ANOTHER seller via a direct
-- UPDATE: the resulting row leaves their RLS read scope (conversations_select =
-- assigned_seller_id = current_seller_id()), which Postgres rejects regardless of
-- the UPDATE WITH CHECK. Relaxing WITH CHECK (20260614184500) was therefore
-- insufficient, so we (1) restore the original tighter WITH CHECK and (2) perform
-- the hand-off through a SECURITY DEFINER RPC that authorizes the caller and runs
-- the reassignment with elevated privileges.

-- (1) Restore the original conversations_update WITH CHECK (revert 20260614184500):
--     a direct UPDATE may only leave the row owned by the caller (or staff).
--     Reassignment to another seller goes through transfer_conversation() below.
alter policy conversations_update on public.conversations
  with check (
    store_id = (select public.current_store_id())
    and (
      (select public.is_staff())
      or assigned_seller_id = (select public.current_seller_id())
    )
  );

-- (2) Authorized transfer. SECURITY DEFINER so neither the reassignment nor the
--     returned row is blocked by the caller losing read access to it. The caller
--     must be staff, or currently handle the conversation (assigned to them, or
--     unassigned). The target must be an active seller in the same store. The
--     conversation's store is never changed, so tenant isolation is preserved.
create or replace function public.transfer_conversation(
  p_conversation_id uuid,
  p_to_seller_id uuid
)
returns setof public.conversations
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_store uuid := public.current_store_id();
  v_seller uuid := public.current_seller_id();
  v_conv public.conversations;
begin
  select * into v_conv from public.conversations where id = p_conversation_id;
  if not found then
    raise exception 'conversation % not found', p_conversation_id using errcode = 'P0002';
  end if;

  if v_conv.store_id is distinct from v_store then
    raise exception 'not allowed to transfer this conversation' using errcode = '42501';
  end if;

  if not (
    public.is_staff()
    or v_conv.assigned_seller_id = v_seller
    or v_conv.assigned_seller_id is null
  ) then
    raise exception 'not allowed to transfer this conversation' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.sellers s
    where s.id = p_to_seller_id
      and s.store_id = v_store
      and coalesce(s.active, true)
  ) then
    raise exception 'invalid transfer target' using errcode = '22023';
  end if;

  return query
    update public.conversations
       set assigned_seller_id = p_to_seller_id,
           is_sdr_active = false,
           updated_at = now()
     where id = p_conversation_id
    returning *;
end;
$$;

revoke all on function public.transfer_conversation(uuid, uuid) from public;
grant execute on function public.transfer_conversation(uuid, uuid) to authenticated;
