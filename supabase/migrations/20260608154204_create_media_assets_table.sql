-- PRD-026 "Vault" — media assets catalog. text PK; faker → no seed.
create table if not exists public.media_assets (
  id                text primary key,
  store_id          text not null references public.stores (id) on delete cascade,
  conversation_id   text references public.conversations (id) on delete set null,
  customer_id       text references public.customers (id) on delete set null,
  message_id        text references public.messages (id) on delete set null,
  kind              text not null check (kind in ('image', 'audio', 'document', 'video')),
  mime_type         text not null,
  size_bytes        integer not null,
  file_name         text,
  author_type       text not null check (author_type in ('customer', 'seller', 'sdr', 'system')),
  direction         text not null check (direction in ('in', 'out')),
  created_at        timestamptz not null default now(),
  storage_ref       text not null,
  persisted         boolean not null default true,
  source_expires_at timestamptz,
  content_hash      text,
  classification    text check (classification in ('nota_fiscal', 'peca', 'chassi_placa', 'comprovante', 'catalogo', 'outro')),
  linked_vehicle_id text references public.vehicles (id) on delete set null,
  linked_order_id   text references public.orders (id) on delete set null,
  linked_part_id    text references public.parts (id) on delete set null,
  ocr_text          text,
  transcription     text,
  sensitivity       text not null default 'normal' check (sensitivity in ('normal', 'sensitive')),
  annotations       jsonb,
  version           integer
);
create index if not exists media_assets_store_id_idx on public.media_assets (store_id);
create index if not exists media_assets_conversation_id_idx on public.media_assets (conversation_id);
create index if not exists media_assets_customer_id_idx on public.media_assets (customer_id);
create index if not exists media_assets_message_id_idx on public.media_assets (message_id);
create index if not exists media_assets_content_hash_idx on public.media_assets (content_hash);
create index if not exists media_assets_created_at_idx on public.media_assets (created_at desc);

alter table public.media_assets enable row level security;
drop policy if exists "media_assets_select_poc_temp" on public.media_assets;
create policy "media_assets_select_poc_temp" on public.media_assets for select to anon, authenticated using (true);
