-- Conversation tags catalog (spec 2026-07-02-conversation-tags-design.md).
-- Association lives in the existing conversations.tags text[] (GIN-indexed
-- since 20260608151350) which now stores conversation_tags.id values.
-- Writes are Owner-STRICT (unlike message_templates' is_staff()) per the
-- owner decision; reads are store-scoped for any authenticated member.
create table public.conversation_tags (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  label text not null,
  -- Curated palette color id (e.g. 'teal'); resolved to hex in the app.
  color text not null default 'slate',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.conversation_tags is
  'Owner-managed catalog of conversation tags; conversations.tags stores these ids.';

create unique index conversation_tags_store_label_uq
  on public.conversation_tags (store_id, lower(label));
create index conversation_tags_store_idx on public.conversation_tags (store_id);

alter table public.conversation_tags enable row level security;

-- SELECT: any authenticated member of the store (pickers, chips, filter).
create policy conversation_tags_select
  on public.conversation_tags for select to authenticated
  using (store_id = (select public.current_store_id()));

-- Writes: Owner only (strict — fail-closed via IS DISTINCT FROM pattern).
create policy conversation_tags_insert
  on public.conversation_tags for insert to authenticated
  with check (
    (select public.current_app_role()) = 'owner'
    and store_id = (select public.current_store_id())
  );

create policy conversation_tags_update
  on public.conversation_tags for update to authenticated
  using (
    (select public.current_app_role()) = 'owner'
    and store_id = (select public.current_store_id())
  )
  with check (
    (select public.current_app_role()) = 'owner'
    and store_id = (select public.current_store_id())
  );

create policy conversation_tags_delete
  on public.conversation_tags for delete to authenticated
  using (
    (select public.current_app_role()) = 'owner'
    and store_id = (select public.current_store_id())
  );
