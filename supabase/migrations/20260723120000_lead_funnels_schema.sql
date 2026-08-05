-- Multi-funnel model for leads (spec 2026-07-23-leads-multi-funil-design.md).
-- A lead participates in N funnels, with an independent stage in each.

create type public.lead_funnel_stage_kind as enum ('entrada','aberta','ganho','perda');

create table public.lead_funnels (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores(id) on delete cascade,
  name         text not null,
  description  text,
  accent       smallint not null default 0 check (accent between 0 and 8),
  icon         text not null default 'mdi:filter-variant',
  position     int  not null default 0,
  is_default   boolean not null default false,
  open_to_store boolean not null default false,
  entry_alert_threshold int not null default 50 check (entry_alert_threshold > 0),
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index lead_funnels_one_default_per_store
  on public.lead_funnels (store_id) where is_default and archived_at is null;
create unique index lead_funnels_unique_name
  on public.lead_funnels (store_id, lower(name)) where archived_at is null;
create index lead_funnels_store_position_idx
  on public.lead_funnels (store_id, position) where archived_at is null;

create table public.lead_funnel_stages (
  id         uuid primary key default gen_random_uuid(),
  funnel_id  uuid not null references public.lead_funnels(id) on delete cascade,
  name       text not null check (char_length(name) <= 24),
  accent     smallint not null default 0 check (accent between 0 and 8),
  position   int  not null default 0,
  kind       public.lead_funnel_stage_kind not null default 'aberta',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- target of the composite FK below
  unique (id, funnel_id)
);

create unique index lead_funnel_stages_one_entrada on public.lead_funnel_stages (funnel_id) where kind = 'entrada';
create unique index lead_funnel_stages_one_ganho   on public.lead_funnel_stages (funnel_id) where kind = 'ganho';
create unique index lead_funnel_stages_one_perda   on public.lead_funnel_stages (funnel_id) where kind = 'perda';
create unique index lead_funnel_stages_unique_name on public.lead_funnel_stages (funnel_id, lower(name));

create table public.lead_funnel_entries (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads(id) on delete cascade,
  funnel_id  uuid not null references public.lead_funnels(id) on delete cascade,
  stage_id   uuid not null,

  -- A membership must never point at a stage belonging to another funnel: the
  -- board would render a card with no matching column.
  constraint lead_funnel_entries_stage_belongs_to_funnel
    foreign key (funnel_id, stage_id)
    references public.lead_funnel_stages (funnel_id, id),

  -- Denormalised for cheap RLS; DERIVED by trigger, never taken from the client.
  store_id   uuid not null,
  seller_id  uuid,

  -- Value of the opportunity IN THIS FUNNEL. Inherited from the lead on
  -- creation. Without it the forecast would count one opportunity N times.
  estimated_value numeric,

  converted_to_customer_id uuid references public.customers(id),
  loss_reason text,
  loss_notes  text,

  entered_stage_at timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index lead_funnel_entries_unique on public.lead_funnel_entries (lead_id, funnel_id);
create index lead_funnel_entries_board_idx on public.lead_funnel_entries (funnel_id, stage_id, seller_id);
create index lead_funnel_entries_lead_idx  on public.lead_funnel_entries (lead_id);
create index lead_funnel_entries_owner_idx on public.lead_funnel_entries (store_id, seller_id);

create table public.lead_funnel_access (
  funnel_id  uuid not null references public.lead_funnels(id) on delete cascade,
  seller_id  uuid not null references public.sellers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (funnel_id, seller_id)
);

create index lead_funnel_access_seller_idx on public.lead_funnel_access (seller_id);

-- A partial unique index enforces "at most one" of each terminal kind, never
-- "exactly one". This deferred constraint trigger closes that gap, and being
-- deferred lets replaceStages reorder without tripping mid-transaction.
create or replace function public.assert_funnel_has_terminal_stages()
returns trigger language plpgsql set search_path = public as $$
declare
  target_funnel uuid := coalesce(new.funnel_id, old.funnel_id);
  missing text;
begin
  -- The funnel may have been dropped in this same transaction.
  if not exists (select 1 from public.lead_funnels where id = target_funnel) then
    return null;
  end if;

  select string_agg(k::text, ', ')
    into missing
    from unnest(array['entrada','ganho','perda']::public.lead_funnel_stage_kind[]) as k
   where not exists (
     select 1 from public.lead_funnel_stages s
      where s.funnel_id = target_funnel and s.kind = k
   );

  if missing is not null then
    raise exception 'funnel % is missing required stage kind(s): %', target_funnel, missing;
  end if;
  return null;
end $$;

create constraint trigger lead_funnel_stages_require_terminals
  after insert or update or delete on public.lead_funnel_stages
  deferrable initially deferred
  for each row execute function public.assert_funnel_has_terminal_stages();

comment on table public.lead_funnel_entries is
  'Lead participation in a funnel. estimated_value lives here, not on the lead: a lead in two funnels is two distinct revenues.';
