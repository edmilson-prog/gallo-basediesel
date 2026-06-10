-- PRD-116 — HSM template catalog mirroring what was approved in the Meta
-- Business Manager (manual sync in the MVP). The PRD names
-- crm.message_templates — repo uses schema public.
create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id),            -- null = global
  whatsapp_account_id uuid references public.whatsapp_accounts(id),

  -- Meta metadata (must match the Business Manager EXACTLY)
  meta_template_name text not null,
  meta_language_code text not null default 'pt_BR',
  meta_category text not null check (meta_category in ('utility', 'marketing', 'authentication')),
  meta_status text not null default 'unknown'
    check (meta_status in ('approved', 'pending', 'rejected', 'paused', 'unknown')),

  -- Internal curation
  display_name text not null,
  description text,
  is_active boolean not null default true,

  -- Structure
  body_template text not null,
  variable_count integer not null default 0,
  variable_labels jsonb not null default '[]',
  header_type text check (header_type in ('none', 'text', 'image', 'document', 'video')),
  header_text_template text,
  buttons jsonb,

  created_by uuid references public.sellers(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz,

  unique (whatsapp_account_id, meta_template_name, meta_language_code)
);

comment on table public.message_templates is
  'HSM template catalog (PRD-116). Mirrors Meta Business Manager approvals; manual sync in MVP.';

alter table public.message_templates enable row level security;

-- SELECT: any authenticated member of the store (sellers pick templates).
create policy "message_templates_select"
  on public.message_templates for select to authenticated
  using (store_id is null or store_id = (select public.current_store_id()));

-- Writes: staff only (owner/manager), scoped to their store.
create policy "message_templates_insert"
  on public.message_templates for insert to authenticated
  with check ((select public.is_staff()) and (store_id is null or store_id = (select public.current_store_id())));

create policy "message_templates_update"
  on public.message_templates for update to authenticated
  using ((select public.is_staff()) and (store_id is null or store_id = (select public.current_store_id())))
  with check ((select public.is_staff()) and (store_id is null or store_id = (select public.current_store_id())));

create policy "message_templates_delete"
  on public.message_templates for delete to authenticated
  using ((select public.is_staff()) and (store_id is null or store_id = (select public.current_store_id())));

create index message_templates_store_id_idx on public.message_templates (store_id);
create index message_templates_account_idx on public.message_templates (whatsapp_account_id);
