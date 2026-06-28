-- WhatsApp Evolution Go — HistorySync import staging (Phase 2 Etapa B).
--
-- `prepare` distills the captured HistorySync chunks (integration_logs) into one
-- row per importable 1:1 chat; `land` consumes pending rows (cursored) and reuses
-- landNormalizedChat. The row doubles as the UNDO manifest — it carries the exact
-- provider_message_ids that were imported, so "Desfazer importação" can remove
-- precisely what was landed without touching live messages.
--
-- Only the Edge Function (service_role, RLS-bypassing) writes. Owner may read for
-- transparency. Not a security boundary — operational staging.

create table if not exists public.whatsapp_go_history_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.whatsapp_accounts(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  phone text not null,
  contact_name text,
  messages jsonb not null default '[]'::jsonb, -- INormalizedRecord[]
  landed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, phone)
);

-- Partial index: the land cursor only ever scans not-yet-landed rows per account.
create index if not exists idx_wa_go_history_items_pending
  on public.whatsapp_go_history_items (account_id)
  where not landed;

alter table public.whatsapp_go_history_items enable row level security;

drop policy if exists wa_go_history_items_owner_read on public.whatsapp_go_history_items;
create policy wa_go_history_items_owner_read on public.whatsapp_go_history_items
  for select to authenticated
  using (public.current_app_role() = 'owner');
