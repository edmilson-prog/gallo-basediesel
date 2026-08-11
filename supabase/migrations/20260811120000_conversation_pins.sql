-- Pinned inbox conversations (spec 2026-08-11).
--
-- A pin is PERSONAL: it records ONE seller's intent to "keep this conversation
-- at hand". Pinning changes neither the conversation nor anyone else's view —
-- hence a separate table, and no new column on `conversations` (the Inbox hot
-- path already took production down with statement_timeout on 2026-07-02;
-- nothing goes in there).
--
-- This table is NOT an access gate: reading the conversation stays governed by
-- the `conversations` RLS (two-gate model). A pin whose conversation became
-- inaccessible simply does not come back from the fetch — no error, no leak.

create table if not exists public.conversation_pins (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  seller_id       uuid not null references public.sellers(id) on delete cascade,
  store_id        uuid not null references public.stores(id),
  created_at      timestamptz not null default now(),
  primary key (seller_id, conversation_id)
);

comment on table public.conversation_pins is
  'Conversas fixadas no topo do Inbox, por vendedor. Preferência pessoal — nunca um portão de acesso (a RLS de conversations continua valendo).';

-- The composite PK already serves every SELECT (always filtered by seller_id)
-- and makes a duplicate pin impossible in the database. This index serves the
-- recency ordering.
create index if not exists conversation_pins_seller_created_idx
  on public.conversation_pins (seller_id, created_at desc);

alter table public.conversation_pins enable row level security;

-- SELECT/INSERT: own pins only, within the active store.
create policy "conversation_pins_select"
  on public.conversation_pins for select to authenticated
  using (
    seller_id = (select public.current_seller_id())
    and store_id = (select public.current_store_id())
  );

create policy "conversation_pins_insert"
  on public.conversation_pins for insert to authenticated
  with check (
    seller_id = (select public.current_seller_id())
    and store_id = (select public.current_store_id())
  );

-- DELETE: no store gate — unpinning must keep working after the seller switches
-- active store, otherwise the pin gets stuck with no way to remove it.
create policy "conversation_pins_delete"
  on public.conversation_pins for delete to authenticated
  using (seller_id = (select public.current_seller_id()));

-- No UPDATE policy: pinning is an INSERT, unpinning is a DELETE.
grant select, insert, delete on public.conversation_pins to authenticated;
