-- Agenda: the operation's contact catalog. A contact is a PERSON or a NUMBER,
-- linked to a customer or loose. `customers` and `leads` are untouched by this
-- feature; `lead_id` only records where a materialised contact came from.

create table if not exists public.contacts (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references public.stores(id) on delete cascade,
  name              text not null,
  role              text,
  phone             text,
  phone_digits      text,
  email             text,
  city              text,
  uf                text,
  customer_id       uuid references public.customers(id) on delete set null,
  lead_id           uuid references public.leads(id) on delete set null,
  owner_seller_id   uuid references public.sellers(id) on delete set null,
  tags              text[] not null default '{}',
  source            text not null default 'manual',
  opt_out           boolean not null default false,
  opt_out_at        timestamptz,
  opt_out_by        uuid references public.sellers(id) on delete set null,
  next_contact_at   timestamptz,
  next_contact_note text,
  last_contact_at   timestamptz,
  has_whatsapp      boolean not null default false,
  division          text not null default 'parts',
  -- Triage outcome (phase 2). A triaged-away contact disappears from the
  -- Agenda's default listing but stays searchable, with the reason on record —
  -- so this is a nullable timestamp + reason, never a delete.
  ignored_at        timestamptz,
  ignore_reason     text,
  ignored_by        uuid references public.sellers(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint contacts_source_check check (
    source in ('whatsapp','dintec','manual','csv','balcao','portal_b2b','storefront')
  ),
  constraint contacts_division_check check (division in ('parts','service','industrial')),
  constraint contacts_ignore_reason_check check (
    ignore_reason is null
    or ignore_reason in ('fornecedor','concorrente','engano','pessoal','spam')
  ),
  -- A reason without a timestamp (or vice-versa) is a half-written triage
  -- decision; the pair is meaningless apart.
  constraint contacts_ignored_pair_check check (
    (ignored_at is null) = (ignore_reason is null)
  )
);

comment on table public.contacts is
  'Agenda: person-or-number phonebook. customer_id NULL = loose contact. lead_id traces the origin when materialised from a lead; leads/customers are never modified by this feature.';

create index if not exists contacts_store_idx           on public.contacts (store_id);
create index if not exists contacts_store_phone_idx     on public.contacts (store_id, phone_digits);
create index if not exists contacts_customer_idx        on public.contacts (customer_id);
create index if not exists contacts_owner_idx           on public.contacts (owner_seller_id);
create index if not exists contacts_store_opt_out_idx   on public.contacts (store_id, opt_out);
create index if not exists contacts_lead_idx            on public.contacts (lead_id);
-- Partial index: the default listing filters `ignored_at is null` on every
-- query, and only a small slice of the base is ever ignored.
create index if not exists contacts_store_active_idx    on public.contacts (store_id)
  where ignored_at is null;

-- phone_digits mirrors what `customers` already does: kept by trigger rather
-- than a generated column so the backfill can correct a value by hand.
create or replace function public.contacts_set_phone_digits()
returns trigger
language plpgsql
as $$
begin
  new.phone_digits := nullif(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), '');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists contacts_phone_digits on public.contacts;
create trigger contacts_phone_digits
  before insert or update of phone on public.contacts
  for each row execute function public.contacts_set_phone_digits();

alter table public.contacts enable row level security;

-- The policies mirror `customers` EXACTLY, including the (SELECT ...) wrapper.
-- That wrapper is a requirement, not style: an unwrapped helper is evaluated
-- once PER ROW and already caused a statement_timeout storm here (the
-- `authenticated` role has an 8s timeout). `seller_accessible_customer_ids()`
-- is SET-RETURNING and must stay consumed via IN — do not swap it for a
-- per-row boolean helper.

drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts
  for select
  using (
    store_id = (select public.current_store_id())
    and (
      (select public.is_staff())
      or owner_seller_id = (select public.current_seller_id())
      or customer_id in (select public.seller_accessible_customer_ids())
    )
  );

drop policy if exists contacts_insert on public.contacts;
create policy contacts_insert on public.contacts
  for insert
  with check (
    store_id = (select public.current_store_id())
    and ((select public.is_staff()) or owner_seller_id = (select public.current_seller_id()))
  );

drop policy if exists contacts_update on public.contacts;
create policy contacts_update on public.contacts
  for update
  using (
    store_id = (select public.current_store_id())
    and ((select public.is_staff()) or owner_seller_id = (select public.current_seller_id()))
  )
  with check (
    store_id = (select public.current_store_id())
    and ((select public.is_staff()) or owner_seller_id = (select public.current_seller_id()))
  );

drop policy if exists contacts_delete on public.contacts;
create policy contacts_delete on public.contacts
  for delete
  using (
    store_id = (select public.current_store_id())
    and ((select public.is_staff()) or owner_seller_id = (select public.current_seller_id()))
  );
