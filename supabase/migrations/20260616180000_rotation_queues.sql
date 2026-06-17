-- PRD-213: rotation queue (one per store) + participants.
--
-- The attendance rotation ("rodízio") is a first-class, per-store queue that
-- governs the routine "revezamento" of inbound conversations. One queue per
-- store (`unique (store_id)`); participants are either TOP-LEVEL (scope null —
-- sellers in `direct` mode, departments in `department` mode) or INTERNAL
-- members of a department (scope set). The internal-department pointer lives on
-- the department's own participant row (`last_assigned_member_id`).
--
-- Types match production: `stores.id`/`sellers.id` are uuid; `departments.id`
-- is text. `ref_id` holds either a seller uuid or a department text id, so it is
-- text. RLS mirrors the `departments` pattern from the same epic: reads open to
-- any authenticated member (the management screen lists the queue); writes are
-- STAFF-only (Owner/Gestor) via the canonical `is_staff()` predicate wrapped in
-- a SELECT for InitPlan caching. Additive + idempotent DDL.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.rotation_queues (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  target_mode text not null default 'direct' check (target_mode in ('direct','department')),
  last_assigned_ref_id text,
  skip_offline boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id)
);

comment on table public.rotation_queues is
  'PRD-213: attendance rotation queue, one per store. targetMode direct|department; last_assigned_ref_id is the fairness pointer.';

create table if not exists public.rotation_participants (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null references public.rotation_queues(id) on delete cascade,
  scope_department_id text references public.departments(id) on delete cascade,
  ref_type text not null check (ref_type in ('seller','department')),
  ref_id text not null,
  "order" integer not null default 0,
  enabled boolean not null default true,
  last_assigned_member_id text
);

comment on table public.rotation_participants is
  'PRD-213: queue participants. scope_department_id null = top-level; set = internal member of that department. last_assigned_member_id is the per-department internal pointer (on the department row).';

create index if not exists idx_rotation_participants_queue
  on public.rotation_participants (queue_id);
create index if not exists idx_rotation_participants_scope
  on public.rotation_participants (scope_department_id);

-- ---------------------------------------------------------------------------
-- Row Level Security (mirrors the departments pattern: read open, write staff)
-- ---------------------------------------------------------------------------

alter table public.rotation_queues enable row level security;
alter table public.rotation_participants enable row level security;

create policy "rotation_queues_select"
  on public.rotation_queues for select to authenticated
  using (true);

create policy "rotation_queues_write"
  on public.rotation_queues for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy "rotation_participants_select"
  on public.rotation_participants for select to authenticated
  using (true);

create policy "rotation_participants_write"
  on public.rotation_participants for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));
