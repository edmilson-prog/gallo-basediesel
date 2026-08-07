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
| **Admin** | *nenhum* — `/app/configuracoes` só redireciona p/ `.../perfil` | `["Owner"]` | 🔴 o Gestor tem **18 telas** dentro de Configurações e nenhuma porta de entrada rotulada |

> ⚠️ O item **Admin** foi classificado equivocadamente como "Owner-only coerente"
> na primeira passagem desta auditoria — o rótulo sugeria restrição, mas o destino
> não tem guard algum. Corrigido em seguida (PR #378). Lição: o nome do item não
> é evidência; só o `beforeLoad` da rota é.
>
> Telas de Configurações que o Gestor já podia usar, todas inalcançáveis sem esse
> item: Perfil, Aparência, Tours & Ajuda, Notificações, Copiloto, Papéis, Lojas,
> Templates WhatsApp, Pipeline de leads, Motivos de perda, Tags, Frete, Biblioteca
> de ativos, Respostas rápidas, Mídias, Simulador SDR, Auditoria e Sobre.

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

O único genuinamente Owner-only por permissão (coerente, sem ação) é
**Saúde do Sistema** — gated em `monitor`, que só o Owner possui na matriz.

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

---

# Parte 2 — Acesso do Gestor à área de Configurações (2026-08-07)

Sequência da mesma investigação, agora sobre as telas **dentro** de Configurações.
Motivador: o dono promoveu um segundo usuário a Gestor e relatou que "não exibe
todos os menus dentro de Admin".

## Estado anterior

O Gestor via **19 das 46** telas. As 27 restantes estavam presas de duas formas:

- **Allowlist `roles: ["Owner"]`** no `SettingsLayout` (22 telas);
- **Permissões que ele não tinha** — `settings.edit`, `seller.edit`,
  `inventory.edit`, `ecommerce_integration` (5 telas).

## A descoberta que definiu o desenho da correção

As rotas operacionais carregavam **os dois portões ao mesmo tempo**:

```ts
requireAuth(location.pathname, ["Owner"], { resource: "settings", action: "edit" })
```

e `requireAuth` exige satisfazer **ambos**. Logo o teto de papel tornava qualquer
concessão na matriz **inerte**: conceder `settings.edit` ao Gestor faria o item
aparecer no menu (que olha só a permissão) e a tela bloquear — o bug da Parte 1
ao contrário. Na prática, **o Editor de Papéis só conseguia restringir, nunca
ampliar** — o gap nº 3 da auditoria de granularidade se manifestando.

Por isso a correção não foi somar `"Gestor"` a 20 listas fixas: onde já existia
recurso RBAC, **o teto de papel foi removido** e a permissão ficou como gate
único. Essas telas passaram a ser governadas pelo Editor de Papéis de verdade.

## O que mudou

| Categoria | Telas | Tratamento |
|---|---|---|
| Rota com `["Owner"]` + `settings.edit` | Distribuição, Ciclo de vida, Horário comercial, Cadastro de veículos, Alertas de ociosidade, Resgate de conversas, Continuidade, Sons, Templates SDR, Insights | teto removido; menu migrado de `roles` para `permission` |
| Rota com `["Owner"]` + outro recurso | Estoque (análise) `inventory.edit`, E-commerce `ecommerce_integration.edit` | idem |
| Rota já admitia Gestor | Vitrine pública | só o menu divergia — corrigido para `storefront_admin.view` |
| Sem recurso RBAC natural | Orçamento automático SDR, Gamificação, Comissões, Forecast, Divisões, Usuários | `"Gestor"` somado à allowlist (rota + menu) |
| Só matriz | Departamentos | destravado por `seller.edit`, sem tocar em código |

Concessões na matriz (`matrix.ts` **e** migration `20260807120000` — os dois
precisam ficar em paridade, senão o fallback estático diverge do banco):
`settings` → `[view, edit]`, `seller` → `[view, edit]`, `inventory` →
`[view, edit]`, `ecommerce_integration` → `[view, edit]` (novo).

Resultado: **39 de 46**.

## O que segue Dono-only (decisão do dono)

Chaves & API · WhatsApp · Inteligência artificial · Ambiente & Dados · Segurança
da sessão · Portal do cliente · Financeiro/DRE.

São telas onde um erro vaza credencial ou derruba a plataforma, mais o P&L.

## Tela de Usuários: nenhuma Edge Function foi afrouxada

O Gestor passou a alcançar `/app/configuracoes/usuarios`, mas as operações
perigosas continuam com o Dono. Isso já era verdade nas Edges — só faltava a UI
acompanhar:

| Operação | Edge | Guarda | Gestor |
|---|---|---|---|
| Convidar | `invite-seller` | `STAFF_ROLES` | ✅ |
| Redefinir senha | `reset-seller-password` | `STAFF_ROLES` | ✅ |
| Ligar/desligar acesso | `set-seller-access` | `STAFF_ROLES` | ✅ |
| Alterar e-mail | `set-seller-email` | `STAFF_ROLES` | ✅ |
| **Alterar papel** | `set-seller-role` | `["owner"]` | ❌ (já oculto na UI) |
| **Remover 2FA** | `reset-seller-mfa` | `["owner"]` | ❌ (já oculto na UI) |
| **Excluir** | `delete-seller` | `["owner"]` | ❌ (**gate adicionado** — o botão aparecia e dava 403) |

Consequência: **nenhum deploy de Edge Function é necessário** neste PR.

## Testes

`SettingsLayout.test.ts` (novo) fixa o contrato: o Owner vê tudo; o Gestor vê
tudo menos os 7 acima; o Vendedor segue restrito ao pessoal; e as telas
operacionais têm gate de permissão (não de papel). A regra de visibilidade foi
extraída para `isSettingsItemVisible()`, exportada e testável sem montar o layout.

## Continua pendente

O bug da raiz `/` (`src/routes/index.tsx`) segue vivo: quem não é Owner, Vendedor
ou Cliente — inclusive o Gestor — cai em `/sem-permissao` ao abrir o domínio sem
caminho. Não foi tocado aqui para manter o PR coeso.
