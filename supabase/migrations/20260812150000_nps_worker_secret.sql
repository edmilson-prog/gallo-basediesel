-- Segredo compartilhado que autentica o nps-scheduler.
--
-- Mesmo padrão de SDR_WORKER_SECRET (20260715130000) e SCHEDULED_WORKER_SECRET
-- (20260613120100): é um segredo INTERNO, entre o pg_cron e a Edge Function da
-- própria plataforma. Não passa pela tela Integrações & Chaves — aquela tela é
-- para credenciais de terceiros (Resend, OpenAI, WAHA), que o dono precisa
-- colar de fora. Aqui não há nada para colar: o valor é gerado no banco,
-- ninguém precisa conhecê-lo, e ele nunca sai do cofre.
--
-- Idempotente: reexecutar não regenera o segredo (o que invalidaria o cron já
-- agendado sem aviso).
--
-- ORDEM: esta migration deve rodar ANTES de 20260812140100_nps_scheduler_cron,
-- porque o job lê o segredo com integration_secret_get. Sem ele, o cron manda
-- o header vazio e a função responde 401 de hora em hora.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'NPS_WORKER_SECRET') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'NPS_WORKER_SECRET',
      'Shared secret authenticating nps-scheduler (PRD-148B). Interno: pg_cron -> Edge Function.'
    );
  end if;
end $$;
