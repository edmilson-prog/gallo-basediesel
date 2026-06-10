-- PRDs 112/113 — integration_logs: audit trail of outbound provider calls
-- (Meta Cloud API / Evolution API). The PRDs reference `crm.integration_logs`
-- (PRD-101 idealized schema); this repo uses schema `public` (recorded
-- deviation since PRD-101).
--
-- Writes happen ONLY server-side (Edge Functions via service_role, which
-- bypasses RLS) — there are deliberately NO insert/update/delete policies.
-- Reads are owner-only, same silent-filter pattern as the system health RPCs
-- (PRD-110). Payload columns store SANITIZED jsonb (tokens redacted, bodies
-- truncated at 10KB by the engine's sanitizeForLog).

create table public.integration_logs (
  id uuid primary key default gen_random_uuid(),
  integration_name text not null check (integration_name in ('whatsapp_meta', 'whatsapp_evolution')),
  direction text not null default 'outbound' check (direction in ('outbound', 'inbound')),
  endpoint text not null,
  http_status integer,
  latency_ms integer,
  trace_id text,
  request_payload jsonb,
  response_payload jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

comment on table public.integration_logs is
  'Outbound WhatsApp provider call audit (PRD-112 RF-120). Written by Edge Functions (service_role) only; owner-only read.';

alter table public.integration_logs enable row level security;

create policy "integration_logs_owner_read"
  on public.integration_logs
  for select
  to authenticated
  using (public.current_app_role() = 'owner');

create index integration_logs_created_at_idx
  on public.integration_logs (created_at desc);
create index integration_logs_integration_name_idx
  on public.integration_logs (integration_name, created_at desc);
create index integration_logs_trace_id_idx
  on public.integration_logs (trace_id)
  where trace_id is not null;
