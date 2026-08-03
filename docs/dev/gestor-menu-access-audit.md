# Auditoria de acesso do papel Gestor aos menus (2026-08-03)

Investigação disparada pelo relato: **"o Fernando (Gestor) loga e faltam vários menus"**.

## TL;DR

O RBAC do Fernando está **correto** — banco, JWT, papel e matriz de permissões batem.
O problema é o **menu lateral**: parte dos itens não é governada pela matriz de
permissões, mas por uma allowlist estática `roles: [...]` em
`src/features/shell/config/navigation.ts` — e essa allowlist **nunca recebeu o
Gestor** em vários itens, inclusive em telas cujo próprio guard de rota
(`requireAuth`) já admite Gestor.

Resultado: telas acessíveis por URL, porém **inalcançáveis pela navegação**.

## Cadeia verificada (tudo íntegro)

| Elo | Valor para o Fernando | Situação |
|---|---|---|
| `auth.users` | `a0b3bcb0…` · último login 03/08 11:46 | ✅ |
| `profiles.role` | `manager` | ✅ |
| `profiles.role_id` | `NULL` (sem papel customizado) | ✅ esperado |
| `custom_access_token_hook` | injeta `app_metadata.role = manager` | ✅ |
| `mapDbRoleToRoleName("manager")` | `"Gestor"` | ✅ |
| `roles.slug` = `Gestor`, `base_role` = `Gestor` | — | ✅ |
| RLS `roles`/`role_permissions` | `SELECT true` (authenticated) | ✅ hidratação funciona |
| Matriz persistida (`role_permissions`) × estática (`matrix.ts`) | idênticas para Gestor | ✅ sem divergência |
| `is_staff()` | `role in ('owner','manager')` → **true** | ✅ RLS não bloqueia |

Ou seja: **nenhum item matrix-driven do menu está sendo escondido indevidamente.**
Todos os itens com `permission: { resource }` aparecem corretamente para o Gestor
(Atendimento, Clientes, Leads, Veículos, Catálogo, Kits, Orçamentos, Pedidos,
Admin da Loja, Metas, Indicadores, Despesas, Fluxo de Caixa, Movimentação,
Insights).

## Causa raiz

`isNavItemVisible()` é um gate híbrido: `permission` (matriz, editável pelo Editor
de Papéis) **ou** `roles` (allowlist estática). Os itens estruturais ficaram na
allowlist e ela envelheceu — foi escrita quando só Owner e Vendedor eram perfis
reais em uso.

### Contradições objetivas corrigidas

| Item | Guard da rota (`requireAuth`) | Allowlist do menu (antes) | Efeito |
|---|---|---|---|
| **Início** | *sem guard próprio*; `/app` = Owner/Gestor/Vendedor | `["Owner","Vendedor"]` | 🔴 grave — renderiza o **ManagerDashboardPage** e é o `defaultRedirectForRole("Gestor")`: o Gestor era jogado, no login, numa página ausente do próprio menu |
| **Carteira** | `["Owner","Gestor"]` | `["Owner"]` | acessível por URL, invisível no menu |
| **Painel SDR** | `["Owner","Gestor"]` | `["Owner"]` | idem |
| **Ranking** | `["Owner","Gestor","Vendedor","Financeiro"]` | `["Owner","Vendedor"]` | idem |
| **Perfil** | só `requireAuth` (qualquer logado) | `["Owner","Vendedor"]` | o `SettingsLayout` libera para os 6 papéis — as duas listas divergiam |
| **Aparência** | sem guard | `["Owner","Vendedor"]` | idem |

### Mobile: navegação zero

`BOTTOM_NAV` era `Record<"Owner" | "Vendedor", …>` e `pickItemsForRole()` retornava
`[]` para Gestor. Como `BottomNav` faz `if (items.length === 0) return null` e o
`<Sidebar/>` é `hidden md:flex`, **o Gestor ficava sem nenhuma navegação no
celular** — preso na página em que caísse.

## Correções aplicadas

- `navigation.ts`: Gestor incluído em **Início**, **Carteira**, **Painel SDR**,
  **Ranking**; **Perfil** e **Aparência** passam a espelhar o `SettingsLayout`
  (todos os papéis de staff).
- `BOTTOM_NAV` ganhou a entrada **Gestor** (Início · Atend. · Clientes · Gestão) e
  `pickItemsForRole()` passou a resolvê-la.
- `navigation.test.ts`: dois testes de regressão — todo item estrutural cujo guard
  de rota admite Gestor precisa listá-lo, e as entradas pessoais valem para todo
  papel de staff.

## Pendente de decisão do dono (NÃO alterado)

Itens em que a matriz **concede** `view` ao Gestor mas o menu o esconde
deliberadamente (comentado como decisão de produto no próprio arquivo). A rota
libera o acesso — só o item do menu está oculto:

| Item | Recurso | Gestor tem `view`? | Menu hoje |
|---|---|---|---|
| DRE Gerencial | `dre` | sim | Owner-only |
| Rentabilidade | `profitability` | sim | Owner-only |
| Estoque | `inventory` | sim | Owner-only |

E os genuinamente Owner-only por permissão (coerentes, sem ação):
**Saúde do Sistema** (`monitor`) e **Admin** (`/app/configuracoes`).

## Achados laterais (fora do escopo, não corrigidos)

1. **`Financeiro` não consegue entrar no app.** `defaultRedirectForRole("Financeiro")`
   aponta para `/app/inicio`, mas o guard de `/app` é
   `["Owner","Gestor","Vendedor"]` → todo login Financeiro cai em `/sem-permissao`.
   Sem usuário Financeiro cadastrado hoje, então é latente.
2. **`sellers.auth_user_id` nulo** em 8 dos 9 vendedores internos (só o Owner tem).
   Não afeta o frontend (a identidade vem de `profiles`) nem a RLS do Fernando
   (ele é `is_staff()`), mas quebra o predicado `auth_user_id = auth.uid()` da
   policy `sellers_update` para quem **não** é staff — ou seja, um Vendedor não
   consegue editar o próprio cadastro por esse caminho.
3. **`profiles.role_id` é `NULL` para todos.** Nenhum papel customizado em uso —
   o Editor de Papéis governa apenas os 7 papéis de sistema hoje.
