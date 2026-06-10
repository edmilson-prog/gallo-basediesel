-- PRD-114 — unified WhatsApp webhook support.
--
-- processed_events: idempotency ledger (Meta retries aggressively — the same
-- event must never duplicate a message). Written ONLY by the webhook Edge
-- Function via service_role; RLS enabled with NO policies (invisible to app
-- roles). The PRD names it crm.processed_events — repo uses schema public.
create table public.processed_events (
  event_key text primary key,
  trace_id text,
  processed_at timestamptz not null default now()
);

comment on table public.processed_events is
  'Webhook idempotency ledger (PRD-114). event_key = whatsapp:<provider>:<providerMessageId>. service_role only.';

alter table public.processed_events enable row level security;

create index processed_events_processed_at_idx
  on public.processed_events (processed_at);

-- messages: webhook bookkeeping columns (additive).
-- provider_message_id is the canonical wamid/key.id — inbound dedupe and
-- outbound status matching (PRD-115/118 reuse it).
alter table public.messages
  add column provider_message_id text,
  add column webhook_event_ids text[] not null default '{}',
  add column media_download_status text
    check (media_download_status in ('ok', 'failed')),
  add column failure_reason text;

comment on column public.messages.provider_message_id is
  'Canonical provider message id (Meta wamid / Evolution key.id) — PRD-114.';
comment on column public.messages.media_download_status is
  'Inbound media fetch outcome (PRD-114): ok = stored in whatsapp-media bucket; failed = URL expired/timeout, manual retry.';

create index messages_provider_message_id_idx
  on public.messages (provider_message_id)
  where provider_message_id is not null;
