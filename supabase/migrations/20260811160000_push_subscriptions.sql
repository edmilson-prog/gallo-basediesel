-- Web Push subscriptions (PRD-145 RF-002) — one row per DEVICE, not per user:
-- a gestor with the app on a phone and a browser gets two, and a push goes to
-- both.
--
-- `recipient_id` holds an auth user id (auth.uid()), not a seller id, because
-- the browser registers the endpoint on its own with no seller context, and the
-- RLS predicate has to be evaluable from the client session alone. The
-- `recipient_type` column keeps the door open for the storefront customer push
-- deferred to Onda 11 without a second table; today only 'seller' is written.
--
-- No FK to auth.users on purpose: the table is written from the client under
-- RLS and read by the dispatcher with the service role, and an FK into the auth
-- schema would couple a public table to a schema we do not own.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null,
  recipient_type text not null check (recipient_type in ('seller', 'customer')),
  -- The endpoint IS the device identity as far as the push service is
  -- concerned; unique so a re-subscribe upserts instead of piling up rows that
  -- would each deliver the same notification.
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

-- The dispatcher's only lookup: every active endpoint of one recipient.
create index if not exists push_subscriptions_recipient_idx
  on public.push_subscriptions (recipient_id);

alter table public.push_subscriptions enable row level security;

-- The owner manages their own devices. The service role bypasses RLS, which is
-- how `push-dispatch` reads endpoints and deletes the ones that answer 410.
drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions
  for select to authenticated
  using (recipient_id = auth.uid());

drop policy if exists push_subscriptions_insert on public.push_subscriptions;
create policy push_subscriptions_insert on public.push_subscriptions
  for insert to authenticated
  with check (recipient_id = auth.uid());

-- The upsert path needs UPDATE too: a device that re-subscribes keeps its
-- endpoint and refreshes the keys and `last_used_at`.
drop policy if exists push_subscriptions_update on public.push_subscriptions;
create policy push_subscriptions_update on public.push_subscriptions
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions
  for delete to authenticated
  using (recipient_id = auth.uid());

comment on table public.push_subscriptions is
  'Web Push endpoints, one per device. Written by the client under RLS; read and pruned by the push-dispatch Edge Function with the service role.';
