-- Parte D — real escalation timeout + urgent broadcast (PRD-023, produção).
--
-- Closes two gaps found while shipping Parte B/C
-- (docs/superpowers/specs/2026-07-16-sdr-escalonamento-timeout-broadcast-design.md):
--   Gap 1: an escalation assigned to a seller who never responds sits silent.
--   Gap 2: escalateToHuman() finding no seller (status='pending') leaves
--     conversations.is_sdr_active stuck true — nobody is actually watching it.
--
-- NOTE ON TYPES: sellers.id / sdr_escalations.id / conversation_id /
-- assigned_seller_id are all `uuid` in production (verified live via
-- information_schema.columns, 2026-07-17) even though the oldest checked-in
-- migration files for these tables still declare some of them `text` — this
-- migration is written against the verified live types.

-- 1) Per-store timeout thresholds (minutes) — same table as the pilot
--    kill-switch/backstop timeout (sdr_settings, Parte B/C).
alter table public.sdr_settings
  add column if not exists escalation_timeout_urgent_minutes integer not null default 5,
  add column if not exists escalation_timeout_normal_minutes integer not null default 30;

-- 2) First-human-response trigger. Mirrors sdr_pause_on_human_message's
--    philosophy (Parte A, 20260714120100): ANY seller outbound message on the
--    conversation counts, not just the specifically assigned one. Casting
--    messages.author_id to match assigned_seller_id would risk breaking every
--    seller send if the cast ever failed (this is a blocking AFTER INSERT
--    trigger) — a precision this signal doesn't need.
create or replace function public.sdr_escalation_first_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.direction = 'out' and new.author_type = 'seller' then
    update sdr_escalations
    set first_human_response_at = now(),
        status = 'answered'
    where conversation_id = new.conversation_id
      and status = 'assigned'
      and first_human_response_at is null;
  end if;
  return new;
end;
$$;

comment on function public.sdr_escalation_first_response() is
  'Parte D: marks the first outbound seller message on a conversation as the escalation''s first human response — stops the broadcast countdown. Independent of, and coexists with, trg_sdr_pause_on_human_message on the same table/event.';

drop trigger if exists sdr_escalation_first_response_trigger on public.messages;
create trigger sdr_escalation_first_response_trigger
  after insert on public.messages
  for each row
  when (new.direction = 'out' and new.author_type = 'seller')
  execute function public.sdr_escalation_first_response();

-- 3) Broadcast eligibility — sellers who can access the WhatsApp instance
--    behind a given escalation's conversation. Runs from
--    sdr-escalation-timeout-tick (service_role, no auth.uid()) so it CANNOT
--    reuse current_seller_accessible_account_ids() (that helper resolves
--    "the current JWT's seller"). This is its mirror, parameterized by
--    account instead of by session — same OR-of-rules logic as
--    whatsapp_multi_access_helpers.sql's current_seller_accessible_account_ids,
--    minus the "current seller" framing. whatsapp_account_access_rules.target_value
--    is text, hence the ::text casts on the uuid columns being compared.
create or replace function public.accessible_seller_ids_for_account(p_account_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from sellers s
  join whatsapp_accounts a on a.id = p_account_id
  left join profiles p on p.auth_user_id = s.auth_user_id
  where s.store_id = a.store_id
    and s.active = true
    and (
      p.role in ('owner', 'manager')
      or exists (
        select 1 from whatsapp_account_access_rules r
        where r.whatsapp_account_id = p_account_id
          and (
            (r.kind = 'seller' and r.target_value = s.id::text)
            or (r.kind = 'role' and r.target_value = p.role)
            or (r.kind = 'store' and r.target_value = s.store_id::text)
          )
      )
    );
$$;

comment on function public.accessible_seller_ids_for_account(uuid) is
  'Parte D: seller ids eligible to see/claim an urgent-broadcast escalation on this WhatsApp instance (owner/manager + explicit access rules). Service-role callable (no auth.uid() dependency) — used by sdr-escalation-timeout-tick.';

revoke all on function public.accessible_seller_ids_for_account(uuid) from public, anon, authenticated;
grant execute on function public.accessible_seller_ids_for_account(uuid) to service_role;

-- 4) Atomic claim — fixes useUrgentBroadcastQueue's non-atomic client
--    .patch(). `urgent_broadcast_claimed_by_seller_id is null` in the WHERE
--    clause is the race guard: two sellers claiming concurrently, only one
--    UPDATE matches a row and RETURNING gives it a value; the loser's
--    v_row.id stays null and the function raises.
create or replace function public.claim_sdr_escalation(p_escalation_id uuid)
returns sdr_escalations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller_id uuid := current_seller_id();
  v_row sdr_escalations;
begin
  if v_seller_id is null then
    raise exception 'seller_not_found';
  end if;

  update sdr_escalations
  set assigned_seller_id = v_seller_id,
      assigned_at = now(),
      first_human_response_at = null,
      status = 'assigned',
      urgent_broadcast_claimed_by_seller_id = v_seller_id,
      urgent_broadcast_claimed_at = now()
  where id = p_escalation_id
    and urgent_broadcast_claimed_by_seller_id is null
    and status in ('pending', 'assigned')
  returning * into v_row;

  if v_row.id is null then
    raise exception 'escalation_already_claimed';
  end if;

  update conversations
  set assigned_seller_id = v_seller_id,
      is_sdr_active = false
  where id = v_row.conversation_id;

  return v_row;
end;
$$;

comment on function public.claim_sdr_escalation(uuid) is
  'Parte D: atomically claims a broadcasting escalation for the caller''s seller id and reassigns the conversation. Raises escalation_already_claimed on a lost race, seller_not_found if the JWT has no seller_id claim.';

revoke all on function public.claim_sdr_escalation(uuid) from public, anon;
grant execute on function public.claim_sdr_escalation(uuid) to authenticated;
