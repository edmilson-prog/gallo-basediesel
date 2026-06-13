-- Scheduled send: periodic trigger (PRD-027 RNF-007 → production).
--
-- Enables pg_net so pg_cron can invoke the `scheduled-send-worker` Edge Function
-- over HTTP every minute (the existing whatsapp-health-tick is SQL-only because
-- pg_net was off — enabling it here also unblocks an active WhatsApp health
-- probe later). The worker is a PUBLIC function (verify_jwt off) protected by a
-- shared secret: the cron sends it in `x-worker-secret`, the worker compares.
--
-- The secret is generated SERVER-SIDE into Vault (never committed, never
-- echoed) and read by BOTH sides from Vault: the cron via integration_secret_get
-- here, the worker via the _shared/secrets resolver. Rotating it in the
-- "Integrações & Chaves" screen takes effect on both with no redeploy.
--
-- ORDER OF OPERATIONS at apply time: this migration runs AFTER the function is
-- deployed, so the very first tick hits a live endpoint.

create extension if not exists pg_net;

-- Generate the shared secret once (64 hex chars), only if absent. gen_random_uuid
-- is core PG (no pgcrypto dependency). create_secret stores it encrypted.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'SCHEDULED_WORKER_SECRET') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'SCHEDULED_WORKER_SECRET',
      'Shared secret authenticating the scheduled-send-worker cron trigger (PRD-027 production).'
    );
  end if;
end $$;

-- Idempotent (re)schedule: drop any prior job with this name, then create it.
select cron.unschedule(jobid) from cron.job where jobname = 'scheduled-send-tick';

select cron.schedule(
  'scheduled-send-tick',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://njizaasajkdqptlxddqn.supabase.co/functions/v1/scheduled-send-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', public.integration_secret_get('SCHEDULED_WORKER_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $cron$
);
