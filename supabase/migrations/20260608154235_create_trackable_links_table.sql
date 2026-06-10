-- PRD-027 D-15 — trackable links. text PK; faker → no seed.
create table if not exists public.trackable_links (
  id text primary key,
  store_id text not null references public.stores (id),
  asset_id text,
  conversation_id text references public.conversations (id),
  lead_id text references public.leads (id),
  target_url text not null,
  short_ref text not null,
  utm jsonb,
  created_by text not null,
  opens integer not null default 0,
  last_opened_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists trackable_links_store_id_idx on public.trackable_links (store_id);
create index if not exists trackable_links_conversation_id_idx on public.trackable_links (conversation_id);
create index if not exists trackable_links_lead_id_idx on public.trackable_links (lead_id);

alter table public.trackable_links enable row level security;
drop policy if exists trackable_links_select_poc_temp on public.trackable_links;
create policy trackable_links_select_poc_temp on public.trackable_links for select to anon, authenticated using (true);
