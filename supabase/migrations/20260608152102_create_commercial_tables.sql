-- ===== quotes + quote_items =====
create table if not exists public.quotes (
  id                    text primary key,
  store_id              text not null references public.stores (id),
  number                text not null,
  customer_id           text references public.customers (id),
  lead_id               text references public.leads (id),
  conversation_id       text references public.conversations (id),
  seller_id             text not null references public.sellers (id),
  subtotal              numeric not null default 0,
  discount              numeric not null default 0,
  discount_reason       text,
  shipping              numeric not null default 0,
  total                 numeric not null default 0,
  payment_condition     text not null default '',
  payment_method        text,
  payment_terms         text,
  delivery_address      jsonb,
  valid_until           timestamptz not null,
  status                text not null,
  origin                text not null,
  division              text not null default 'parts',
  requires_approval     boolean,
  approved_by           text references public.sellers (id),
  approved_at           timestamptz,
  rejected_reason       text,
  converted_to_order_id text,
  converted_at          timestamptz,
  notes                 text,
  applied_kit_ids       text[],
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists quotes_store_id_idx on public.quotes (store_id);
create index if not exists quotes_seller_id_idx on public.quotes (seller_id);
create index if not exists quotes_customer_id_idx on public.quotes (customer_id);
create index if not exists quotes_lead_id_idx on public.quotes (lead_id);
create index if not exists quotes_conversation_id_idx on public.quotes (conversation_id);
create index if not exists quotes_status_idx on public.quotes (status);
create index if not exists quotes_origin_idx on public.quotes (origin);
create index if not exists quotes_updated_at_idx on public.quotes (updated_at desc);

create table if not exists public.quote_items (
  id          text primary key,
  quote_id    text not null references public.quotes (id) on delete cascade,
  part_id     text not null references public.parts (id),
  part_sku    text not null,
  part_name   text not null,
  quantity    numeric not null default 0,
  unit_price  numeric not null default 0,
  discount    numeric not null default 0,
  total       numeric not null default 0
);
create index if not exists quote_items_quote_id_idx on public.quote_items (quote_id);
create index if not exists quote_items_part_id_idx on public.quote_items (part_id);

alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
drop policy if exists "quotes_select_poc_temp" on public.quotes;
create policy "quotes_select_poc_temp" on public.quotes for select to anon, authenticated using (true);
drop policy if exists "quote_items_select_poc_temp" on public.quote_items;
create policy "quote_items_select_poc_temp" on public.quote_items for select to anon, authenticated using (true);

-- ===== orders + order_items =====
create table if not exists public.orders (
  id                 text primary key,
  store_id           text not null references public.stores (id),
  customer_id        text not null references public.customers (id),
  seller_id          text not null references public.sellers (id),
  number             text,
  quote_id           text references public.quotes (id),
  conversation_id    text references public.conversations (id),
  subtotal           numeric not null,
  discount           numeric not null,
  shipping           numeric not null,
  total              numeric not null,
  payment_condition  text not null,
  payment_method     text,
  payment_terms      text,
  payment_status     text not null,
  paid_at            timestamptz,
  fulfillment_status text not null,
  delivery_address   jsonb,
  carrier            text,
  tracking_code      text,
  shipped_at         timestamptz,
  delivered_at       timestamptz,
  returned_at        timestamptz,
  return_reason      text,
  origin             text not null,
  division           text not null default 'parts',
  nf_number          text,
  nf_date            timestamptz,
  canceled_at        timestamptz,
  canceled_by        text references public.sellers (id),
  cancel_reason      text,
  internal_notes     text,
  customer_notes     text,
  commission_preview jsonb,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists orders_store_id_idx on public.orders (store_id);
create index if not exists orders_customer_id_idx on public.orders (customer_id);
create index if not exists orders_seller_id_idx on public.orders (seller_id);
create index if not exists orders_quote_id_idx on public.orders (quote_id);
create index if not exists orders_conversation_id_idx on public.orders (conversation_id);
create index if not exists orders_payment_status_idx on public.orders (payment_status);
create index if not exists orders_fulfillment_status_idx on public.orders (fulfillment_status);
create index if not exists orders_created_at_idx on public.orders (created_at desc);

create table if not exists public.order_items (
  id                    text primary key,
  order_id              text not null references public.orders (id) on delete cascade,
  part_id               text not null references public.parts (id),
  part_sku              text not null,
  part_name             text not null,
  quantity              numeric not null,
  unit_price            numeric not null,
  unit_cost             numeric not null,
  discount              numeric not null,
  total                 numeric not null,
  margin_value          numeric not null,
  applied_to_vehicle_id text references public.vehicles (id),
  part_category         text,
  part_subcategory      text
);
create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists order_items_part_id_idx on public.order_items (part_id);
create index if not exists order_items_applied_to_vehicle_id_idx on public.order_items (applied_to_vehicle_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
drop policy if exists "orders_select_poc_temp" on public.orders;
create policy "orders_select_poc_temp" on public.orders for select to anon, authenticated using (true);
drop policy if exists "order_items_select_poc_temp" on public.order_items;
create policy "order_items_select_poc_temp" on public.order_items for select to anon, authenticated using (true);

-- ===== commissions =====
create table if not exists public.commissions (
  id                   text primary key,
  store_id             text not null references public.stores (id),
  seller_id            text not null references public.sellers (id),
  order_id             text not null references public.orders (id),
  base_value           numeric not null,
  rate                 numeric not null,
  base_rate            numeric not null,
  base_commission      numeric not null,
  goal_bonus           numeric not null,
  total_commission     numeric not null,
  value                numeric not null,
  is_split             boolean not null default false,
  split_details        jsonb,
  rule_snapshot        jsonb,
  goal_snapshot        jsonb,
  period               text not null,
  closed_in_period     text,
  approved_at          timestamptz,
  approved_by          text,
  paid_at              timestamptz,
  paid_by              text,
  dispute_reason       text,
  disputed_at          timestamptz,
  dispute_resolution   text,
  dispute_resolved_by  text,
  dispute_resolved_at  timestamptz,
  status               text not null,
  notes                text,
  calculated_at        timestamptz not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists commissions_store_id_idx on public.commissions (store_id);
create index if not exists commissions_seller_id_idx on public.commissions (seller_id);
create index if not exists commissions_order_id_idx on public.commissions (order_id);
create index if not exists commissions_status_idx on public.commissions (status);
create index if not exists commissions_period_idx on public.commissions (period);
create index if not exists commissions_store_period_status_idx on public.commissions (store_id, period, status);
create index if not exists commissions_created_at_idx on public.commissions (created_at desc);

alter table public.commissions enable row level security;
drop policy if exists "commissions_select_poc_temp" on public.commissions;
create policy "commissions_select_poc_temp" on public.commissions for select to anon, authenticated using (true);
