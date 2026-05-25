# PRD-006: Sistema de Roles, Permissões e Auditoria (visual)

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                                                                  |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                                                                                       |
| **Objetivo**          | Implementar o modelo de RBAC com matriz completa de permissões para os 7 papéis, helpers e componentes de verificação fina (resource × action × scope), telas read-only de visualização de papéis e auditoria — preparando o terreno para a implementação real na Fase 2 com Supabase RLS |
| **Tipo**              | Feature                                                                                                                                                                                                                                                                                   |
| **Complexidade**      | Alta                                                                                                                                                                                                                                                                                      |
| **Total de Fases**    | 5                                                                                                                                                                                                                                                                                         |
| **Prioridade**        | Alta                                                                                                                                                                                                                                                                                      |
| **Épico**             | Bloco 0 — Fundação                                                                                                                                                                                                                                                                        |
| **PRDs Relacionados** | PRD-002 (Modelo Conceitual), PRD-003 (Shell), PRD-004 (Mocks), PRD-005 (Provider Pattern)                                                                                                                                                                                                 |
| **Implementação**     | 🔵 Claude Code CLI (sobre o scaffold do Lovable)                                                                                                                                                                                                                                          |
| **Padrão de código**  | RBAC em `src/features/rbac/`; matriz de permissões em `src/features/rbac/permissions/`; helpers em `src/features/rbac/utils/`; componentes em `src/features/rbac/components/`                                                                                                             |

### Critérios de Complexidade Utilizados

| Complexidade | Critérios                                                       |
| ------------ | --------------------------------------------------------------- |
| **Baixa**    | 1 arquivo, sem dependências externas, < 100 linhas              |
| **Média**    | 2-5 arquivos, banco OU integração, funcionalidade isolada       |
| **Alta**     | 5+ arquivos, múltiplas integrações, regras de negócio complexas |

> **Justificativa de Alta:** matriz de permissões para 7 papéis × 16+ recursos × 5 ações × 4 scopes (centenas de células), helpers de verificação com lógica de hierarquia de scope, hook reativo a troca de papel, componentes de renderização condicional (`<Can>`, `<Forbidden>`), 2 telas de configuração (papéis read-only + auditoria com filtros), integração com `<GuardedRoute>` do PRD-003, geração de logs mockados, e exigência de ser semanticamente compatível com Supabase RLS futuro.

---

## Contexto do Problema

O PRD-003 entregou role guards básicos: `<GuardedRoute roles={['Owner', 'Vendedor']}>` protege rotas inteiras por papel. Funciona para o nível macro de navegação, mas é grosseiro demais para o que a plataforma realmente precisa: **permissões finas, por recurso e por ação**.

Sem um sistema completo de RBAC, três problemas concretos aparecem assim que o Bloco 1 começa:

**Componentes de UI não sabem o que esconder.** O botão "Excluir cliente" deve aparecer para Owner mas não para Vendedor. O botão "Aprovar comissão" só para Owner e Financeiro. O botão "Adicionar nota" para qualquer um da carteira. Sem helpers reativos, cada componente reinventa a verificação — e cada um esquece um caso. **Scope (own / team / store / all) não é implementado.** Um Vendedor deve ver "meus clientes" e não "todos os clientes". Um Gestor deve ver "clientes da minha loja", não "clientes de qualquer loja". Sem o conceito de scope embutido no helper, cada lista vira uma string de filtragem manual no consumidor — frágil e incompleto. **Auditoria fica esquecida.** O modelo prevê `IAuditLog`, mas se ninguém implementa a tela e nem os pontos de logging, na hora que o cliente perguntar "quem alterou esse cliente ontem?" não temos resposta.

Importante notar o que este PRD **não** resolve: segurança real. Tudo aqui é frontend mockado — a verdadeira proteção (Supabase RLS, JWT, server-side checks) entra na Fase 2 (PRDs 100+). Mas a **estrutura conceitual e a UI** precisam estar prontas agora, para que a Fase 2 implemente o backend equivalente sem renegociar permissões a cada feature.

Este PRD entrega: matriz canônica de permissões, helpers reativos, dois componentes de renderização condicional (`<Can>` e `<Forbidden>`), duas telas administrativas (papéis read-only e auditoria mockada), pontos de logging acoplados às mutações dos providers do PRD-005, e a integração fina com `<GuardedRoute>`.

---

## Conceito da Solução

### Modelo de permissão (revisão do PRD-002)

O PRD-002 já estabeleceu o tipo `IPermission`:

```typescript
IPermission {
  resource: string;                                        // ex: 'customer', 'order', 'commission'
  actions: ('view' | 'create' | 'edit' | 'delete' | 'approve')[];
  scope: 'own' | 'team' | 'store' | 'all';
}
```

E `IRole`:

```typescript
IRole {
  id: ID;
  name: 'Owner' | 'Gestor' | 'Vendedor' | 'SDR' | 'Cliente' | 'VendedorExterno' | 'Financeiro';
  permissions: IPermission[];
}
```

Os 7 papéis recebem permissões hardcoded **neste PRD**, em `src/features/rbac/permissions/matrix.ts`. Na Fase 2, essas permissões viram registros no banco editáveis por Owner; no MVP são imutáveis (a tela de papéis é read-only).

### Hierarquia de scope

Scope tem ordem: `own < team < store < all`. Quando alguém tem permissão com scope `store`, ele tem implicitamente `team` e `own` também. O helper de verificação respeita essa hierarquia.

| Scope   | Significado                                                                               | Quem tipicamente tem           |
| ------- | ----------------------------------------------------------------------------------------- | ------------------------------ |
| `own`   | Apenas registros vinculados diretamente ao próprio usuário (sua carteira, suas conversas) | Vendedor, VendedorExterno, SDR |
| `team`  | Registros da própria equipe (equipe dormente no MVP — equivalente a `own` por enquanto)   | _Reservado para Fase 2_        |
| `store` | Todos os registros da própria loja                                                        | Gestor, Financeiro             |
| `all`   | Tudo, em todas as lojas                                                                   | Owner                          |

### Recursos cobertos

A matriz de permissões cobre os seguintes recursos (mapeáveis aos providers do PRD-005):

```
customer, vehicle, lead, conversation, message, part, quote, order,
commission, goal, recommendation, transfer, segment, seller, store,
settings, audit_log, role
```

Total: **18 recursos × 5 ações × 4 scopes = 360 células possíveis** — mas a maioria é trivial (Owner tem tudo, Cliente quase nada). A matriz real tem ~150 entradas significativas.

### Componentes de consumo

Três interfaces para os componentes verificarem permissão:

1. **Helper síncrono** `hasPermission(user, resource, action, scope?)` — para uso em qualquer lugar (utils, services, condicionais inline)
2. **Hook reativo** `usePermission(resource, action, scope?)` — para componentes React; rerenderiza ao trocar perfil
3. **Componente declarativo** `<Can resource="customer" action="delete">{...}</Can>` — para renderização condicional limpa

### Auditoria visual

A tela `/app/configuracoes/auditoria` (Owner-only) mostra:

- Lista paginada de `IAuditLog` ordenada por timestamp desc
- Filtros: ator (vendedor), ação, recurso, faixa de data
- Detalhe expandível mostrando `before` e `after` (JSON formatado)
- Botão de export (CSV — placeholder no MVP, real na Fase 2)

Logs são gerados de duas formas:

1. **Histórico**: ~40 logs mockados pelo PRD-004 distribuídos nos últimos 30 dias
2. **Runtime**: a partir deste PRD, mutações em providers (create/update/delete) registram log via helper `auditLog(action, resource, resourceId, before, after)`

### Alternativas Consideradas

| Alternativa                                                   | Por que foi descartada                                                                                                |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| RBAC apenas no servidor (Supabase RLS) — sem nada no frontend | Componentes de UI precisariam saber permissões via API ou tentar ações e ver se falham — UX ruim                      |
| ACLs por registro (cada cliente tem lista de quem pode ver)   | Complexidade desnecessária no MVP; modelo de role + scope é suficiente                                                |
| Editor de papéis no MVP                                       | Fora do escopo do MVP; tela read-only mostra o conceito, edição entra na Fase 2                                       |
| Logar tudo (cada view de cliente vira um audit)               | Inflaria o log com ruído; logar apenas **mutations** (create/update/delete) e ações sensíveis (login, troca de papel) |
| Permissões como bitmasks ou flags numéricas                   | Mais compacto mas ilegível; preferir strings literais por clareza no debugging                                        |

**Decisão consolidada:** **RBAC frontend com matriz hardcoded para 7 papéis, scope hierárquico, helpers + hook + componente declarativo, e auditoria visual com log retroativo (mockado) + log de runtime (mutações via providers).**

---

## Matriz de Permissões — Resumo por Papel

A matriz completa fica em `src/features/rbac/permissions/matrix.ts`. Resumo conceitual:

### Owner

**Permissões totais.** `*:*:all` em todos os recursos exceto `audit_log` (apenas view+all, sem delete — auditoria é imutável).

### Gestor

Tudo dentro da própria loja: `view+create+edit+delete:store` em customer/vehicle/lead/conversation/quote/order/segment/transfer; `approve:store` em commission e quote; `view:store` em seller, settings, audit_log; sem acesso a `role`.

### Vendedor

`view+edit:own` em customer (apenas da sua carteira), vehicle, lead, conversation, quote; `view+create:own` em message; `view+create+edit:own` em segment; `view:store` em part (catálogo é visível para todos); `view:own` em order, commission, goal, recommendation; sem acesso a transfer, settings, audit_log, role, seller (lista geral).

### SDR

`view+create:own` em conversation, message, lead, quote (o SDR cria conversas e orçamentos como agente, mas não edita o que vendedores fizeram); `view:store` em part, customer (precisa identificar quem está conversando), vehicle; sem acesso a order, commission, goal, transfer, segment, settings, audit_log, role.

### Cliente

`view:own` em quote, order, vehicle (do próprio cliente); `view:store` em part (catálogo público); `create:own` em conversation, message (pode iniciar atendimento); sem acesso a customer (ele é o customer), seller, commission, goal, recommendation, transfer, segment, settings, audit_log, role.

### VendedorExterno

Espelha Vendedor mas com região atribuída — no MVP, equivalente a Vendedor (regiões viram filtro na Fase 2).

### Financeiro

`view:store` em customer, order, quote; `view+approve:store` em commission; `view:store` em goal, audit_log; sem acesso a operações comerciais (create/edit/delete em pedidos/orçamentos), sem acesso a conversation/message/lead.

### Resumo em tabela

| Recurso        | Owner    | Gestor       | Vendedor | SDR     | Cliente | VendExt | Financeiro |
| -------------- | -------- | ------------ | -------- | ------- | ------- | ------- | ---------- |
| customer       | CRUD:all | CRUD:store   | VE:own   | V:store | —       | VE:own  | V:store    |
| vehicle        | CRUD:all | CRUD:store   | VE:own   | V:store | V:own   | VE:own  | —          |
| lead           | CRUD:all | CRUD:store   | VE:own   | VC:own  | —       | VE:own  | —          |
| conversation   | CRUD:all | CRUD:store   | VE:own   | VC:own  | VC:own  | VE:own  | —          |
| message        | CRUD:all | C:store      | VC:own   | VC:own  | VC:own  | VC:own  | —          |
| part           | CRUD:all | V:store      | V:store  | V:store | V:store | V:store | V:store    |
| quote          | CRUD:all | CRUD+A:store | VE:own   | VC:own  | V:own   | VE:own  | V:store    |
| order          | CRUD:all | CRUD:store   | V:own    | —       | V:own   | V:own   | V:store    |
| commission     | CRUD:all | A:store      | V:own    | —       | —       | V:own   | VA:store   |
| goal           | CRUD:all | CRUD:store   | V:own    | —       | —       | V:own   | V:store    |
| recommendation | CRUD:all | V:store      | V:own    | V:own   | —       | V:own   | —          |
| transfer       | CRUD:all | CRUD:store   | —        | —       | —       | —       | —          |
| segment        | CRUD:all | CRUD:store   | VCE:own  | —       | —       | VE:own  | —          |
| seller         | CRUD:all | V:store      | V:own    | V:store | —       | V:own   | V:store    |
| store          | CRUD:all | V:own        | —        | —       | —       | —       | V:own      |
| settings       | CRUD:all | V:store      | V:own    | —       | —       | —       | —          |
| audit_log      | V:all    | V:store      | —        | —       | —       | —       | V:store    |
| role           | CRUD:all | V:store      | —        | —       | —       | —       | —          |

> **Legenda:** C=create V=view E=edit D=delete A=approve / `:scope`

---

## Escopo

### Incluído

- ✅ Estrutura `src/features/rbac/` com subpastas:
  - `permissions/` — matriz hardcoded para os 7 papéis
  - `utils/` — helpers de verificação (`hasPermission`, `compareScopes`, `getEffectivePermissions`)
  - `hooks/` — `usePermission`, `useCurrentRole`
  - `components/` — `<Can>`, `<Forbidden>`
  - `pages/` — `RolesPage`, `AuditLogPage`
- ✅ Matriz completa de permissões para 7 papéis × 18 recursos × 5 ações × 4 scopes
- ✅ Helper síncrono `hasPermission(user, resource, action, scope?)` com hierarquia de scope
- ✅ Hook reativo `usePermission(resource, action, scope?)` que reage à troca de perfil
- ✅ Componente `<Can resource="..." action="..." scope="..." fallback={...}>` para renderização condicional
- ✅ Componente `<Forbidden message?>` para exibir mensagem padrão de acesso negado
- ✅ Tela `/app/configuracoes/papeis` (Owner-only) — read-only, mostra os 7 papéis e suas permissões em formato tabular legível
- ✅ Tela `/app/configuracoes/auditoria` (Owner + Gestor + Financeiro) — lista paginada com filtros
- ✅ Função `auditLog(action, resource, resourceId, before, after)` chamada automaticamente nas mutações dos providers do PRD-005
- ✅ Integração com `<GuardedRoute>` do PRD-003: adicionar prop opcional `permission={{ resource, action }}` para verificação fina
- ✅ Helper `getCurrentUserScope(user, resource)` que retorna o melhor scope que o user tem para um recurso (usado por listas para filtrar dados)
- ✅ Documentação `docs/rbac.md` com matriz, exemplos de uso e mapeamento previsto para Supabase RLS (Fase 2)

### Excluído

- ❌ Edição de papéis e permissões pela UI — Fase 2 (PRDs 100+)
- ❌ Permissões por registro (ex: cliente X pode apenas o vendedor Y editar) — não previsto no modelo
- ❌ Implementação real do Supabase RLS — Fase 2
- ❌ Logs de view (apenas mutations registram audit) — design decision
- ❌ Audit log enviado a serviço externo (Sentry, DataDog) — Fase 2
- ❌ Compliance LGPD avançada (anonimização, direito de esquecimento) — Fase 2
- ❌ MFA (autenticação multifator) — Fase 2
- ❌ Sessões e expiração de token — N/A no MVP (auth mockada)
- ❌ Grupos de usuários (além de equipes que já estão dormentes) — fora do escopo
- ❌ Delegação temporária de permissões — fora do escopo

---

## Requisitos Funcionais

### Matriz de permissões

- **RF-001:** Criar `src/features/rbac/permissions/matrix.ts` com objeto `PERMISSIONS_MATRIX` mapeando `RoleName → IPermission[]`.
- **RF-002:** Definir array de constantes `RESOURCES` em `src/features/rbac/permissions/resources.ts` listando os 18 recursos como union type literal: `'customer' | 'vehicle' | 'lead' | ... | 'role'`.
- **RF-003:** Definir array de constantes `ACTIONS` em `src/features/rbac/permissions/actions.ts`: `'view' | 'create' | 'edit' | 'delete' | 'approve'`.
- **RF-004:** Definir constante `SCOPE_ORDER` em `src/features/rbac/permissions/scopes.ts` representando hierarquia: `['own', 'team', 'store', 'all']`.
- **RF-005:** Matriz deve estar tipada de forma que TypeScript valide que cada `resource` listado existe em `RESOURCES` e cada `action` existe em `ACTIONS`.

### Helpers

- **RF-006:** Criar `hasPermission(user: IUser | null, resource: string, action: string, requiredScope?: string): boolean` em `src/features/rbac/utils/hasPermission.ts` que:
  - Retorna `false` se `user` for null
  - Localiza o papel do user em `PERMISSIONS_MATRIX`
  - Verifica se há permissão para o `resource` que contém a `action` solicitada
  - Se `requiredScope` informado, verifica se o scope do user é ≥ scope requerido (na hierarquia)
- **RF-007:** Criar `compareScopes(scopeA, scopeB): -1 | 0 | 1` em `src/features/rbac/utils/compareScopes.ts` baseado em `SCOPE_ORDER`.
- **RF-008:** Criar `getEffectivePermissions(user): IPermission[]` que retorna as permissões consolidadas do user atual (útil para introspecção/debug).
- **RF-009:** Criar `getCurrentUserScope(user, resource): Scope | null` que retorna o melhor scope que o user tem para o resource (usado pelos hooks de listagem para filtrar).

### Hook reativo

- **RF-010:** Criar `usePermission(resource: string, action: string, requiredScope?: string): boolean` em `src/features/rbac/hooks/usePermission.ts` que:
  - Lê `currentUser` do `useAuth()` (PRD-003)
  - Chama `hasPermission()` com argumentos
  - Rerenderiza automaticamente quando o user muda (via React Context já reativo do AuthProvider)
- **RF-011:** Criar `useCurrentRole(): RoleName | null` em `src/features/rbac/hooks/useCurrentRole.ts` retornando o papel do usuário atual ou null.

### Componentes declarativos

- **RF-012:** Criar `<Can resource="..." action="..." scope?="..." fallback?={ReactNode}>` em `src/features/rbac/components/Can.tsx`:
  - Renderiza children se `usePermission(resource, action, scope)` for true
  - Renderiza `fallback` (ou nada) se false
- **RF-013:** Criar `<Forbidden message?: string />` em `src/features/rbac/components/Forbidden.tsx`:
  - Renderiza EmptyState com ícone de "cadeado" (Iconify `mdi:lock-outline`), título "Acesso negado" e mensagem customizável

### Integração com GuardedRoute

- **RF-014:** Estender `<GuardedRoute>` do PRD-003 adicionando prop opcional `permission?: { resource: string; action: string; scope?: string }`.
- **RF-015:** Quando `permission` é passado, `<GuardedRoute>` verifica também via `hasPermission()`. Se faltar, redireciona para `/sem-permissao`.
- **RF-016:** A rota `/app/configuracoes/auditoria` deve usar `permission={{ resource: 'audit_log', action: 'view' }}` (atinge Owner, Gestor, Financeiro).
- **RF-017:** A rota `/app/configuracoes/papeis` deve usar `permission={{ resource: 'role', action: 'view' }}` (apenas Owner e Gestor).

### Logging de runtime

- **RF-018:** Criar função `auditLog(params: IAuditLogParams)` em `src/features/rbac/utils/auditLog.ts` que:
  - Recebe `actorId`, `action`, `resource`, `resourceId`, `before?`, `after?`
  - Cria objeto `IAuditLog` com `id: crypto.randomUUID()`, `timestamp: new Date().toISOString()`, `storeId: currentUser.storeId`
  - Adiciona ao mock store via API do PRD-004 (`auditApi.create(...)` se existir, ou via mutation direta no provider)
- **RF-019:** Configurar `MockProvider` (PRD-005) para invocar `auditLog()` automaticamente em todas as mutações (create, update, delete) de recursos sensíveis (customer, order, quote, commission, transfer).
- **RF-020:** Configurar `auditLog()` para também rodar nos eventos de auth: login, logout, troca de perfil.

### Tela de papéis (read-only)

- **RF-021:** Criar `RolesPage` em `src/features/rbac/pages/RolesPage.tsx`, rota `/app/configuracoes/papeis`.
- **RF-022:** A página deve mostrar os 7 papéis em formato tabular ou de cards, com:
  - Nome do papel
  - Descrição curta
  - Tabela de permissões: recurso × ações × scope
  - Indicador visual "Edição disponível na Fase 2" para evitar dúvida sobre por que não há botões de edição

### Tela de auditoria

- **RF-023:** Criar `AuditLogPage` em `src/features/rbac/pages/AuditLogPage.tsx`, rota `/app/configuracoes/auditoria`.
- **RF-024:** A página deve mostrar lista paginada (20 por página) de `IAuditLog`, ordenados por `timestamp` descendente.
- **RF-025:** Cada item da lista deve mostrar: timestamp formatado (ex: "há 2 horas" + tooltip com data completa), ator (avatar + nome + papel), ação (ex: "criou cliente", "aprovou comissão"), resource (com link para o registro se ainda existir), botão de expandir.
- **RF-026:** Expansão mostra `before` e `after` em JSON formatado (com syntax highlighting básico via Prism ou similar).
- **RF-027:** A página deve ter painel de filtros lateral com:
  - Ator (multi-select de vendedores)
  - Ação (multi-select)
  - Recurso (multi-select)
  - Faixa de data (date range picker)
- **RF-028:** Filtros aplicados devem refletir na URL como query params, permitindo compartilhamento de view filtrada.
- **RF-029:** Botão "Exportar CSV" no canto superior direito da página, com tooltip "Disponível na Fase 2" (sem ação no MVP).

### Documentação

- **RF-030:** Criar `docs/rbac.md` com:
  - Filosofia geral do RBAC no projeto
  - Matriz completa em formato legível (markdown table)
  - Exemplos de uso dos helpers, hooks e componentes
  - Mapeamento previsto para Supabase RLS na Fase 2 (esqueleto de policies SQL como referência)

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** `hasPermission()` deve executar em < 1ms (lookup em objeto + verificação de array). Nunca async.
- **RNF-002 (Reatividade):** `usePermission()` deve rerenderizar componentes filhos em menos de 50ms após troca de perfil via `signOut`/`signIn`.
- **RNF-003 (Tipagem):** `resource` e `action` em todos os helpers/hooks/componentes devem ser tipados como union literal — não `string` genérico. Tentar passar `'invalido'` quebra o build.
- **RNF-004 (Manutenibilidade):** Adicionar novo recurso à matriz deve impactar exatamente: `resources.ts` + entradas correspondentes em `matrix.ts`. Tudo o resto continua funcionando sem mudança.
- **RNF-005 (Acessibilidade):** Tela de auditoria deve ser navegável por teclado; filtros têm labels associadas; tabela tem cabeçalho semântico `<th scope="col">`.
- **RNF-006 (Compatibilidade Fase 2):** Estrutura `resource:action:scope` deve mapear 1:1 para policies Supabase RLS futuras. Cada permissão da matriz deve corresponder a uma cláusula `using(...)` ou `with check(...)` no RLS.

---

## Critérios de Aceitação

### Helpers e hooks

```gherkin
DADO um user com papel "Owner"
QUANDO chamo hasPermission(user, 'customer', 'delete', 'all')
ENTÃO retorna true

DADO um user com papel "Vendedor"
QUANDO chamo hasPermission(user, 'customer', 'delete', 'all')
ENTÃO retorna false (Vendedor não tem delete em customer)

DADO um user com papel "Vendedor" que tem permissão view:own em customer
QUANDO chamo hasPermission(user, 'customer', 'view', 'store')
ENTÃO retorna false (scope own < store, não satisfaz)

DADO um user com papel "Gestor" que tem permissão view:store em customer
QUANDO chamo hasPermission(user, 'customer', 'view', 'own')
ENTÃO retorna true (scope store > own, satisfaz por hierarquia)
```

### Componente `<Can>`

```gherkin
DADO um componente que envolve um botão em <Can resource="commission" action="approve">
QUANDO renderizado para um Owner
ENTÃO o botão aparece visível

QUANDO o mesmo componente é renderizado para um Vendedor
ENTÃO o botão NÃO aparece
  E não há nenhum espaço vazio (componente não renderiza nada)

QUANDO uso <Can ... fallback={<Tooltip>Sem permissão</Tooltip>}>
ENTÃO em caso de falta de permissão, o fallback é renderizado em lugar do conteúdo
```

### Integração com GuardedRoute

```gherkin
DADO uma rota protegida com permission={{ resource: 'audit_log', action: 'view' }}
QUANDO um Owner acessa a rota
ENTÃO a página renderiza normalmente

QUANDO um Vendedor acessa a mesma rota
ENTÃO é redirecionado para /sem-permissao

QUANDO um Gestor acessa a mesma rota
ENTÃO renderiza normalmente (Gestor tem view:store em audit_log)
```

### Logging de runtime

```gherkin
DADO um Owner que edita um cliente via customersApi.update(id, patch)
QUANDO a mutation completa
ENTÃO um IAuditLog deve ser criado automaticamente
  E o log deve conter: actorId do Owner, action 'update', resource 'customer', resourceId, before e after corretos

DADO um SDR que cria uma conversa
QUANDO a mutation completa
ENTÃO um IAuditLog deve ser criado com action 'create' e actorId do SDR
```

### Tela de auditoria

```gherkin
DADO que estou em /app/configuracoes/auditoria como Owner
QUANDO a página carrega
ENTÃO vejo a lista de logs ordenada por timestamp descendente
  E vejo paginação ativa se houver mais de 20 logs

DADO que aplico filtro "ator = João Gallo" e "ação = create"
QUANDO submeto o filtro
ENTÃO a URL recebe ?actorId=X&action=create
  E a lista refiltra automaticamente
  E posso compartilhar o link e a view filtrada aparece igual em outra sessão

DADO que clico em "expandir" num log com before/after
QUANDO a expansão abre
ENTÃO vejo o JSON formatado com syntax highlighting
  E vejo claramente quais campos mudaram (diff visual ideal mas opcional no MVP)
```

### Tela de papéis (read-only)

```gherkin
DADO que estou em /app/configuracoes/papeis como Owner
QUANDO a página carrega
ENTÃO vejo os 7 papéis listados com suas permissões

QUANDO procuro botão "Editar permissões"
ENTÃO não existe
  E há indicador visual sutil "Edição disponível na Fase 2" para deixar claro o porquê
```

### Cenários de erro

```gherkin
DADO que chamo hasPermission(null, 'customer', 'view')
QUANDO o user é null
ENTÃO retorna false (sem lançar exceção)

DADO que tento passar resource 'inexistente' para hasPermission
QUANDO o TypeScript compila
ENTÃO deve falhar com erro de tipo (resource deve ser union literal)
```

---

## Fases de Implementação

| Fase | Objetivo                                       | Arquivos Estimados |
| ---- | ---------------------------------------------- | ------------------ |
| 1    | Constantes, matriz e helpers                   | 5-6                |
| 2    | Hooks e componentes declarativos               | 5-6                |
| 3    | Integração com GuardedRoute e auditLog runtime | 3-4                |
| 4    | Tela de papéis (read-only)                     | 3-4                |
| 5    | Tela de auditoria com filtros + documentação   | 5-6                |

### Detalhamento das Fases

#### Fase 1: Constantes, Matriz e Helpers

**Objetivo:** ter a fonte da verdade do RBAC pronta

**Ações:**

- [ ] Criar `src/features/rbac/permissions/resources.ts`, `actions.ts`, `scopes.ts` com union types literais
- [ ] Criar `src/features/rbac/permissions/matrix.ts` com permissões dos 7 papéis (~150 entradas)
- [ ] Criar `src/features/rbac/utils/compareScopes.ts`
- [ ] Criar `src/features/rbac/utils/hasPermission.ts`
- [ ] Criar `src/features/rbac/utils/getEffectivePermissions.ts` e `getCurrentUserScope.ts`
- [ ] Testar manualmente cada papel com cenários críticos da matriz

**Validação:** chamadas a `hasPermission` para 10+ cenários diferentes retornam os resultados esperados.

#### Fase 2: Hooks e Componentes Declarativos

**Objetivo:** API React-friendly para componentes consumirem

**Ações:**

- [ ] Criar `src/features/rbac/hooks/usePermission.ts` (consome `useAuth()`)
- [ ] Criar `src/features/rbac/hooks/useCurrentRole.ts`
- [ ] Criar `src/features/rbac/components/Can.tsx`
- [ ] Criar `src/features/rbac/components/Forbidden.tsx` (usa EmptyState do PRD-001)
- [ ] Adicionar barrel `src/features/rbac/index.ts` exportando hooks, componentes e utils públicos

**Validação:** componente de teste alterna entre 3 perfis e o `<Can>` reage corretamente sem flash.

#### Fase 3: Integração com GuardedRoute e Audit Runtime

**Objetivo:** plugar RBAC no shell e nos providers

**Ações:**

- [ ] Atualizar `<GuardedRoute>` do PRD-003 adicionando prop `permission?: { ... }`
- [ ] Criar `src/features/rbac/utils/auditLog.ts` com função `auditLog(params)` que persiste no mock store
- [ ] Adicionar hook `useAuditLog()` para ser chamado por providers/serviços
- [ ] Modificar `MockProvider` (PRD-005) para invocar `auditLog()` nas mutações de customer, order, quote, commission, transfer
- [ ] Modificar `<AuthProvider>` (PRD-003) para logar eventos de signIn/signOut

**Validação:** logar manualmente em console: trocar de perfil cria audit log com action 'signin'; criar um cliente via API cria audit log com action 'create' e resource 'customer'.

#### Fase 4: Tela de Papéis (read-only)

**Objetivo:** UI demonstrativa do modelo de permissões

**Ações:**

- [ ] Criar `RolesPage` em `src/features/rbac/pages/RolesPage.tsx`
- [ ] Layout: tabs ou accordion para os 7 papéis, cada um com tabela de permissões
- [ ] Indicador visual sutil "Edição disponível na Fase 2"
- [ ] Registrar rota em `src/routes.tsx` com `<GuardedRoute permission={{ resource: 'role', action: 'view' }}>`

**Validação:** Owner e Gestor acessam; demais papéis são redirecionados para `/sem-permissao`.

#### Fase 5: Tela de Auditoria e Documentação

**Objetivo:** completude do RBAC visual

**Ações:**

- [ ] Criar `AuditLogPage` com lista paginada usando `IAuditLog` do mock store
- [ ] Painel de filtros lateral (ator, ação, recurso, data)
- [ ] Sincronização de filtros com URL via query params
- [ ] Expansão de cada item mostrando before/after em JSON com highlighting básico
- [ ] Botão "Exportar CSV" placeholder com tooltip
- [ ] Escrever `docs/rbac.md` com matriz completa, exemplos e mapeamento para Supabase RLS
- [ ] Adicionar links rápidos da tela para o documento

**Validação:** filtros aplicados refletem na URL; recarregar com URL filtrada mantém a view; logs gerados em runtime (Fase 3) aparecem na tela em tempo (quase) real após criados.

---

## Dependências

### PRDs Anteriores

| PRD     | Descrição                                      | Status                                                                     |
| ------- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| PRD-002 | Modelo Conceitual de Domínio e Glossário       | ⏳ Pendente (tipos IRole, IPermission, IAuditLog consumidos)               |
| PRD-003 | Shell do App, Navegação e Layouts Base         | ⏳ Pendente (`<GuardedRoute>` estendido, `<AuthProvider>` consumido)       |
| PRD-004 | Geradores de Dados Fictícios e Camada de Mocks | ⏳ Pendente (mock de IAuditLog histórico, store mutável para runtime logs) |
| PRD-005 | Arquitetura de Provedores de Dados             | ⏳ Pendente (providers acoplam `auditLog()` nas mutações)                  |

### Serviços Externos

| Serviço                                             | Tipo         | Status     |
| --------------------------------------------------- | ------------ | ---------- |
| Prism.js ou highlight.js (syntax highlighting JSON) | Lib opcional | A instalar |

### Decisões Pendentes

Nenhuma.

---

## Cadeia de PRDs

Este PRD faz parte do épico **"Bloco 0 — Fundação"**.

| Ordem | PRD         | Título                                                | Status       | Relação                                            |
| ----- | ----------- | ----------------------------------------------------- | ------------ | -------------------------------------------------- |
| 1     | PRD-001     | Identidade Visual GALLO e Design System Base          | ⏳           | —                                                  |
| 2     | PRD-002     | Modelo Conceitual de Domínio e Glossário              | ⏳           | Pré-requisito                                      |
| 3     | PRD-003     | Shell do App, Navegação e Layouts Base                | ⏳           | Pré-requisito (`<GuardedRoute>` estendido)         |
| 4     | PRD-004     | Geradores de Dados Fictícios e Camada de Mocks        | ⏳           | Pré-requisito                                      |
| 5     | PRD-005     | Arquitetura de Provedores de Dados                    | ⏳           | Pré-requisito (`auditLog()` acoplado às mutations) |
| **6** | **PRD-006** | **Sistema de Roles, Permissões e Auditoria (visual)** | **🔄 ATUAL** | Depende de PRD-002, 003, 004, 005                  |
| 7     | PRD-007     | Multi-Loja                                            | ⏳           | Consome scope='store'                              |

**Legenda:** ✅ Implementado | 🔄 Atual | ⏳ Pendente

---

## Considerações de Segurança

### O RBAC frontend não é segurança real

**Reforço crítico:** tudo aqui é UX e disciplina arquitetural — não proteção real. Qualquer dev/atacante consegue:

- Editar o `localStorage` para se passar por Owner
- Modificar o `currentUser` em runtime via DevTools
- Bypassar `<Can>` editando o React component tree

A verdadeira proteção entra na **Fase 2** quando:

- Supabase Auth emite JWT verificável
- Supabase RLS aplica policies no banco que **espelham** a matriz deste PRD
- O frontend continua usando esta matriz para UX, mas o banco rejeita queries sem permissão

### Mapeamento previsto para Supabase RLS

Cada entrada da matriz do PRD-006 deve gerar uma policy equivalente:

```sql
-- Exemplo: Vendedor pode ver apenas seus próprios clientes
CREATE POLICY "vendedor_view_own_customers"
  ON customers FOR SELECT
  USING (
    auth.uid() IN (
      SELECT seller_id FROM sellers
      WHERE id = customers.seller_id
    )
  );
```

O documento `docs/rbac.md` registra esses esqueletos como referência para o PRD futuro de implementação Supabase.

### Audit log no MVP é volátil

Como toda a camada de mocks (PRD-004), o audit log é em memória — refresh limpa. Isso é aceitável no MVP (foco é demonstrar o conceito), mas **na Fase 2 audit log precisa ser imutável e persistente** (provavelmente tabela apenas-append no Supabase, sem UPDATE/DELETE).

### Dados sensíveis em `before` e `after`

Os campos `before` e `after` do `IAuditLog` podem conter PII (CPF, CNPJ, email). No MVP isso não é problema (dados sintéticos do Faker). Na Fase 2, considerar:

- Mascarar PII nos logs
- Política de retenção (apagar logs > N meses)
- Compliance LGPD (direito de esquecimento aplica a logs?)

---

## Fluxos de Usuário

### Fluxo Principal — Vendedor é bloqueado de aprovar comissão

1. Vendedor abre a tela de pedidos `/app/pedidos`
2. Ao lado de cada pedido pago, há botão "Aprovar comissão" envolto em `<Can resource="commission" action="approve">`
3. Como Vendedor não tem `approve` em commission, o botão **não aparece**
4. Vendedor não percebe que esse botão existe para outros papéis — UX limpa

### Fluxo Alternativo — Gestor acessa auditoria

1. Gestor clica em "Configurações > Auditoria" na sidebar
2. `<GuardedRoute permission={{ resource: 'audit_log', action: 'view' }}>` verifica
3. Gestor tem permissão `view:store` em audit_log → autorizado
4. Tela carrega com logs filtrados implicitamente pela loja do Gestor (regra de scope aplicada na consulta)
5. Gestor aplica filtro "ator = Carlos Santos" + "ação = update"
6. URL atualiza: `/app/configuracoes/auditoria?actorId=...&action=update`
7. Lista refiltra
8. Gestor copia a URL e envia para Financeiro
9. Financeiro abre, vê os mesmos logs filtrados (também tem permissão de visualização)

### Fluxo Mockado — Owner registra uma alteração

1. Owner edita o telefone de um cliente B2B
2. Componente chama `customersProvider.update(id, { phone: novoTelefone })`
3. `MockProvider` executa a mutação no store
4. Antes de retornar, invoca `auditLog({ action: 'update', resource: 'customer', resourceId, before: {phone: antigoTelefone}, after: {phone: novoTelefone}, actorId: owner.id })`
5. Log é adicionado ao mock store
6. Outro Owner abrindo `/app/configuracoes/auditoria` em outra sessão (mesmo browser) vê o log

### Fluxo de Erro — Vendedor tenta acessar tela de auditoria pela URL

1. Vendedor copia URL de auditoria de outro contexto e cola no navegador
2. `<GuardedRoute permission={{ resource: 'audit_log', action: 'view' }}>` verifica
3. Vendedor não tem `view` em `audit_log` → redirecionado para `/sem-permissao`
4. Vê mensagem amigável + botão "Voltar"

---

## Convenções de Código (Referência Rápida)

> **Consulte a Seção 5 do `guia-prd.md` para a versão completa.**

| Elemento                     | Convenção                                   | Exemplo                                      |
| ---------------------------- | ------------------------------------------- | -------------------------------------------- |
| **Matriz**                   | UPPER_SNAKE_CASE para a constante exportada | `PERMISSIONS_MATRIX`                         |
| **Helpers**                  | camelCase com verbo                         | `hasPermission()`, `compareScopes()`         |
| **Hooks**                    | camelCase + `use`                           | `usePermission()`, `useCurrentRole()`        |
| **Componentes**              | PascalCase, declarativos                    | `<Can>`, `<Forbidden>`                       |
| **Páginas**                  | PascalCase + sufixo `Page`                  | `RolesPage`, `AuditLogPage`                  |
| **Resources/actions/scopes** | lowercase, snake_case quando composto       | `'customer'`, `'audit_log'`, `'view'`        |
| **Roles**                    | PascalCase (espelham o tipo)                | `'Owner'`, `'VendedorExterno'`               |
| **Pastas**                   | kebab-case                                  | `rbac/`, `permissions/`                      |
| **Git commits**              | Conventional Commits                        | `feat: add rbac matrix and visual audit log` |

---

## Notas para o Agente Desenvolvedor

> **Contexto:** Você é o Claude Opus 4.7 operando via Claude Code CLI v2.1.3. Este PRD foi criado pelo Agente Arquiteto (Claude Opus 4.7 na plataforma web). Este PRD é implementado **após** PRD-002, PRD-003, PRD-004 e PRD-005 estarem prontos.

### Esclarecimento de Dúvidas

> **💬 Antes de implementar, faça perguntas para esclarecer qualquer ambiguidade sobre: requisitos funcionais, restrições técnicas, dependências, comportamentos esperados e critérios de aceitação.**

### Instruções Obrigatórias

> **⚠️ 1. ANTES DE IMPLEMENTAR:**
> "Lembre-se: explore a estrutura dos dados, planeje primeiro cada passo, analise, investigue a fundo, pense e revise tudo antes de realizar qualquer atualização ou implementação."

> **⚠️ 2. APÓS IMPLEMENTAR:**
>
> - Incrementar a versão do app seguindo [SemVer](https://semver.org/)
> - Atualizar o `CHANGELOG.md` seguindo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
> - Renomear este arquivo adicionando `_DONE` ao final
>   Ex: `PRD-006-rbac-permissoes-auditoria_DONE.md`
> - Atualizar a seção "Status de Implementação"

### Princípios de Implementação

| Princípio                               | Descrição                                                                                           |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Matriz é a única fonte da verdade**   | Mudou permissão? Mudou só em matrix.ts. Nada mais                                                   |
| **`hasPermission` é síncrono e barato** | Lookup em objeto. Nunca async. Nunca consulta banco (na Fase 2, JWT já trazem claims)               |
| **Frontend RBAC ≠ segurança**           | Reforçar no JSDoc dos helpers que isso é UX, e segurança real virá com RLS na Fase 2                |
| **Scope tem hierarquia clara**          | `own ≤ team ≤ store ≤ all`. Quem tem store implicitamente tem own/team                              |
| **Audit log é append-only conceitual**  | Mesmo no mock, jamais oferecer UI para editar/deletar logs                                          |
| **Logs registram mutações, não views**  | Ver um cliente não gera log; editar gera. Isso evita ruído                                          |
| **Mensagens "Edição na Fase 2"**        | Sempre que o MVP mostrar algo read-only que será editável depois, sinalizar para o cliente entender |

### Orientações Gerais

| Aspecto                          | Orientação                                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tipagem da matriz**            | `Record<RoleName, IPermission[]>` com cada IPermission tendo `resource: ResourceName` (union literal) e `actions: ActionName[]` (union literal)         |
| **Performance da matriz**        | Construir um índice em tempo de import (objeto aninhado `roleName -> resource -> actions+scope`) para lookup O(1)                                       |
| **`<GuardedRoute>` estendido**   | Manter retrocompatibilidade — `roles={[...]}` continua funcionando; `permission={{ ... }}` é adicional, não substitui                                   |
| **Filtros da auditoria**         | Usar `URLSearchParams` para sincronizar; manter URL legível (não codificar tudo em base64)                                                              |
| **JSON formatado**               | Usar `JSON.stringify(obj, null, 2)` para indentação; syntax highlighting via Prism é opcional, pode ser CSS simples                                     |
| **Audit logs históricos**        | PRD-004 já gera 40 logs históricos via `generators/audit.ts`; este PRD apenas garante que **runtime** também produz logs novos                          |
| **Acoplamento provider ↔ audit** | Implementar via wrapper/middleware no `MockProvider` — não espalhar `auditLog()` em cada método; usar HOF (higher-order function) que envolve mutations |

### O que NÃO Fazer

| ❌ Evitar                                                                                          |
| -------------------------------------------------------------------------------------------------- |
| Permitir edição da matriz no MVP (essa é a tela da Fase 2)                                         |
| Logar views/leituras — só mutations                                                                |
| Bypass de role guard com flag global "skipPermissions=true" — proibido até em dev mode             |
| Esquecer hierarquia de scope (Vendedor com `own` não pode acessar coisa com requiredScope `store`) |
| Usar string solta para resource (`'CustomerView'`) — sempre union literal                          |
| Acoplar `auditLog()` ao SupabaseProvider neste PRD — fica para Fase 2 com RLS triggers             |
| Hardcodar permissões fora de matrix.ts (ex: dentro de um componente)                               |
| Esquecer de mostrar "Edição disponível na Fase 2" em RolesPage para evitar confusão do cliente     |
| Tornar tela de papéis acessível a Vendedor/SDR/Cliente                                             |
| Permitir bypass do GuardedRoute via deeplink                                                       |

---

## Status de Implementação

| Campo                     | Valor                                                                                                                                                                                                                                                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**                | ✅ CONCLUÍDO                                                                                                                                                                                                                                                                                                                                         |
| **Data de Implementação** | 2026-05-25                                                                                                                                                                                                                                                                                                                                           |
| **Versão do App**         | 0.5.0                                                                                                                                                                                                                                                                                                                                                |
| **Codinome**              | Pilot                                                                                                                                                                                                                                                                                                                                                |
| **Implementado por**      | Claude Opus 4.7 (Claude Code CLI) via AILA Sistemas Inteligentes                                                                                                                                                                                                                                                                                     |
| **Observações**           | Audit log runtime ligado aos providers via novo `IAuditsProvider` (mock + supabase stub) e helper público `recordAuditLog`. `requireAuth` ganhou parâmetro opcional `permission` mantendo retrocompatibilidade. `storeId` hardcoded como `store-matriz` no MVP — vira lookup dinâmico no PRD-007 (multi-loja). Documentação completa em `docs/rbac.md`. |

---

## Histórico

| Data       | Versão | Alteração                                                                                                                     |
| ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — matriz RBAC para 7 papéis, helpers/hooks/componentes, telas de papéis e auditoria, integração com providers |

---

**AILA - Sistemas Inteligentes**
