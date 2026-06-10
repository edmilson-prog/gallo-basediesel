-- PRD-027 D-15 — quick reply snippets ("/atalhos"). text PK; faker → no seed.
create table if not exists public.quick_replies (
  id text primary key,
  store_id text not null references public.stores (id),
  shortcut text not null,
  title text not null,
  body text not null,
  scope text not null,
  owner_id text not null references public.sellers (id),
  allowed_role_ids text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quick_replies_store_id_idx on public.quick_replies (store_id);
create index if not exists quick_replies_owner_id_idx on public.quick_replies (owner_id);
create index if not exists quick_replies_shortcut_idx on public.quick_replies (shortcut);

alter table public.quick_replies enable row level security;
drop policy if exists "quick_replies_select_poc_temp" on public.quick_replies;
create policy "quick_replies_select_poc_temp" on public.quick_replies for select to anon, authenticated using (true);
