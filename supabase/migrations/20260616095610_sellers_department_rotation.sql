-- PRD-211: department link + rotation placeholder (PRD-213).
--
-- `department_id` links a seller to a department (FK to public.departments,
-- whose id is text). `rotation` is a forward-looking jsonb placeholder for
-- the round-robin assignment config landing in PRD-213; it defaults to
-- enabled so existing sellers keep participating in rotation by default.
-- Idempotent DDL so a re-run is a no-op.

alter table public.sellers
  add column if not exists department_id text references public.departments(id);

alter table public.sellers
  add column if not exists rotation jsonb not null default '{"enabled": true}'::jsonb;

create index if not exists idx_sellers_department
  on public.sellers (department_id);
