-- SDR escalation-timeout tick: periodic trigger (Parte D).
--
-- Same pattern as sdr-backstop-tick (20260715150000). pg_net is already
-- enabled by that migration.
--
-- ORDER OF OPERATIONS at apply time: this migration must run AFTER
-- sdr-escalation-timeout-tick is deployed, so the very first tick hits a
-- live endpoint. Reuses SDR_WORKER_SECRET (minted by
-- 20260715130000_sdr_activation_schema.sql) — same worker identity as
-- sdr-backstop-tick and sdr-respond.

select cron.unschedule(jobid) from cron.job where jobname = 'sdr-escalation-timeout-tick';

select cron.schedule(
  'sdr-escalation-timeout-tick',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://njizaasajkdqptlxddqn.supabase.co/functions/v1/sdr-escalation-timeout-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', public.integration_secret_get('SDR_WORKER_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $cron$
);
