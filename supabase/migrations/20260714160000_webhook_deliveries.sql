-- Webhook Delivery History: raw-payload audit trail for every inbound
-- webhook call the platform receives (whatsapp-webhook + waha-webhook),
-- independent of processing outcome. Separate from `integration_logs`
-- (which stays as the curated audit trail with no expiry) — logging
-- literally everything received would force integration_logs to either
-- start expiring records that today don't, or grow unbounded with
-- customer PII. Rotates on its own 30-day window (retention job below).
create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  integration_name text not null,
  account_id uuid references public.whatsapp_accounts(id) on delete set null,
  event_type text,
  endpoint text not null,
  http_status integer not null,
  outcome text not null check (outcome in ('processed', 'ignored', 'duplicate', 'error', 'rejected')),
  error_message text,
  latency_ms integer,
  request_payload jsonb,
  trace_id text,
  created_at timestamptz not null default now()
);

comment on table public.webhook_deliveries is
  'Raw-payload history of every inbound webhook call (whatsapp-webhook + waha-webhook), any outcome. 30-day rolling retention via pg_cron. Owner-only read.';

create index webhook_deliveries_created_at_idx on public.webhook_deliveries (created_at desc);
create index webhook_deliveries_account_id_idx on public.webhook_deliveries (account_id);

alter table public.webhook_deliveries enable row level security;

create policy webhook_deliveries_owner_read
  on public.webhook_deliveries for select
  using (current_app_role() = 'owner');

-- No INSERT/UPDATE/DELETE policy for authenticated/anon — only
-- service_role (the Edge Functions' admin client) writes here, exactly
-- like integration_logs.

create or replace function public.webhook_deliveries_retention_tick()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.webhook_deliveries
  where created_at < now() - interval '30 days';
$$;

comment on function public.webhook_deliveries_retention_tick() is
  'Daily rotation for webhook_deliveries — deletes rows older than 30 days. Runs from pg_cron only.';

revoke all on function public.webhook_deliveries_retention_tick() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'webhook-deliveries-retention';

select cron.schedule(
  'webhook-deliveries-retention',
  '0 4 * * *',
  $cmd$ select public.webhook_deliveries_retention_tick(); $cmd$
);
