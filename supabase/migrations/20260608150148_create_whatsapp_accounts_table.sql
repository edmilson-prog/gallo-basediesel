-- PRD-011/104 — WhatsApp accounts per store. text PK ('wa-...'). Small static seed.
create table if not exists public.whatsapp_accounts (
  id text primary key,
  store_id text not null references public.stores (id),
  label text not null,
  phone_number text not null,
  provider text not null,
  credentials_ref text not null,
  status text not null,
  capabilities jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_accounts_store_id_idx on public.whatsapp_accounts (store_id);

alter table public.whatsapp_accounts enable row level security;

drop policy if exists "whatsapp_accounts_select_poc_temp" on public.whatsapp_accounts;
create policy "whatsapp_accounts_select_poc_temp"
  on public.whatsapp_accounts for select to anon, authenticated using (true);

insert into public.whatsapp_accounts
  (id, store_id, label, phone_number, provider, credentials_ref, status, capabilities, created_at)
values
  ('wa-meta-matriz', 'store-matriz', 'GALLO Matriz (Oficial)', '(55) 99800-1000', 'meta',
   'vault://gallo/wa-meta-matriz', 'connected',
   '{"supportsTemplatesHsm": true, "supportsInteractiveButtons": true, "supportsLists": true, "supportsReactions": true, "supportsProactiveMessaging": false, "supportsReadStatusInGroups": false}'::jsonb,
   '2026-02-01T10:00:00.000Z'),
  ('wa-evo-campanhas', 'store-matriz', 'GALLO Campanhas', '(55) 99800-2000', 'evolution',
   'vault://gallo/wa-evo-campanhas', 'connected',
   '{"supportsTemplatesHsm": false, "supportsInteractiveButtons": false, "supportsLists": false, "supportsReactions": true, "supportsProactiveMessaging": true, "supportsReadStatusInGroups": true}'::jsonb,
   '2026-02-15T10:00:00.000Z')
on conflict (id) do nothing;
