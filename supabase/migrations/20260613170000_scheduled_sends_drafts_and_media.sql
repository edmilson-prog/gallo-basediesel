-- Scheduling Center (Fase 1): drafts + media.
-- 1) Drafts have no time → scheduled_for becomes nullable.
-- 2) Formalize the status set including 'draft'.
-- 3) Invariant: every 'pending' row MUST have a time (keeps claim_due_scheduled_sends
--    correct without touching it — drafts/null never become "due").
-- payload gains media fields, but it is a jsonb column → no DDL needed for that.

alter table public.scheduled_sends
  alter column scheduled_for drop not null;

alter table public.scheduled_sends
  drop constraint if exists scheduled_sends_status_check;
alter table public.scheduled_sends
  add constraint scheduled_sends_status_check
  check (status in ('draft', 'pending', 'sent', 'cancelled', 'failed'));

alter table public.scheduled_sends
  drop constraint if exists scheduled_sends_pending_needs_time;
alter table public.scheduled_sends
  add constraint scheduled_sends_pending_needs_time
  check (status <> 'pending' or scheduled_for is not null);
