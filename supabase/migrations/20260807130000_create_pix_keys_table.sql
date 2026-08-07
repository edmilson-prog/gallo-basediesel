-- PIX shortcut (design 2026-08-07) — store-owned PIX keys for the
-- conversation quick-send shortcut.
-- Read: the whole store (the attendant needs the key to send it).
-- Write: staff only (Owner/Gestor) — a PIX key is the company's, not the
-- seller's, so letting a seller register their own key is a fraud surface.
--
-- id/store_id/created_by are uuid — NOT text. quick_replies (the neighbour
-- this table otherwise mirrors) still shows `text` in its original creation
-- migration (20260608154228), but that predates the project-wide text->uuid
-- conversion (20260608182429_convert_reference_pks_to_uuid.sql), which
-- rewrote quick_replies.store_id/owner_id to uuid in place; only its `id`
-- stayed text because it isn't itself an FK target. Every table created since
-- (conversation_tags, conversation_notes, departments, rotation_queues,
-- whatsapp_openwa_servers, conversation_rescues, ...) uses
-- `id uuid primary key default gen_random_uuid()` and uuid FKs to
-- stores/sellers — and current_store_id()/current_seller_id() (see
-- 20260609114034) both return uuid. A `text` id/store_id here would make the
-- foreign keys and the RLS policies below fail to apply (uuid = text has no
-- operator). This migration follows the current convention instead.
create table if not exists public.pix_keys (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id),
  alias text not null,
  key_type text not null check (key_type in ('cnpj','cpf','phone','email','random')),
  key_value text not null,
  receiver_name text not null,
  receiver_city text not null,
  default_context text,
  shortcut text,
  default_send_text boolean not null default true,
  default_send_qr boolean not null default false,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_by uuid not null references public.sellers (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pix_keys_store_id_idx on public.pix_keys (store_id);
create index if not exists pix_keys_shortcut_idx on public.pix_keys (shortcut);

alter table public.pix_keys enable row level security;

drop policy if exists pix_keys_select on public.pix_keys;
create policy pix_keys_select on public.pix_keys
  for select to authenticated
  using (store_id = public.current_store_id());

drop policy if exists pix_keys_insert on public.pix_keys;
create policy pix_keys_insert on public.pix_keys
  for insert to authenticated
  with check (store_id = public.current_store_id() and public.is_staff());

drop policy if exists pix_keys_update on public.pix_keys;
create policy pix_keys_update on public.pix_keys
  for update to authenticated
  using (store_id = public.current_store_id() and public.is_staff())
  with check (store_id = public.current_store_id() and public.is_staff());

drop policy if exists pix_keys_delete on public.pix_keys;
create policy pix_keys_delete on public.pix_keys
  for delete to authenticated
  using (store_id = public.current_store_id() and public.is_staff());
