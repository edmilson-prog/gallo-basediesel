-- PRD-216 (Tally) — registra o recurso `supplies` na matriz persistida.
--
-- O app hidrata permissões DESTAS TABELAS, não da matriz em TypeScript. Sem
-- estas linhas, `hasPermission(user, "supplies", "view")` é falso para todo
-- papel e o grupo SUPRIMENTOS some da sidebar para TODO MUNDO, Owner incluso —
-- é exatamente o tropeço de 20260807140000_seed_contact_rbac_resource.sql.
--
-- Grants espelham src/features/rbac/permissions/matrix.ts (paridade travada
-- por seed.test.ts):
--   Owner      — tudo, todas as lojas
--   Gestor     — tudo, na própria loja
--   Financeiro — só leitura: as duplicatas da nota alimentam o contas a pagar
--                dele, mas lançar move estoque e recalcula custo médio
--
-- Vendedor, VendedorExterno, SDR e Cliente ficam de fora de propósito: custo de
-- compra e margem de fornecedor não são do time comercial.
--
-- sort_order 1 dentro do grupo; a ordenação real da tela vem de
-- buildResourceSeed(), que posiciona Suprimentos entre Catálogo e Financeiro.

insert into public.rbac_resources (key, label, "group", sort_order)
values ('supplies', 'Notas de entrada', 'Suprimentos', 1)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, resource, actions, scope)
values
  ('Owner',      'supplies', array['view','create','edit','delete'], 'all'),
  ('Gestor',     'supplies', array['view','create','edit','delete'], 'store'),
  ('Financeiro', 'supplies', array['view'],                          'store')
on conflict (role_id, resource) do nothing;
