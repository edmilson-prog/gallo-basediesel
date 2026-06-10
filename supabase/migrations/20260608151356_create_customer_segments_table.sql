-- public.customer_segments (ICustomerSegment). Owner-scoped saved filters.
create table if not exists public.customer_segments (
  id             text primary key,
  owner_id       text not null references public.sellers (id),
  name           text not null,
  description    text,
  scope          text not null,
  filters        jsonb not null default '{}'::jsonb,
  estimated_size integer,
  created_at     timestamptz not null default now()
);

create index if not exists customer_segments_owner_id_idx on public.customer_segments (owner_id);
create index if not exists customer_segments_scope_idx on public.customer_segments (scope);
create index if not exists customer_segments_created_at_idx on public.customer_segments (created_at);

alter table public.customer_segments enable row level security;

drop policy if exists "customer_segments_select_poc_temp" on public.customer_segments;
create policy "customer_segments_select_poc_temp"
  on public.customer_segments for select to anon, authenticated using (true);
