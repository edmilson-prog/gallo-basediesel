-- Register the `contact` RBAC resource in the persisted matrix.
--
-- The app hydrates permissions from these tables, not from the TypeScript
-- matrix — that one is UX discipline and the seed's source, but the running
-- app asks the database. Task 9 added `contact` to the code; without this row
-- `hasPermission(user, "contact", "view")` is false for every role, so the
-- Agenda's sidebar entry is hidden from everyone even though the screen works
-- when reached directly by URL.
--
-- Grants mirror `customer`, which is the rule: a role that cannot see
-- customers has no business seeing their contacts. Two deliberate deviations,
-- matching src/features/rbac/permissions/matrix.ts:
--   - Vendedor gains `create` (adding a phonebook entry is far less sensitive
--     than creating a customer with CNPJ and a wallet, and "Novo contato" is
--     the kit's primary action)
--   - SDR is narrower, not wider: `own` instead of customer's `store`

insert into public.rbac_resources (key, label, "group", sort_order)
values ('contact', 'Agenda', 'Comercial', 1)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, resource, actions, scope)
values
  ('Owner',           'contact', array['view','create','edit','delete'], 'all'),
  ('Gestor',          'contact', array['view','create','edit','delete'], 'store'),
  ('Vendedor',        'contact', array['view','create','edit'],          'own'),
  ('VendedorExterno', 'contact', array['view','edit'],                   'own'),
  ('SDR',             'contact', array['view'],                          'own'),
  ('Financeiro',      'contact', array['view'],                          'store')
on conflict (role_id, resource) do nothing;
