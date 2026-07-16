-- SDR backstop tick: periodic trigger (Parte B activation).
--
-- Same pattern as scheduled-send-tick (20260613120100). pg_net is already
-- enabled by that migration — `create extension if not exists` here is just
-- defensive idempotency.
--
-- ORDER OF OPERATIONS at apply time: this migration must run AFTER
-- sdr-backstop-tick is deployed, so the very first tick hits a live endpoint.
-- It also assumes SDR_WORKER_SECRET already exists (minted by
-- 20260715130000_sdr_activation_schema.sql).

create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'sdr-backstop-tick';

select cron.schedule(
  'sdr-backstop-tick',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://njizaasajkdqptlxddqn.supabase.co/functions/v1/sdr-backstop-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', public.integration_secret_get('SDR_WORKER_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $cron$
);
