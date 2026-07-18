-- conversation-rescue-tick: periodic trigger (sub-projeto B). Same pattern as
-- sdr-backstop-tick. ORDER OF OPERATIONS: apply AFTER the function is
-- deployed and AFTER the worker-secret migration above.

create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'conversation-rescue-tick';

select cron.schedule(
  'conversation-rescue-tick',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://njizaasajkdqptlxddqn.supabase.co/functions/v1/conversation-rescue-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', public.integration_secret_get('CONVERSATION_RESCUE_WORKER_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $cron$
);
