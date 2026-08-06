-- Multi-funil fase 6, complemento: conceder `funnel` a Dono e Gestor.
--
-- A migration anterior (20260806180000_rbac_funnel_resource) registrou o
-- recurso em `rbac_resources`, o que só faz a linha APARECER no editor de
-- papéis. Quem decide se alguém pode abrir a tela é `role_permissions`, que é
-- de onde a matriz RBAC hidrata em produção — `matrix.ts` é semente para o
-- mock, não fonte de verdade em runtime.
--
-- Sem estas linhas, `usePermission("funnel", …)` devolve false para todo
-- mundo, o item "Funis" não aparece no menu e a tela fica inalcançável — o que
-- foi exatamente o estado logo após aplicar só a primeira migration.
--
-- Espelha `matrix.ts`: Owner CRUD/all, Gestor CRUD/store. Vendedores não
-- recebem — administrar funil é decisão de estrutura comercial, e o que um
-- vendedor ALCANÇA é governado por `lead_funnel_access`, que é outra coisa.
--
-- Idempotente: `on conflict (role_id, resource)` reescreve ações e escopo.

insert into public.role_permissions (role_id, resource, actions, scope)
select r.id,
       'funnel',
       array['view','create','edit','delete']::text[],
       case when r.base_role = 'Owner' then 'all' else 'store' end
  from public.roles r
 where r.base_role in ('Owner', 'Gestor')
on conflict (role_id, resource) do update
   set actions = excluded.actions,
       scope   = excluded.scope;
