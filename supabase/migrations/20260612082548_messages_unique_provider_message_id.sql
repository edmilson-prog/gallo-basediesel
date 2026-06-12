-- Real-inbox import (spec 2026-06-11): provider_message_id becomes the global
-- dedup arbiter — the history import upserts with ON CONFLICT DO NOTHING and
-- the webhook relies on it being unique. Postgres treats NULLs as distinct,
-- so legacy/seed/mock rows (null provider_message_id) are unaffected.
-- Approved by the owner on 2026-06-12 (T5 adversarial review follow-up).
drop index if exists public.messages_provider_message_id_idx;
create unique index messages_provider_message_id_key
  on public.messages (provider_message_id);
