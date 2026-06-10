-- PRD-104: notifications + notification_preferences (schema public).
-- recipient_id is polymorphic (seller|customer) → text (project convention),
-- compared in RLS against current_seller_id()::text. RLS mirrors the _scope.ts
-- model via the PRD-103 helpers: staff (owner/manager) see/manage the whole
-- store; a recipient sees/manages only their own rows.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null,
  lifecycle text not null,
  type text not null,
  category text not null,
  severity text not null,
  recipient_id text not null,
  recipient_type text not null,
  store_id uuid references public.stores(id) on delete cascade,
  title text not null,
  body text,
  entity_ref jsonb,
  actions jsonb,
  status text not null default 'unread',
  channels text[] not null default '{}',
  delivery_status jsonb,
  group_key text,
  source text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  expires_at timestamptz,
  metadata jsonb
);

create index notifications_recipient_id_idx on public.notifications (recipient_id);
create index notifications_store_id_idx on public.notifications (store_id);
create index notifications_status_idx on public.notifications (status);
create index notifications_recipient_status_idx on public.notifications (recipient_id, status);
create index notifications_lifecycle_dedupe_idx on public.notifications (lifecycle, dedupe_key);

alter table public.notifications enable row level security;

create policy "notifications_select" on public.notifications for select to authenticated
  using (
    (store_id = public.current_store_id() or store_id is null)
    and (public.is_staff() or recipient_id = public.current_seller_id()::text)
  );
create policy "notifications_insert" on public.notifications for insert to authenticated
  with check (
    (store_id = public.current_store_id() or store_id is null)
    and (public.is_staff() or recipient_id = public.current_seller_id()::text)
  );
create policy "notifications_update" on public.notifications for update to authenticated
  using (
    (store_id = public.current_store_id() or store_id is null)
    and (public.is_staff() or recipient_id = public.current_seller_id()::text)
  )
  with check (
    (store_id = public.current_store_id() or store_id is null)
    and (public.is_staff() or recipient_id = public.current_seller_id()::text)
  );
create policy "notifications_delete" on public.notifications for delete to authenticated
  using (
    (store_id = public.current_store_id() or store_id is null)
    and (public.is_staff() or recipient_id = public.current_seller_id()::text)
  );

grant select, insert, update, delete on public.notifications to authenticated;

-- ---------------------------------------------------------------------------

create table public.notification_preferences (
  recipient_id text primary key,
  recipient_type text not null,
  matrix jsonb not null,
  quiet_hours jsonb,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

create policy "notification_preferences_select" on public.notification_preferences for select to authenticated
  using (public.is_staff() or recipient_id = public.current_seller_id()::text);
create policy "notification_preferences_insert" on public.notification_preferences for insert to authenticated
  with check (public.is_staff() or recipient_id = public.current_seller_id()::text);
create policy "notification_preferences_update" on public.notification_preferences for update to authenticated
  using (public.is_staff() or recipient_id = public.current_seller_id()::text)
  with check (public.is_staff() or recipient_id = public.current_seller_id()::text);
create policy "notification_preferences_delete" on public.notification_preferences for delete to authenticated
  using (public.is_staff() or recipient_id = public.current_seller_id()::text);

grant select, insert, update, delete on public.notification_preferences to authenticated;
