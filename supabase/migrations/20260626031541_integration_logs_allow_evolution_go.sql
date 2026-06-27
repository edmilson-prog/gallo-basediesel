-- Evolution Go (whatsmeow) integration logs were silently dropped: the
-- integration_logs.integration_name check constraint never learned about the
-- engine added in PR #173. The Go engine writes
-- integration_name = 'whatsapp_evolution_go' (EVOLUTION_GO_INTEGRATION_NAME),
-- so every Go integration log violated the constraint and was discarded by the
-- fail-open sink (logIntegration ignores the PostgREST error) — leaving the
-- /instance/create failures invisible. Widen the allowed set.
--
-- Applied to production via MCP on 2026-06-26 (version 20260626031541); this
-- file mirrors that change into Git per the project's migration policy.
alter table public.integration_logs
  drop constraint if exists integration_logs_integration_name_check;

alter table public.integration_logs
  add constraint integration_logs_integration_name_check
  check (integration_name in (
    'whatsapp_meta', 'whatsapp_evolution', 'whatsapp_evolution_go', 'melhor_envio'
  ));
