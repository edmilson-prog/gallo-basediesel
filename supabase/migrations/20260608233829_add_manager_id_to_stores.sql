-- PRD-107 owner<->seller link: stores gain a manager_id (the gestor seller who
-- receives manager-targeted derived notifications). Nullable + FK to sellers.
alter table public.stores
  add column if not exists manager_id uuid references public.sellers(id);

comment on column public.stores.manager_id is
  'Gestor seller for the store (recipient of manager-targeted derived notifications). Nullable.';
