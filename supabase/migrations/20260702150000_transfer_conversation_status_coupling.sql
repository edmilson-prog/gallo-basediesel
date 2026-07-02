-- Status <-> assignment coupling (spec 2026-07-02-unify-queue-assignment):
-- assigning a seller through transfer_conversation now advances a queued
-- ('aguardando') conversation to 'em_andamento' — an assigned conversation is
-- by definition being attended. Body-only change: same signature, grants and
-- authorization rules as 20260614190000.

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
           status = case when status = 'aguardando' then 'em_andamento' else status end,
           updated_at = now()
     where id = p_conversation_id
    returning *;
end;
$$;
