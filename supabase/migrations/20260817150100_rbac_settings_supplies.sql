-- PRD-216 (Tally) — recurso RBAC da tela de configuração de notas fiscais.
--
-- Mesmo motivo do 20260817130000: o app hidrata permissões destas tabelas, e
-- recurso que existe só no TypeScript esconde a tela de TODOS os papéis.
--
-- Owner configura; Gestor vê como está, mas não muda origem de ingestão —
-- ligar e-mail ou SEFAZ mexe em credencial e certificado, que é decisão do
-- dono. Espelha src/features/rbac/permissions/matrix.ts.

insert into public.rbac_resources (key, label, "group", sort_order)
values ('settings_supplies', 'Notas fiscais', 'Configuração', 1)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, resource, actions, scope)
values
  ('Owner',  'settings_supplies', array['view','edit'], 'all'),
  ('Gestor', 'settings_supplies', array['view'],        'store')
on conflict (role_id, resource) do nothing;
