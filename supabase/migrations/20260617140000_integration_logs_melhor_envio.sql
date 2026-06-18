-- Allow the Melhor Envio integration to write audit rows (Fase A).
--
-- The integration_logs CHECK (20260610122110) only permitted the WhatsApp
-- engines, so the best-effort audit in `melhor-envio-quote` would be rejected
-- silently. Extend the allow-list to include 'melhor_envio'.

alter table public.integration_logs
  drop constraint if exists integration_logs_integration_name_check;

alter table public.integration_logs
  add constraint integration_logs_integration_name_check
  check (integration_name in ('whatsapp_meta', 'whatsapp_evolution', 'melhor_envio'));
