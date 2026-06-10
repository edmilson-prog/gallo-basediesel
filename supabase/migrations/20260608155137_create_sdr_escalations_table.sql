-- PRD-023 — SDR→human handoff escalations. text PK; session_id FK-less (no sdr table dep). faker → no seed.
create table if not exists public.sdr_escalations (
  id                                    text primary key,
  session_id                            text not null,
  conversation_id                       text not null references public.conversations (id),
  customer_id                           text references public.customers (id),
  lead_id                               text references public.leads (id),
  store_id                              text not null references public.stores (id),
  reason                                text not null,
  reason_details                        text,
  mode                                  text not null,
  context_summary                       jsonb not null,
  assigned_seller_id                    text references public.sellers (id),
  assigned_at                           timestamptz,
  first_human_response_at               timestamptz,
  status                                text not null,
  specialty_matched                     boolean,
  urgent_broadcast_at                   timestamptz,
  urgent_broadcast_claimed_by_seller_id text references public.sellers (id),
  urgent_broadcast_claimed_at           timestamptz,
  created_at                            timestamptz not null default now()
);
create index if not exists sdr_escalations_store_id_idx on public.sdr_escalations (store_id);
create index if not exists sdr_escalations_conversation_id_idx on public.sdr_escalations (conversation_id);
create index if not exists sdr_escalations_session_id_idx on public.sdr_escalations (session_id);
create index if not exists sdr_escalations_customer_id_idx on public.sdr_escalations (customer_id);
create index if not exists sdr_escalations_assigned_seller_id_idx on public.sdr_escalations (assigned_seller_id);
create index if not exists sdr_escalations_status_idx on public.sdr_escalations (status);
create index if not exists sdr_escalations_created_at_idx on public.sdr_escalations (created_at desc);

alter table public.sdr_escalations enable row level security;
drop policy if exists sdr_escalations_select_poc_temp on public.sdr_escalations;
create policy sdr_escalations_select_poc_temp on public.sdr_escalations for select to anon, authenticated using (true);
