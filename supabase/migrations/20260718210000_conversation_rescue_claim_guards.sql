-- Incident 2026-07-18 (re-broadcast loop): the absent seller could claim his
-- own rescue — a no-op reassignment that only burned the rescue row and fed
-- the loop (the owner, offline, claimed 19 of his own broadcasts in 4 min).
-- Patch: reject self-claims with a dedicated errcode (P0006). The guard sits
-- BEFORE the liveness re-check on purpose — self-claim rejection must win
-- over staleness (P0005), and the planted RLS fixture relies on that order.
-- Everything else is identical to 20260717170000_conversation_rescues.sql.

create or replace function public.claim_conversation_rescue(p_rescue_id uuid)
returns public.conversation_rescues
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.conversation_rescues;
  v_seller uuid := public.current_seller_id();
  v_still_valid boolean;
begin
  if v_seller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_row from public.conversation_rescues where id = p_rescue_id;
  if not found then
    raise exception 'rescue not found' using errcode = 'P0002';
  end if;

  if not public.can_access_conversation(v_row.conversation_id) then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  -- Incident 2026-07-18: the rescue exists BECAUSE this seller is absent —
  -- letting them claim it re-assigns the conversation to themselves and the
  -- next tick re-broadcasts it, looping forever.
  if v_row.absent_seller_id = v_seller then
    raise exception 'absent seller cannot claim own rescue' using errcode = 'P0006';
  end if;

  -- Liveness re-check (spec 2026-07-17): if the absent seller already
  -- answered the client themselves (awaiting_reply_since cleared by the
  -- sub-project-A trigger), or the conversation moved on in some other way,
  -- this broadcast is stale — reject the claim (only the tick's sweep
  -- persists the cancellation).
  select exists (
    select 1 from public.conversations c
    where c.id = v_row.conversation_id
      and c.assigned_seller_id = v_row.absent_seller_id
      and c.awaiting_reply_since is not null
      and c.status in ('aguardando', 'em_andamento', 'aguardando_cliente')
  ) into v_still_valid;

  if v_row.status = 'broadcasting' and not v_still_valid then
    raise exception 'rescue no longer valid' using errcode = 'P0005';
  end if;

  update public.conversation_rescues
     set status = 'claimed',
         claimed_by_seller_id = v_seller,
         claimed_at = now()
   where id = p_rescue_id
     and status = 'broadcasting'
  returning * into v_row;

  if not found then
    raise exception 'already claimed' using errcode = 'P0004';
  end if;

  update public.conversations
     set assigned_seller_id = v_seller
   where id = v_row.conversation_id;

  insert into public.audit_logs (id, store_id, actor_id, action, resource, resource_id, after)
  values (gen_random_uuid(), v_row.store_id, v_seller, 'conversation_rescue_claim', 'conversation',
          v_row.conversation_id::text, jsonb_build_object('rescueId', p_rescue_id));

  return v_row;
end;
$function$;
