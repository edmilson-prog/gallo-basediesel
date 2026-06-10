-- conversations (IConversation). text PK ('conv-...'); faker → no seed.
-- lead_id / linked_order_id kept as plain columns (leads/orders FK added later).
create table if not exists public.conversations (
  id                  text primary key,
  store_id            text not null references public.stores (id),
  customer_id         text references public.customers (id),
  lead_id             text,
  assigned_seller_id  text references public.sellers (id),
  channel             text not null,
  whatsapp_account_id text references public.whatsapp_accounts (id),
  status              text not null,
  is_sdr_active       boolean not null default false,
  tags                text[] not null default '{}',
  linked_order_id     text,
  last_message_at     timestamptz not null,
  unread_count        integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists conversations_store_id_idx on public.conversations (store_id);
create index if not exists conversations_assigned_seller_id_idx on public.conversations (assigned_seller_id);
create index if not exists conversations_customer_id_idx on public.conversations (customer_id);
create index if not exists conversations_lead_id_idx on public.conversations (lead_id);
create index if not exists conversations_status_idx on public.conversations (status);
create index if not exists conversations_channel_idx on public.conversations (channel);
create index if not exists conversations_last_message_at_idx on public.conversations (last_message_at desc);
create index if not exists conversations_tags_gin_idx on public.conversations using gin (tags);

alter table public.conversations enable row level security;

drop policy if exists "conversations_select_poc_temp" on public.conversations;
create policy "conversations_select_poc_temp"
  on public.conversations for select to anon, authenticated using (true);
