-- Scheduled send: server-side dispatch claim (PRD-027 RNF-007 → production).
--
-- The scheduled_sends table already persists the queue; what was missing is a
-- server-side dispatcher. This migration adds the atomic claim primitive so a
-- worker can reserve due rows WITHOUT a transient status — keeping the frontend
-- `ScheduledSendStatus` enum ('pending'|'sent'|'cancelled'|'failed') untouched.
--
-- Claim model: the worker stamps `dispatch_started_at`, then sends, then flips
-- status to 'sent'/'failed'. A row left 'pending' with a stamp older than 5 min
-- (worker crash mid-flight) becomes re-claimable, so a transient failure never
-- strands a scheduled message forever.

alter table public.scheduled_sends
  add column if not exists dispatch_started_at timestamptz;

comment on column public.scheduled_sends.dispatch_started_at is
  'When the server worker last claimed this row for dispatch. NULL = unclaimed. Dedups concurrent ticks; a row stuck >5min (crash) is re-claimable.';

-- Atomic claim of due, pending sends. Called by the worker (service_role), which
-- bypasses RLS; execute is revoked from everyone else so the claim semantics are
-- never exposed to browser sessions. FOR UPDATE SKIP LOCKED lets overlapping
-- ticks claim disjoint rows; the staleness window re-arms crashed claims.
create or replace function public.claim_due_scheduled_sends(p_limit int default 50)
returns setof public.scheduled_sends
language plpgsql
set search_path = public
as $$
begin
  return query
  update public.scheduled_sends s
     set dispatch_started_at = now()
   where s.id in (
     select d.id
       from public.scheduled_sends d
      where d.status = 'pending'
        and d.scheduled_for <= now()
        and (
          d.dispatch_started_at is null
          or d.dispatch_started_at < now() - interval '5 minutes'
        )
      order by d.scheduled_for
      limit greatest(1, least(p_limit, 200))
      for update skip locked
   )
  returning s.*;
end;
$$;

revoke all on function public.claim_due_scheduled_sends(int) from public, anon, authenticated;
grant execute on function public.claim_due_scheduled_sends(int) to service_role;
