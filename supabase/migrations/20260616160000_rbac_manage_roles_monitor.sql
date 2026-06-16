-- PRD-211 Task 16: add the `manage_roles` and `monitor` RBAC resources and
-- grant them to the Owner system role.
--
-- `manage_roles` gates the role editor's write actions (viewing the matrix stays
-- under `role:view`); `monitor` is the seed of a future "monitoring/spy mode" —
-- born here as data, with no active behavior yet. Owner is the only role granted
-- these, mirroring PERMISSIONS_MATRIX (Owner: manage_roles CRUD, monitor view).
--
-- The `rbac_resources` / `role_permissions` tables and their RLS already exist
-- (migration 20260616095122_rbac_roles.sql); this migration only inserts rows.
-- Idempotent via ON CONFLICT so a re-run is a no-op. The sort_order values append
-- after the current maximum (34) — cosmetic ordering only, used by the editor.

insert into public.rbac_resources (key, label, "group", sort_order) values
  ('manage_roles', 'Gerir papéis', 'Configuração', 35),
  ('monitor', 'Monitoramento', 'Configuração', 36)
on conflict (key) do nothing;

-- System role id === slug (see 20260616095122_rbac_roles.sql), so Owner's id is 'Owner'.
insert into public.role_permissions (role_id, resource, actions, scope) values
  ('Owner', 'manage_roles', array['view','create','edit','delete'], 'all'),
  ('Owner', 'monitor', array['view'], 'all')
on conflict (role_id, resource) do nothing;
