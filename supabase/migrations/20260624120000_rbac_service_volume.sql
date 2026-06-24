-- PRD-215 / DELTA-006 — Seed the `service_volume` RBAC resource + Owner/Gestor grants.
--
-- In production the platform hydrates RBAC from the database (roles /
-- role_permissions / rbac_resources, PRD-211), NOT from the frontend static
-- matrix. For the "Atendimento" (service-volume) panel tab and the inbox
-- summary card to appear in production, the `service_volume.view` permission
-- must exist in the persisted catalog. This migration adds it, mirroring the
-- frontend matrix change (`src/features/rbac/permissions/matrix.ts`:
-- Owner scope `all`, Gestor scope `store`) and the seed parity entry
-- (`src/.../seed.ts`: label "Volume de Atendimento", group "Atendimento").
--
-- Additive, idempotent, and non-destructive: it only INSERTs two grants and one
-- resource row, never touching conversations, status, or any existing row
-- (`on conflict ... do nothing`). To reverse it manually:
--   delete from public.role_permissions where resource = 'service_volume';
--   delete from public.rbac_resources where key = 'service_volume';
--
-- Real schema (PRD-211, 20260616095122_rbac_roles.sql):
--   rbac_resources(key text pk, label text, "group" text, sort_order int)
--   role_permissions(role_id text, resource text, actions text[], scope text,
--                    primary key (role_id, resource))
--   roles.id is text ('Owner', 'Gestor', ...).

-- Resource catalog row. sort_order appended after the current max (34) so no
-- existing row is renumbered; the role editor lists it under "Atendimento".
insert into public.rbac_resources (key, label, "group", sort_order) values
  ('service_volume', 'Volume de Atendimento', 'Atendimento', 35)
on conflict (key) do nothing;

-- Grants: Owner sees all stores, Gestor sees its store. `actions` is a text[].
insert into public.role_permissions (role_id, resource, actions, scope) values
  ('Owner', 'service_volume', '{view}', 'all'),
  ('Gestor', 'service_volume', '{view}', 'store')
on conflict (role_id, resource) do nothing;
