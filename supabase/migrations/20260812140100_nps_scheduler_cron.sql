-- NPS scheduler: tick horário.
--
-- ORDEM DE APLICAÇÃO: esta migration deve rodar DEPOIS do deploy de
-- nps-scheduler, para que o primeiro tick encontre um endpoint vivo. Requer o
-- segredo NPS_WORKER_SECRET já cadastrado (Configurações → Integrações &
-- Chaves, resolução Vault-first).
--
-- De hora em hora, e não a cada minuto como os ticks de atendimento: a
-- pesquisa não é urgente, e a janela de envio (send_window) já segura o
-- disparo fora do horário comercial. Roda no minuto 5 para não competir com os
-- jobs que rodam na virada da hora.
--
-- Aplicar isto NÃO dispara pesquisa nenhuma: nps_settings.enabled nasce false
-- e nenhuma loja tem linha de configuração até o dono criá-la conscientemente.

create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'nps-scheduler';

select cron.schedule(
  'nps-scheduler',
  '5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://njizaasajkdqptlxddqn.supabase.co/functions/v1/nps-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', public.integration_secret_get('NPS_WORKER_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $cron$
);
