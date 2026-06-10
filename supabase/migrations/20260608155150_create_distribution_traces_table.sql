-- PRD-013 — append-only audit of each chat-routing decision. text PK; faker → no seed.
create table if not exists public.distribution_traces (
  id text primary key,
  conversation_id text not null references public.conversations (id),
  customer_id text references public.customers (id),
  lead_id text references public.leads (id),
  store_id text not null references public.stores (id),
  "timestamp" timestamptz not null,
  selected_seller_id text references public.sellers (id),
  criterion_matched text not null,
  candidates_evaluated jsonb not null default '[]'::jsonb,
  mode text not null
);
create index if not exists distribution_traces_store_id_idx on public.distribution_traces (store_id);
create index if not exists distribution_traces_conversation_id_idx on public.distribution_traces (conversation_id);
create index if not exists distribution_traces_selected_seller_id_idx on public.distribution_traces (selected_seller_id);
create index if not exists distribution_traces_timestamp_idx on public.distribution_traces ("timestamp" desc);

alter table public.distribution_traces enable row level security;
drop policy if exists distribution_traces_select_poc_temp on public.distribution_traces;
create policy distribution_traces_select_poc_temp on public.distribution_traces for select to anon, authenticated using (true);
