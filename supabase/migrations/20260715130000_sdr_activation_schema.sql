-- SDR production pilot — Parte B activation schema adjustments.
--
-- 1. system_prompt nunca foi escrita (Parte A não ativou nada) — o prompt do
--    SDR passa a ter uma única fonte configurável: ai_settings.routing
--    [feature='sdr'].systemPrompt (aba Funcionalidades), mesmo padrão do
--    copilot-generate. Ver supabase/functions/sdr-respond/index.ts para como
--    esse campo é combinado (como sufixo, não substituição) com o BASE_PROMPT
--    estrutural que carrega o contrato JSON.
alter table public.sdr_settings drop column if exists system_prompt;

-- 2. Índice parcial para o scan do sdr-backstop-tick (mesmo predicado de
--    isQueuedConversation, mais store_id): sem isso, a varredura a cada
--    minuto faria sequential scan de conversations.
create index if not exists conversations_sdr_backstop_queue_idx
  on public.conversations (store_id, queued_at)
  where assigned_seller_id is null
    and is_sdr_active = false
    and status = 'aguardando';

-- 3. Shared secret pros dois novos workers internos (sdr-respond,
--    sdr-backstop-tick) — mesmo padrão de SCHEDULED_WORKER_SECRET
--    (20260613120100_scheduled_send_cron_trigger.sql).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'SDR_WORKER_SECRET') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'SDR_WORKER_SECRET',
      'Shared secret authenticating sdr-respond and sdr-backstop-tick (SDR production pilot, Parte B).'
    );
  end if;
end $$;
