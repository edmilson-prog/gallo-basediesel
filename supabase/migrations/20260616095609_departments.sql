-- PRD-211: revive ITeam as Department.
--
-- The original mock-era `ITeam` modelled an internal grouping of sellers
-- (a "team"). PRD-211 brings it back as a first-class Department: a
-- store-scoped grouping with an optional manager. Department membership is
-- NOT stored here — members are derived from `sellers.department_id`
-- (added by the companion migration), so a department has no `seller_ids`
-- column. Keeping membership on the seller side avoids a redundant join
-- table and keeps a single source of truth.
--
-- Types match production: `stores.id` and `sellers.id` are both `uuid`, so
-- `store_id`/`manager_id` are uuid FKs. `departments.id` is `text`
-- (default gen_random_uuid()::text), matching the `roles` table convention, and
-- `sellers.department_id` is therefore text-to-text. Reads are open to any member
-- (the management screen lists departments); writes are STAFF-only
-- (Owner/Gestor), reusing the canonical `is_staff()` predicate wrapped in a
-- SELECT for InitPlan caching — mirroring the `message_templates` write
-- policy pattern. Idempotent DDL so a re-run is a no-op.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table if not exists public.departments (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  store_id uuid not null references public.stores(id),
  manager_id uuid references public.sellers(id),
  created_at timestamptz not null default now()
);

comment on table public.departments is
  'PRD-211: departments (revived ITeam). Store-scoped grouping of sellers with an optional manager. Membership is derived from sellers.department_id (no member column here).';

create index if not exists idx_departments_store
  on public.departments (store_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.departments enable row level security;

-- SELECT: any authenticated member can read the department list.
create policy "departments_select"
  on public.departments for select to authenticated
  using (true);

-- Writes: STAFF-only (Owner/Gestor), reusing the canonical is_staff()
-- predicate wrapped in a SELECT for InitPlan caching (same shape as
-- message_templates write policies).
create policy "departments_write"
  on public.departments for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));
