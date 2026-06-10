-- public.carteira_transfers (ICarteiraTransfer) — wallet transfers between sellers.
-- Audit-style: created once, only `status` flips. No updated_at. faker → no seed.
create table if not exists public.carteira_transfers (
  id              text primary key,
  store_id        text not null references public.stores (id),
  type            text not null,
  from_seller_id  text not null references public.sellers (id),
  to_seller_id    text not null references public.sellers (id),
  customer_ids    text[] not null default '{}'::text[],
  reason          text not null,
  start_date      timestamptz not null,
  end_date        timestamptz,
  auto_revert_at  timestamptz,
  status          text not null default 'active',
  created_by      text not null references public.sellers (id),
  created_at      timestamptz not null default now()
);

create index if not exists carteira_transfers_store_id_idx on public.carteira_transfers (store_id);
create index if not exists carteira_transfers_from_seller_id_idx on public.carteira_transfers (from_seller_id);
create index if not exists carteira_transfers_to_seller_id_idx on public.carteira_transfers (to_seller_id);
create index if not exists carteira_transfers_status_idx on public.carteira_transfers (status);
create index if not exists carteira_transfers_type_idx on public.carteira_transfers (type);
create index if not exists carteira_transfers_start_date_idx on public.carteira_transfers (start_date desc);

alter table public.carteira_transfers enable row level security;

drop policy if exists "carteira_transfers_select_poc_temp" on public.carteira_transfers;
create policy "carteira_transfers_select_poc_temp"
  on public.carteira_transfers for select to anon, authenticated using (true);
