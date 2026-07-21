-- SDR backstop eligibility fix — follow-up to the 2026-07-20 mass-dispatch
-- incident. Design: docs/superpowers/specs/2026-07-20-sdr-backstop-eligibility-fix-design.md
--
-- ⚠️ NOT applied during implementation. Applied at rollout (owner-gated),
-- BEFORE re-arming the crons — the new sdr-backstop-tick calls the RPC
-- created here.

-- 1. Activation stamps. Set by trigger whenever the respective sdr_enabled
--    flag flips on, regardless of write path (UI, SQL console, MCP).
--    Re-enabling after a pause renews the stamp, so backlog accumulated
--    while paused stays ineligible.
alter table public.sdr_settings
  add column if not exists sdr_activated_at timestamptz;
alter table public.whatsapp_accounts
  add column if not exists sdr_activated_at timestamptz;

-- Single shared trigger function — both tables use the same column/flag names.
create or replace function public.stamp_sdr_activated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.sdr_enabled then
      new.sdr_activated_at := now();
    end if;
  elsif new.sdr_enabled and not coalesce(old.sdr_enabled, false) then
    new.sdr_activated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_sdr_activated_at on public.sdr_settings;
create trigger trg_stamp_sdr_activated_at
  before insert or update on public.sdr_settings
  for each row execute function public.stamp_sdr_activated_at();

drop trigger if exists trg_stamp_sdr_activated_at on public.whatsapp_accounts;
create trigger trg_stamp_sdr_activated_at
  before insert or update on public.whatsapp_accounts
  for each row execute function public.stamp_sdr_activated_at();

-- 2. Index for the candidates RPC's lateral "last message of the
--    conversation" lookup. Existing indexes cover (conversation_id) and
--    (conversation_id, sent_at) only; the lateral orders by created_at.
create index if not exists messages_conversation_created_at_idx
  on public.messages (conversation_id, created_at);

-- 3. Candidates RPC: the whole relational eligibility filter in one
--    round-trip. Worker-only — sdr-backstop-tick calls it with service_role.
--    NULL semantics: greatest() ignores NULLs; if BOTH stamps are null the
--    comparison yields NULL and the row is excluded — fails closed, never open.
create or replace function public.sdr_backstop_candidates()
returns table (
  conversation_id uuid,
  store_id uuid,
  whatsapp_account_id uuid,
  last_inbound_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select c.id, c.store_id, c.whatsapp_account_id, lm.created_at
  from public.conversations c
  join public.sdr_settings s
    on s.store_id = c.store_id and s.sdr_enabled
  join public.whatsapp_accounts w
    on w.id = c.whatsapp_account_id and w.sdr_enabled
  cross join lateral (
    select m.direction, m.created_at
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) lm
  where c.status = 'aguardando'
    and c.assigned_seller_id is null
    and c.is_sdr_active = false
    and c.queued_at is not null
    and lm.direction = 'in'
    and lm.created_at > greatest(s.sdr_activated_at, w.sdr_activated_at)
    and lm.created_at > now() - interval '24 hours'
  order by lm.created_at asc
$$;

revoke execute on function public.sdr_backstop_candidates() from public, anon, authenticated;
grant execute on function public.sdr_backstop_candidates() to service_role;
