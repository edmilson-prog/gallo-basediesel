-- Gestor: acesso à área de Configurações (decisão do dono, 2026-08-07).
--
-- Contexto: o Gestor enxergava 19 das 46 telas de Configurações. As demais
-- estavam presas de duas formas — ou por uma allowlist `roles: ["Owner"]` no
-- código, ou por permissões que ele não tinha. Pior: as rotas operacionais
-- carregavam AMBOS os portões (`requireAuth(path, ["Owner"], { settings.edit })`)
-- e o `requireAuth` exige satisfazer os dois, então o teto de papel tornava
-- qualquer concessão na matriz inerte — o Editor de Papéis só conseguia
-- restringir, nunca ampliar.
--
-- O PR remove esse teto das rotas que já declaram permissão, de modo que a
-- matriz passa a governá-las de fato. Estas linhas são a outra metade: sem
-- elas, `usePermission(...)` devolve false e as telas continuam inalcançáveis
-- (mesma lição de 20260806221700_rbac_funnel_grant_staff).
--
-- Espelha `src/features/rbac/permissions/matrix.ts` (GESTOR_ENTRIES) — os dois
-- precisam ficar em paridade, senão o fallback estático pré-hidratação diverge
-- do banco e a tela pisca de estado.
--
-- O que cada concessão destrava:
--   settings.edit  → Distribuição, Ciclo de vida, Horário comercial, Cadastro de
--                    veículos, Sons, Alertas de ociosidade, Resgate e
--                    Continuidade de conversas, Insights, templates SDR e a
--                    edição de Frete (que ele já via somente-leitura).
--   seller.edit    → Departamentos e a fila de Rodízio (administração de equipe).
--                    NÃO concede atribuir papel: `set-seller-role` e
--                    `delete-seller` seguem exigindo `owner`, e a UI espelha isso.
--   inventory.edit → Estoque (análise).
--   ecommerce_integration → Integração E-commerce.
--
-- Fora do escopo por decisão do dono (seguem Dono-only, via allowlist no
-- código): Chaves & API, WhatsApp, Inteligência artificial, Ambiente & Dados,
-- Segurança da sessão, Portal do cliente e Financeiro/DRE.
--
-- Idempotente: `on conflict (role_id, resource)` reescreve ações e escopo.

-- 1) Amplia as três permissões que o Gestor já possuía como somente-leitura.
insert into public.role_permissions (role_id, resource, actions, scope)
select r.id, v.resource, v.actions, 'store'
  from public.roles r
 cross join (values
        ('settings',  array['view','edit']::text[]),
        ('seller',    array['view','edit']::text[]),
        ('inventory', array['view','edit']::text[])
      ) as v(resource, actions)
 where r.base_role = 'Gestor'
on conflict (role_id, resource) do update
   set actions = excluded.actions,
       scope   = excluded.scope;

-- 2) Recurso que o Gestor ainda não tinha.
insert into public.role_permissions (role_id, resource, actions, scope)
select r.id, 'ecommerce_integration', array['view','edit']::text[], 'store'
  from public.roles r
 where r.base_role = 'Gestor'
on conflict (role_id, resource) do update
   set actions = excluded.actions,
       scope   = excluded.scope;
