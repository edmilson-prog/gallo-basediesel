-- Settings areas that were governed by hardcoded role allowlists.
--
-- Before this migration, 25 of the 47 screens under /app/configuracoes decided
-- visibility with a `roles: [...]` array baked into SettingsLayout and/or the
-- route guard. None of them appeared in the Role Editor, so the Owner could not
-- delegate (or revoke) them — the matrix simply had no row to check.
--
-- Seven resources are added here, one per administrative domain. The grain is
-- deliberately coarser than one-per-screen: a resource per screen would push the
-- matrix past 70 rows and make the Role Editor unreadable.
--
-- The Gestor grants below reproduce EXACTLY the access the Gestor already had
-- through the allowlists they replace — this migration widens nothing:
--   settings_users       Usuários                     was ["Owner","Gestor"]
--   settings_whatsapp    Templates WhatsApp (view)    was ["Owner","Gestor"]
--                        Contas WhatsApp    (edit)    was ["Owner"] -> no Gestor
--   settings_sdr         Simulador/Templates/Orçamento was ["Owner","Gestor"]
--   settings_automation  Ociosidade/Resgate/Continuidade/Sons was settings:edit
--   settings_api_keys    Chaves & API                 was ["Owner"] -> Owner only
--   settings_ai          Inteligência artificial      was ["Owner"] -> Owner only
--   settings_system      Ambiente & Dados / Sessão    was ["Owner"] -> Owner only
--
-- Mirrors PERMISSIONS_MATRIX in src/features/rbac/permissions/matrix.ts.
-- The `rbac_resources` / `role_permissions` tables and their RLS already exist
-- (20260616095122_rbac_roles.sql); this migration only inserts rows.
-- Idempotent via ON CONFLICT so a re-run is a no-op. sort_order appends after
-- the current maximum (36) — cosmetic ordering used by the editor.

insert into public.rbac_resources (key, label, "group", sort_order) values
  ('settings_users',      'Usuários',                   'Configuração', 37),
  ('settings_whatsapp',   'WhatsApp & Templates',       'Configuração', 38),
  ('settings_api_keys',   'Chaves & API',               'Configuração', 39),
  ('settings_ai',         'Inteligência artificial',    'Configuração', 40),
  ('settings_sdr',        'Agente SDR',                 'Configuração', 41),
  ('settings_automation', 'Automações de atendimento',  'Configuração', 42),
  ('settings_system',     'Sistema & Sessão',           'Configuração', 43)
on conflict (key) do nothing;

-- System role id === slug (see 20260616095122_rbac_roles.sql).
insert into public.role_permissions (role_id, resource, actions, scope) values
  ('Owner',  'settings_users',      array['view','edit'], 'all'),
  ('Owner',  'settings_whatsapp',   array['view','edit'], 'all'),
  ('Owner',  'settings_api_keys',   array['view','edit'], 'all'),
  ('Owner',  'settings_ai',         array['view','edit'], 'all'),
  ('Owner',  'settings_sdr',        array['view','edit'], 'all'),
  ('Owner',  'settings_automation', array['view','edit'], 'all'),
  ('Owner',  'settings_system',     array['view','edit'], 'all'),
  ('Gestor', 'settings_users',      array['view','edit'], 'store'),
  ('Gestor', 'settings_whatsapp',   array['view'],        'store'),
  ('Gestor', 'settings_sdr',        array['view','edit'], 'store'),
  ('Gestor', 'settings_automation', array['view','edit'], 'store')
on conflict (role_id, resource) do nothing;
