# PRD-007: Multi-Loja — Modelagem e Operação Cross-Store

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                           |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                |
| **Objetivo**          | Estabelecer a infraestrutura multi-loja completa em modelagem, mocks, providers e UI, mantendo apenas a matriz operacional no MVP mas com toda a fundação pronta para ativação de filiais sem retrabalho na Fase 2 |
| **Tipo**              | Feature                                                                                                                                                                                                            |
| **Complexidade**      | Alta                                                                                                                                                                                                               |
| **Total de Fases**    | 4                                                                                                                                                                                                                  |
| **Prioridade**        | Alta                                                                                                                                                                                                               |
| **Épico**             | Bloco 0 — Fundação                                                                                                                                                                                                 |
| **PRDs Relacionados** | PRD-002 (Modelo Conceitual), PRD-003 (Shell), PRD-004 (Mocks), PRD-005 (Provider Pattern), PRD-006 (RBAC)                                                                                                          |
| **Implementação**     | 🔵 Claude Code CLI (sobre o scaffold do Lovable)                                                                                                                                                                   |
| **Padrão de código**  | Multi-loja em `src/features/multistore/`; hooks e helpers em `src/features/multistore/hooks/` e `utils/`; seletor visual em `src/features/multistore/components/StoreSwitcher.tsx`                                 |

### Critérios de Complexidade Utilizados

| Complexidade | Critérios                                                       |
| ------------ | --------------------------------------------------------------- |
| **Baixa**    | 1 arquivo, sem dependências externas, < 100 linhas              |
| **Média**    | 2-5 arquivos, banco OU integração, funcionalidade isolada       |
| **Alta**     | 5+ arquivos, múltiplas integrações, regras de negócio complexas |

> **Justificativa de Alta:** entidade transversal `IStore` que atravessa todos os ~15 agregados do modelo (cada um carrega `storeId`); seletor reativo integrado com TopBar do PRD-003; helper de scope que se integra com RBAC do PRD-006 e com filtragem das APIs do PRD-005; comportamento multi-loja modelado mas operação MVP restrita a matriz com sinalização visual clara; auditoria de troca de loja; preparação semântica para Supabase RLS por loja na Fase 2; impacto em todas as features do Bloco 1 em diante.

---

## Contexto do Problema

A GALLO BASE DIESEL hoje opera com uma única unidade (matriz em Frederico Westphalen/RS). Mas a Proposta Comercial v2 e a estratégia de marca guarda-chuva (PARTS/SERVICE/INDUSTRIAL) deixam claro que a empresa visa **expansão** — possivelmente filiais em outras cidades do RS, mais adiante outros estados, eventualmente parceiros (revendedores autorizados). A plataforma precisa nascer pensando nisso.

Sem multi-loja modelada desde já, três problemas se materializam:

**Refatoração maciça quando a primeira filial chegar.** Cada `ICustomer`, `IOrder`, `IConversation`, `ICommission` precisaria ganhar `storeId` retroativamente, cada query precisaria ser reescrita para filtrar por loja, cada listagem precisaria de seletor — semanas de refatoração em produção. Tendo `storeId` em todas as entidades desde o PRD-002 e o seletor desde o PRD-003 (placeholder), a ativação real de filiais vira simplesmente "gerar mais lojas nos mocks / adicionar registros na tabela `stores`". **RBAC fica incoerente.** O PRD-006 já fala em `scope: 'store'` — Gestor vê só dados de sua loja. Mas sem o conceito multi-loja efetivo, esse scope é teórico. Implementar agora garante que o helper `hasPermission` realmente filtra. **Onda 1 entrega valor parcial.** Algumas decisões comerciais da GALLO podem incluir gestão de operações com parceiros mesmo na Fase 1 (ex: oficina credenciada que usa o catálogo). Sem multi-loja modelada, não há onde encaixar parceiro.

Importante notar a distinção entre **modelagem** e **operação** que este PRD assume:

- **Modelagem completa**: `IStore` como entidade de primeira classe; `storeId` em todas as outras entidades; seletor de loja no TopBar; hook `useCurrentStore`; helper `withStoreScope` para filtros; integração com RBAC scope; geração mockada da matriz como única loja ativa
- **Operação MVP**: apenas a **matriz** "GALLO BASE DIESEL — Matriz" está gerada nos mocks. O seletor de loja mostra apenas essa opção. Gestão de múltiplas lojas (CRUD de lojas, transferência de dados, consolidação cross-store) **fica para a Fase 2 / Onda futura**

Em outras palavras: este PRD **prepara o terreno completo** para que, quando a GALLO decidir ativar uma filial, a equipe técnica precise apenas executar comandos pontuais (adicionar loja + redistribuir vendedores) sem refatoração arquitetural.

---

## Conceito da Solução

### Modelo (revisão do PRD-002)

`IStore` já está definido no PRD-002 com:

```typescript
IStore {
  id: ID;
  name: string;
  type: 'matriz' | 'filial' | 'parceira';
  address: string;
  cnpj: string;
  settings: IPlatformSettings;
  activeDivisions: Division[];  // no MVP: ['parts']
  createdAt: ISO8601;
}
```

Todas as outras entidades transacionais carregam `storeId: ID` referenciando a loja proprietária do registro. Isso já está no PRD-002.

### Tipos de loja

| Tipo       | Característica                                                              | Exemplo                                           |
| ---------- | --------------------------------------------------------------------------- | ------------------------------------------------- |
| `matriz`   | Loja-mãe, sede administrativa, consolida dados das demais                   | GALLO BASE DIESEL — Matriz (Frederico Westphalen) |
| `filial`   | Loja própria da rede, mesma razão social ou grupo                           | _Futura: GALLO BASE DIESEL — Erechim_             |
| `parceira` | Revendedor autorizado, razão social separada, contrato comercial específico | _Futura: Oficina Credenciada XPTO_                |

No MVP: 1 instância de `matriz`. Nenhuma `filial` ou `parceira`.

### Loja ativa (current store)

Cada usuário tem **uma loja primária** (`ISeller.storeId` ou `ICustomer.storeId`). Mas Owner e certos Gestores podem ter acesso a **múltiplas lojas** (`ISeller.accessibleStoreIds: ID[]` — campo novo a adicionar no PRD-002 v1.1 conceitual, ou via permissões de scope `all`).

Em qualquer momento, há uma **loja ativa** no contexto da sessão:

- Default: loja primária do usuário
- Owner pode trocar via seletor no TopBar (no MVP só tem matriz, então o seletor é informativo, não funcional)
- Loja ativa é persistida em `localStorage` chave `gallo-current-store-id`
- Trocar de loja gera audit log automaticamente

### Hook `useCurrentStore()`

```typescript
interface IUseCurrentStoreResult {
  currentStore: IStore;
  accessibleStores: IStore[];
  setCurrentStore: (storeId: ID) => Promise<void>;
  canSwitchStore: boolean; // false para usuários com apenas uma loja acessível
}
```

### Helper `withStoreScope`

Wrapper de filtragem que adiciona implicitamente `storeId = currentStoreId` em queries de listagem, **exceto** para usuários com scope `all` (Owner) que veem cross-store.

```typescript
function withStoreScope<T extends { storeId?: ID }>(
  params: T,
  context: { user: ISeller; currentStoreId: ID },
): T & { storeId?: ID } {
  // Owner com scope 'all' pode ver cross-store se não filtrar
  if (hasPermission(context.user, "customer", "view", "all")) {
    return params;
  }
  // Demais: aplica filtro implícito pela loja ativa
  return { ...params, storeId: context.currentStoreId };
}
```

### Seletor visual

O `<StoreSwitcher>` no TopBar (placeholder no PRD-003) ganha funcionalidade:

- Mostra a loja ativa com nome curto
- Clica → dropdown com lista de lojas acessíveis
- Selecionar muda a loja ativa, persiste em localStorage, dispara audit log, e força re-fetch de listagens dependentes
- No MVP: lista contém apenas a matriz; clicar abre dropdown com 1 item; o seletor não desaparece (visual continua presente para validar UX)
- Indicador "Filial e parceira disponíveis na Fase 2"

### Alternativas Consideradas

| Alternativa                                                           | Por que foi descartada                                                                                                |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Não modelar multi-loja no MVP, adicionar depois                       | Refatoração massiva quando primeira filial chegar; PRD-002 já tem `storeId`, então é mais barato fechar o ciclo agora |
| Multi-tenant por subdomínio (`matriz.gallo.com`, `filial1.gallo.com`) | Complicação operacional (DNS, certificados); usuários da GALLO operam várias lojas no mesmo domínio                   |
| Banco separado por loja                                               | Quebra consolidação para BI (Onda 2 — visão executiva cross-store); contraria filosofia de multi-tenant lógico        |
| Loja ativa global (mesma para todos os usuários simultâneos)          | Owner numa máquina + Owner em outra precisa poder visualizar lojas diferentes simultaneamente                         |
| Loja ativa sem persistência (volátil por sessão)                      | Refresh força re-seleção; UX ruim para usuário multi-loja                                                             |

**Decisão consolidada:** **modelagem multi-loja completa, operação MVP só matriz, seletor visual presente como demonstração de UX, loja ativa persistida por usuário em localStorage, audit log de troca de loja.**

---

## Escopo

### Incluído

- ✅ Estrutura `src/features/multistore/` com subpastas:
  - `hooks/` — `useCurrentStore`, `useAccessibleStores`
  - `utils/` — `withStoreScope`, `getStoreForUser`, `isStoreAccessible`
  - `components/` — `StoreSwitcher`, `StoreBadge`
  - `pages/` — `StoresPage` (read-only no MVP, listando apenas matriz)
- ✅ Hook `useCurrentStore()` reativo a troca de loja
- ✅ Hook `useAccessibleStores()` retornando lojas acessíveis ao usuário atual
- ✅ Helper `withStoreScope(params, context)` para aplicar filtro automático em queries
- ✅ Helper `getStoreForUser(user)` para determinar loja default
- ✅ Componente `<StoreSwitcher>` integrado ao TopBar do PRD-003 (substituindo o placeholder)
- ✅ Componente `<StoreBadge store>` para exibir loja em qualquer contexto (lista de clientes cross-store, header de detalhe)
- ✅ Persistência da loja ativa em `localStorage` chave `gallo-current-store-id`
- ✅ Auditoria automática de troca de loja (via `auditLog()` do PRD-006)
- ✅ Integração com providers do PRD-005: queries de listagem aplicam `withStoreScope` automaticamente quando user não tem scope `all`
- ✅ Tela `/app/configuracoes/lojas` read-only listando matriz com indicador "Gestão de filiais disponível na Fase 2"
- ✅ Integração com PRD-006 RBAC: scope `store` no `hasPermission()` realmente filtra usando `useCurrentStore()`
- ✅ Geração mockada: PRD-004 cria apenas a matriz; este PRD não muda os mocks, apenas usa o que está lá
- ✅ Adição de campo `accessibleStoreIds?: ID[]` em `ISeller` (extensão pontual do PRD-002 acordada aqui)
- ✅ Documentação `docs/multistore.md` cobrindo filosofia, helpers, fluxo de troca, e mapeamento futuro para Supabase RLS por loja

### Excluído

- ❌ CRUD real de lojas pela UI (criar, editar, desativar filial) — Fase 2
- ❌ Transferência de dados entre lojas (mudar storeId de clientes/pedidos) — Fase 2
- ❌ Consolidação cross-store na Onda 2 (Visão Executiva sumarizando lojas) — fica explicitada como ponto de entrada, mas implementação dos números agregados é do PRD-040
- ❌ Geração de filiais ou parceiras nos mocks da Fase 1 — apenas matriz
- ❌ Multi-tenant por subdomínio ou banco separado — não escolhido
- ❌ Transferência de vendedor entre lojas — Fase 2
- ❌ Hierarquia de lojas (matriz tem visão das filiais) com permissões complexas além do scope `all` do Owner — Fase 2
- ❌ Configurações por loja editáveis pela UI (cada loja tem suas próprias `IPlatformSettings`) — modelado mas só matriz tem configuração no MVP

---

## Anatomia do Helper `withStoreScope`

Por ser o ponto crítico de integração entre multi-loja, RBAC e providers, vale detalhar:

```typescript
// src/features/multistore/utils/withStoreScope.ts

import type { ISeller, ID } from "@/shared/types";
import { hasPermission } from "@/features/rbac/utils/hasPermission";

interface IScopeContext {
  user: ISeller | null;
  currentStoreId: ID;
  resource: string; // ex: 'customer', 'order'
}

/**
 * Aplica filtro implícito de storeId em queries de listagem,
 * respeitando o scope de permissão do usuário atual.
 *
 * - Usuário sem auth → retorna params com storeId vazio (resultado vazio)
 * - Owner ou usuário com scope 'all' → retorna params sem filtro extra (cross-store)
 * - Demais usuários → adiciona storeId = currentStoreId aos params
 *
 * @see docs/multistore.md#scope-helper
 */
export function withStoreScope<T extends Record<string, unknown>>(
  params: T,
  context: IScopeContext,
): T & { storeId?: ID } {
  if (!context.user) {
    return { ...params, storeId: "__no_user__" }; // garante resultado vazio
  }

  const hasAllScope = hasPermission(context.user, context.resource, "view", "all");

  if (hasAllScope) {
    return params; // sem filtro adicional
  }

  return { ...params, storeId: context.currentStoreId };
}
```

E o consumo no provider:

```typescript
// src/providers/data/impl/mock/customers.ts (atualizado)

import { withStoreScope } from "@/features/multistore/utils/withStoreScope";
import { customersApi } from "@/mocks/api";
import { getCurrentContext } from "@/features/auth";

export const mockCustomersProvider: ICustomersProvider = {
  list: (params = {}) => {
    const ctx = getCurrentContext(); // { user, currentStoreId }
    const scoped = withStoreScope(params, { ...ctx, resource: "customer" });
    return customersApi.list(scoped);
  },
  // ... demais métodos
};
```

---

## Requisitos Funcionais

### Modelo (extensão do PRD-002)

- **RF-001:** Adicionar campo opcional `accessibleStoreIds?: ID[]` à interface `ISeller` em `src/shared/types/people.ts`. No MVP, todos os vendedores têm apenas a matriz acessível (campo omitido ou contendo apenas o id da matriz).
- **RF-002:** Confirmar que **todas** as entidades transacionais do PRD-002 que devem carregar `storeId` realmente o carregam: `ICustomer`, `ILead`, `IConversation`, `IOrder`, `IQuote`, `ICommission`, `IGoal`, `IAuditLog`, `IRecommendation`, `ICarteiraTransfer`, `IPositivation`, `IRanking`. Adicionar onde estiver faltando.

### Hooks

- **RF-003:** Criar `useCurrentStore()` em `src/features/multistore/hooks/useCurrentStore.ts`:
  - Retorna `{ currentStore, accessibleStores, setCurrentStore, canSwitchStore }`
  - Lê do contexto `<MultistoreProvider>` que envolve a aplicação no `App.tsx` (após `<AuthProvider>`)
  - `setCurrentStore(storeId)` valida que a loja está acessível ao user atual; persiste em `localStorage`; dispara `auditLog`; emite re-render
- **RF-004:** Criar `useAccessibleStores()` retornando array de lojas acessíveis ao usuário atual:
  - Owner: todas as lojas existentes (no MVP, retorna `[matriz]`)
  - Gestor: lojas onde tem `permission scope=store` (no MVP, retorna `[matriz]`)
  - Vendedor: apenas a loja primária (no MVP, `[matriz]`)
  - Cliente: nenhuma (retorna `[]`)
- **RF-005:** Criar `useStoreById(storeId: ID): IStore | null` para componentes que precisam mostrar dados de loja específica em listas cross-store.

### Provider Context

- **RF-006:** Criar `src/features/multistore/MultistoreProvider.tsx` com Context React expondo:
  - `currentStoreId: ID`
  - `setCurrentStoreId(id: ID): Promise<void>`
  - `accessibleStores: IStore[]`
- **RF-007:** No primeiro render, `<MultistoreProvider>` deve:
  - Tentar ler `localStorage` chave `gallo-current-store-id`
  - Se valor presente e loja é acessível: usa esse id
  - Caso contrário: usa loja primária do `currentUser` do `useAuth()`
  - Se não houver user (logout): currentStoreId fica vazio até login

### Helpers

- **RF-008:** Criar `withStoreScope(params, context)` conforme anatomia detalhada acima. Tipagem genérica preservando o tipo de entrada.
- **RF-009:** Criar `getStoreForUser(user: ISeller | ICustomer): ID` retornando `storeId` primário do user.
- **RF-010:** Criar `isStoreAccessible(user: ISeller, storeId: ID): boolean` que verifica se o user tem permissão para acessar uma loja específica.

### Integração com providers (PRD-005)

- **RF-011:** Atualizar **todos** os `mockXxxProvider` em `src/providers/data/impl/mock/*` para aplicar `withStoreScope` nas operações de listagem antes de delegar para `src/mocks/api/`.
- **RF-012:** A função `withStoreScope` precisa do contexto de user e currentStoreId — criar helper `getCurrentContext()` em `src/features/multistore/utils/getCurrentContext.ts` que lê esses valores fora de componentes React (acesso ao Zustand store de auth e ao Zustand store de multistore).
- **RF-013:** Operações de `create` em providers devem **preencher automaticamente** `storeId: currentStoreId` se o input não tiver `storeId` informado.
- **RF-014:** Operações de `update` em providers **não devem permitir** alterar `storeId` de um registro existente no MVP (regra de imutabilidade). Tentativa lança `MockValidationError`.

### Seletor visual

- **RF-015:** Atualizar `<TopBar>` do PRD-003 substituindo o placeholder de seletor de loja pelo `<StoreSwitcher>` real.
- **RF-016:** `<StoreSwitcher>` deve:
  - Mostrar nome curto da loja ativa (max 24 chars; ex: "GALLO Matriz")
  - Mostrar tipo da loja como badge (matriz/filial/parceira) usando cor da identidade visual
  - Clicar abre dropdown com lista de `accessibleStores`
  - Selecionar muda a loja ativa via `setCurrentStore()`
  - Se há apenas 1 loja acessível: o dropdown ainda abre, mas mostra apenas 1 item e mensagem discreta "Filiais e parceiras serão habilitadas na Fase 2"
  - Quando `canSwitchStore` é `false` (só 1 loja acessível): cursor fica `default` e o componente tem aparência informativa, não interativa intensa
- **RF-017:** Criar `<StoreBadge store>` que renderiza nome curto + cor por tipo. Útil em listas cross-store futuras (Owner vendo dados de várias lojas).

### Tela de lojas (read-only)

- **RF-018:** Criar `StoresPage` em `src/features/multistore/pages/StoresPage.tsx`, rota `/app/configuracoes/lojas`, protegida por `<GuardedRoute permission={{ resource: 'store', action: 'view' }}>` (Owner e Gestor).
- **RF-019:** A página mostra:
  - Card único da matriz: nome, tipo, CNPJ, endereço, divisões ativas (`['parts']`), data de criação, número de vendedores vinculados, número de clientes vinculados
  - Indicador visual "Filiais e parceiras disponíveis na Fase 2" abaixo do card
  - Sem botões de criação/edição

### Auditoria de troca de loja

- **RF-020:** Quando `setCurrentStore(newStoreId)` é chamado e a loja muda efetivamente (newStoreId ≠ currentStoreId), invocar `auditLog({ action: 'switch_store', resource: 'store', resourceId: newStoreId, before: { storeId: currentStoreId }, after: { storeId: newStoreId } })`.
- **RF-021:** No MVP, como só há 1 loja, esse fluxo só será exercitado em testes — mas o código deve estar funcional para Fase 2.

### Documentação

- **RF-022:** Criar `docs/multistore.md` com:
  - Filosofia multi-loja (modelagem completa vs operação MVP)
  - Diagrama mostrando como `storeId` permeia o modelo
  - Como adicionar nova loja na Fase 2 (passo a passo: gerar/inserir IStore, atribuir vendedores, redistribuir clientes)
  - Mapeamento para Supabase RLS futuro (policies que verificam `auth.uid()` está em `sellers.accessibleStoreIds` que contém `storeId` do registro)

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Troca de loja deve completar em < 200ms (incluindo invalidação de cache de listagens e re-fetch da loja ativa).
- **RNF-002 (Reatividade):** Componentes que consomem `useCurrentStore()` devem rerenderizar imediatamente após `setCurrentStore()`, sem necessidade de refresh manual.
- **RNF-003 (Manutenibilidade):** Adicionar nova loja na Fase 2 deve impactar exatamente: criação de `IStore` no Supabase + atribuição de `accessibleStoreIds` aos vendedores autorizados. Nenhuma alteração em código de feature.
- **RNF-004 (Persistência segura):** Validar que `localStorage` contém id de loja **acessível** ao user atual. Se não acessível (ex: foi removida), cair silenciosamente para loja primária.
- **RNF-005 (Compatibilidade Supabase RLS):** A estrutura `withStoreScope` deve mapear semanticamente para policies RLS futuras. Documentar exemplos em `docs/multistore.md`.
- **RNF-006 (Isolamento de dados):** Mesmo no mock, queries de Vendedor/Gestor não devem retornar dados de outras lojas. Validar via testes manuais com mock contendo múltiplas lojas (cenário hipotético no /design-system).

---

## Critérios de Aceitação

### Modelo e mocks

```gherkin
DADO que rodo bootstrap dos mocks
QUANDO inspeciono qualquer cliente, pedido, conversa, comissão
ENTÃO todos devem ter storeId preenchido apontando para a matriz
  E não deve existir registro com storeId inválido ou vazio

DADO que pego um vendedor mockado
QUANDO inspeciono accessibleStoreIds
ENTÃO deve estar vazio ou conter apenas o id da matriz
```

### Hook useCurrentStore

```gherkin
DADO que estou logado como Owner pela primeira vez
QUANDO useCurrentStore() é chamado
ENTÃO currentStore é a matriz
  E accessibleStores contém apenas a matriz
  E canSwitchStore é false (só uma loja)

DADO que tenho localStorage com "gallo-current-store-id" = "storeXYZ"
QUANDO faço login e useCurrentStore() inicializa
ENTÃO se storeXYZ está em accessibleStores: currentStore = storeXYZ
  E se storeXYZ NÃO está acessível: currentStore cai para a loja primária do user

DADO um cenário hipotético com 3 lojas acessíveis ao Owner
QUANDO chamo setCurrentStore('store2')
ENTÃO currentStore atualiza para store2
  E localStorage é atualizado
  E um auditLog é criado com action='switch_store'
  E componentes que consomem useCurrentStore() rerenderizam
```

### Helper withStoreScope

```gherkin
DADO um Vendedor com permissão view:own em customer
QUANDO o provider chama withStoreScope(params, ctx)
ENTÃO o filtro storeId = currentStoreId é adicionado aos params

DADO um Owner com permissão view:all em customer
QUANDO o provider chama withStoreScope(params, ctx)
ENTÃO os params são retornados sem filtro de storeId (cross-store)

DADO um usuário não autenticado
QUANDO withStoreScope é chamado
ENTÃO retorna params com storeId='__no_user__'
  E a listagem resultante é vazia
```

### Integração com providers

```gherkin
DADO um Vendedor que chama useCustomersProvider().list()
QUANDO a query executa
ENTÃO retorna apenas clientes da loja ativa do Vendedor
  E não retorna clientes de outras lojas mesmo que existam no mock

DADO um Vendedor que tenta criar um cliente sem informar storeId
QUANDO a mutation executa
ENTÃO storeId é preenchido automaticamente com currentStoreId
  E o cliente é criado vinculado à loja ativa

DADO um Vendedor que tenta atualizar um cliente para mudar seu storeId
QUANDO a mutation tenta executar com patch contendo storeId diferente
ENTÃO a operação falha com MockValidationError
  E mensagem clara indica que storeId é imutável no MVP
```

### Seletor visual

```gherkin
DADO que estou logado em qualquer papel
QUANDO observo o TopBar
ENTÃO vejo o StoreSwitcher com "GALLO Matriz" e badge "matriz"

DADO que clico no StoreSwitcher
QUANDO o dropdown abre
ENTÃO vejo apenas 1 opção (matriz, marcada como ativa)
  E vejo mensagem discreta "Filiais e parceiras serão habilitadas na Fase 2"

DADO que sou Cliente B2C navegando em /loja
QUANDO observo o LojaHeader
ENTÃO o StoreSwitcher NÃO aparece (vitrine pública não tem conceito de loja ativa)
```

### Tela de lojas (read-only)

```gherkin
DADO que sou Owner e acesso /app/configuracoes/lojas
QUANDO a página carrega
ENTÃO vejo card da matriz com nome, tipo, CNPJ, endereço, divisões ativas
  E vejo indicador "Filiais e parceiras disponíveis na Fase 2"
  E NÃO há botões de criar/editar/desativar

DADO que sou Vendedor e tento acessar /app/configuracoes/lojas pela URL
QUANDO o GuardedRoute verifica permissão
ENTÃO sou redirecionado para /sem-permissao (Vendedor não tem permission view em store conforme RBAC)
```

### Auditoria

```gherkin
DADO que Owner muda loja ativa (cenário hipotético com 2 lojas)
QUANDO setCurrentStore é executado
ENTÃO um IAuditLog é criado com action='switch_store', actorId, before, after
  E o log aparece na tela /app/configuracoes/auditoria
```

### Cenários de erro

```gherkin
DADO que localStorage contém storeId inválido (loja foi removida)
QUANDO useCurrentStore inicializa
ENTÃO cai silenciosamente para loja primária do user
  E o localStorage é limpo do valor inválido

DADO que setCurrentStore é chamado com storeId não acessível ao user
QUANDO a função executa
ENTÃO lança MockValidationError com mensagem clara
  E currentStoreId não é alterado
```

---

## Fases de Implementação

| Fase | Objetivo                                                                   | Arquivos Estimados |
| ---- | -------------------------------------------------------------------------- | ------------------ |
| 1    | Extensão de tipo, hooks e provider context                                 | 5-6                |
| 2    | Helpers (withStoreScope, getStoreForUser, etc.) + integração com providers | 4-5                |
| 3    | Seletor visual + integração com TopBar do PRD-003                          | 3-4                |
| 4    | Tela de lojas, auditoria de troca, documentação                            | 4-5                |

### Detalhamento das Fases

#### Fase 1: Tipos, Hooks e Provider

**Objetivo:** ter o contexto reativo de loja ativa funcionando

**Ações:**

- [ ] Adicionar `accessibleStoreIds?: ID[]` em `ISeller` (src/shared/types/people.ts)
- [ ] Verificar/adicionar `storeId` em todas as entidades transacionais que ainda não tenham
- [ ] Criar `src/features/multistore/MultistoreProvider.tsx` com Context React
- [ ] Inserir `<MultistoreProvider>` no App.tsx após `<AuthProvider>` e antes das rotas
- [ ] Criar `useCurrentStore`, `useAccessibleStores`, `useStoreById` em `hooks/`
- [ ] Implementar persistência em localStorage com fallback para loja primária

**Validação:** consumir `useCurrentStore()` em uma tela mostra a matriz; trocar perfil mockado mantém o currentStore consistente.

#### Fase 2: Helpers e Integração com Providers

**Objetivo:** garantir que toda query passa pelo filtro de loja

**Ações:**

- [ ] Criar `src/features/multistore/utils/withStoreScope.ts`
- [ ] Criar `src/features/multistore/utils/getCurrentContext.ts` (acesso ao Zustand fora de React)
- [ ] Criar `getStoreForUser` e `isStoreAccessible`
- [ ] Atualizar **todos** os 16 `mockXxxProvider` (PRD-005) para usar `withStoreScope` em operações `list`
- [ ] Atualizar mutations `create` em providers para preencher `storeId` automaticamente
- [ ] Atualizar mutations `update` para bloquear alteração de `storeId`

**Validação:** chamar `customersProvider.list()` como Vendedor retorna apenas clientes da matriz; chamar `create` sem storeId preenche automaticamente.

#### Fase 3: Seletor Visual

**Objetivo:** UI reativa de troca de loja

**Ações:**

- [ ] Criar `<StoreSwitcher>` em `src/features/multistore/components/StoreSwitcher.tsx`
- [ ] Substituir o placeholder no TopBar do PRD-003 pelo `<StoreSwitcher>` real
- [ ] Criar `<StoreBadge>` para uso em listas cross-store futuras
- [ ] Validar comportamento responsivo (mobile: badge compacto)
- [ ] Validar UI quando há apenas 1 loja acessível (mensagem "Filiais e parceiras na Fase 2")

**Validação:** Owner vê o StoreSwitcher com matriz; clica e vê dropdown com 1 item + indicação Fase 2; Cliente em /loja não vê StoreSwitcher.

#### Fase 4: Tela de Lojas, Auditoria e Docs

**Objetivo:** completude do multi-loja modelado

**Ações:**

- [ ] Criar `StoresPage` em `src/features/multistore/pages/StoresPage.tsx`
- [ ] Registrar rota `/app/configuracoes/lojas` com `<GuardedRoute permission={{ resource: 'store', action: 'view' }}>`
- [ ] Implementar `auditLog` na função `setCurrentStore` (PRD-006 integration)
- [ ] Escrever `docs/multistore.md` com filosofia, helpers, fluxo Fase 2
- [ ] Adicionar entrada no glossário (PRD-002 doc) para "loja ativa", "matriz", "filial", "parceira"

**Validação:** acesso à tela /app/configuracoes/lojas funciona para Owner+Gestor; doc cobre todos os helpers e dá esqueleto de policy RLS futura.

---

## Dependências

### PRDs Anteriores

| PRD     | Descrição                                      | Status                                                                        |
| ------- | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| PRD-002 | Modelo Conceitual de Domínio e Glossário       | ⏳ Pendente (`IStore` definido, `ISeller.accessibleStoreIds` adicionado aqui) |
| PRD-003 | Shell do App, Navegação e Layouts Base         | ⏳ Pendente (`<StoreSwitcher>` substitui placeholder do TopBar)               |
| PRD-004 | Geradores de Dados Fictícios e Camada de Mocks | ⏳ Pendente (matriz gerada)                                                   |
| PRD-005 | Arquitetura de Provedores de Dados             | ⏳ Pendente (`mockXxxProvider` aplicam `withStoreScope`)                      |
| PRD-006 | Sistema de Roles, Permissões e Auditoria       | ⏳ Pendente (`hasPermission` integrado, `auditLog` reusado)                   |

### Serviços Externos

Nenhum.

### Decisões Pendentes

Nenhuma.

---

## Cadeia de PRDs

Este PRD **fecha** o épico **"Bloco 0 — Fundação"**.

| Ordem | PRD         | Título                                            | Status       | Relação                                |
| ----- | ----------- | ------------------------------------------------- | ------------ | -------------------------------------- |
| 1     | PRD-001     | Identidade Visual GALLO e Design System Base      | ⏳           | —                                      |
| 2     | PRD-002     | Modelo Conceitual de Domínio e Glossário          | ⏳           | Pré-requisito (`IStore` consumido)     |
| 3     | PRD-003     | Shell do App, Navegação e Layouts Base            | ⏳           | Pré-requisito (TopBar atualizado)      |
| 4     | PRD-004     | Geradores de Dados Fictícios e Camada de Mocks    | ⏳           | Pré-requisito (matriz gerada)          |
| 5     | PRD-005     | Arquitetura de Provedores de Dados                | ⏳           | Pré-requisito (providers atualizados)  |
| 6     | PRD-006     | Sistema de Roles, Permissões e Auditoria          | ⏳           | Pré-requisito (RBAC + auditLog usados) |
| **7** | **PRD-007** | **Multi-Loja — Modelagem e Operação Cross-Store** | **🔄 ATUAL** | Depende de todos os anteriores         |

> **Marco:** com a implementação do PRD-007, o **Bloco 0 (Fundação) está completo** — toda a infraestrutura técnica do MVP está pronta para receber os módulos funcionais a partir do Bloco 1 (CRM).

**Legenda:** ✅ Implementado | 🔄 Atual | ⏳ Pendente

---

## Considerações de Segurança

### Multi-loja frontend ≠ isolamento real

Assim como o RBAC do PRD-006, a filtragem por `storeId` no frontend é **disciplina arquitetural e UX**, não segurança real. Um Vendedor curioso pode editar localStorage para tentar acessar outra loja, mas:

- No MVP, só há 1 loja, então o cenário é hipotético
- Mesmo se houvesse, `withStoreScope` filtraria server-side na Fase 2 via Supabase RLS

### Supabase RLS por loja (mapeamento futuro)

Cada policy do PRD-006 ganha cláusula adicional verificando `storeId`. Exemplo:

```sql
-- Vendedor só vê clientes de lojas onde tem acesso
CREATE POLICY "vendedor_view_own_store_customers"
  ON customers FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM sellers
      WHERE customers.seller_id = sellers.id
        AND customers.store_id = ANY(sellers.accessible_store_ids)
    )
  );
```

A estrutura do `withStoreScope` em TypeScript deve **espelhar** essa lógica para que a UX já se comporte como o backend vai se comportar.

### LGPD e dados cross-store

Na Fase 2, quando houver múltiplas lojas (especialmente parceiras com razão social separada), considerar:

- Cada loja é um "controlador de dados" distinto sob LGPD?
- Transferência de cliente entre lojas precisa de consentimento?
- Owner vê dados pessoais de todas as lojas — registro de acesso em audit log

Esses pontos ficam documentados em `docs/multistore.md` como itens a aprofundar na Fase 2.

### Imutabilidade de storeId

No MVP, `storeId` de um registro é imutável após criação (RF-014). Isso evita inconsistências (cliente que era da matriz "aparece" na filial sem rastro). Na Fase 2, a transferência entre lojas será operação explícita com audit log próprio + possíveis aprovações.

---

## Fluxos de Usuário

### Fluxo Principal — Owner acessa o app (MVP)

1. Owner faz login → `<MultistoreProvider>` inicializa
2. Sem valor em `localStorage`, usa loja primária do Owner (matriz)
3. TopBar mostra `<StoreSwitcher>` com "GALLO Matriz" e badge "matriz"
4. Owner clica no switcher → dropdown abre com 1 opção (matriz selecionada) + nota "Filiais e parceiras na Fase 2"
5. Owner navega para `/app/clientes` → lista mostra todos os clientes (cross-store seria possível, mas só há matriz)

### Fluxo Hipotético — Owner troca de loja (Fase 2)

1. Fase 2: GALLO ativou filial Erechim, e Owner tem `accessibleStoreIds: [matriz, erechim]`
2. Owner clica no `<StoreSwitcher>` → dropdown mostra 2 opções
3. Owner seleciona "GALLO Erechim"
4. `setCurrentStore(erechim.id)` é chamado
5. `auditLog({ action: 'switch_store', before: matriz.id, after: erechim.id })` é gravado
6. `currentStoreId` muda no Context
7. Todos os componentes que consomem `useCurrentStore` rerenderizam
8. Listagens (clientes, pedidos, etc.) refazem fetch automaticamente — agora filtradas por Erechim
9. URL e estado da rota atual são preservados (Owner continua em `/app/clientes`, mas a lista mudou)

### Fluxo Alternativo — Vendedor com múltiplas lojas (Fase 2)

1. Vendedor "Marina" recebeu acesso a matriz + Erechim por decisão da gestão
2. Marina faz login → loja primária é matriz
3. Marina pode trocar entre as duas via `<StoreSwitcher>`
4. Em cada loja, só vê **sua carteira** dentro daquela loja (scope `own` + storeId)
5. Filtragem combinada: `seller_id = marina AND store_id = currentStoreId`

### Fluxo de Erro — localStorage com loja inválida

1. Usuário muda de máquina, traz `localStorage` antigo com `gallo-current-store-id = "store_removida_123"`
2. Faz login → `<MultistoreProvider>` inicializa
3. Tenta usar `store_removida_123`
4. `isStoreAccessible(user, "store_removida_123")` retorna false
5. Sistema cai silenciosamente para loja primária do user (matriz)
6. `localStorage` é limpo do valor inválido
7. Próximas sessões usam a loja primária ou nova escolha do user

---

## Convenções de Código (Referência Rápida)

> **Consulte a Seção 5 do `guia-prd.md` para a versão completa.**

| Elemento              | Convenção                           | Exemplo                                                  |
| --------------------- | ----------------------------------- | -------------------------------------------------------- |
| **Hooks**             | camelCase + `use`                   | `useCurrentStore()`, `useAccessibleStores()`             |
| **Helpers**           | camelCase verbo + sufixo descritivo | `withStoreScope`, `getStoreForUser`, `isStoreAccessible` |
| **Componentes**       | PascalCase                          | `<StoreSwitcher>`, `<StoreBadge>`                        |
| **Provider Context**  | PascalCase + sufixo `Provider`      | `<MultistoreProvider>`                                   |
| **Páginas**           | PascalCase + sufixo `Page`          | `StoresPage`                                             |
| **Pastas**            | kebab-case                          | `multistore/`                                            |
| **localStorage keys** | kebab-case com prefixo `gallo-`     | `gallo-current-store-id`                                 |
| **Tipos de loja**     | lowercase string literais           | `'matriz'`, `'filial'`, `'parceira'`                     |
| **Git commits**       | Conventional Commits                | `feat: add multistore foundation and store switcher`     |

---

## Notas para o Agente Desenvolvedor

> **Contexto:** Você é o Claude Opus 4.7 operando via Claude Code CLI v2.1.3. Este PRD foi criado pelo Agente Arquiteto (Claude Opus 4.7 na plataforma web). Este PRD é implementado **após** PRDs 002-006 estarem prontos. Com este PRD concluído, o **Bloco 0 (Fundação) está completo**.

### Esclarecimento de Dúvidas

> **💬 Antes de implementar, faça perguntas para esclarecer qualquer ambiguidade sobre: requisitos funcionais, restrições técnicas, dependências, comportamentos esperados e critérios de aceitação.**

### Instruções Obrigatórias

> **⚠️ 1. ANTES DE IMPLEMENTAR:**
> "Lembre-se: explore a estrutura dos dados, planeje primeiro cada passo, analise, investigue a fundo, pense e revise tudo antes de realizar qualquer atualização ou implementação."

> **⚠️ 2. APÓS IMPLEMENTAR:**
>
> - Incrementar a versão do app seguindo [SemVer](https://semver.org/) — **este PRD fecha o Bloco 0, marco para release v0.2.0 codinome Hub**
> - Atualizar o `CHANGELOG.md` seguindo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
> - Renomear este arquivo adicionando `_DONE` ao final
>   Ex: `PRD-007-multistore_DONE.md`
> - Atualizar a seção "Status de Implementação"
> - Atualizar o `INDEX-PRDs-Gallo-Base-Diesel.md` marcando todos os 7 PRDs do Bloco 0 como ✅ Implementados

### Princípios de Implementação

| Princípio                                  | Descrição                                                                                     |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| **Modelar agora, operar depois**           | Multi-loja completa no modelo + UX, mas operação MVP só matriz. Refatoração futura é zero     |
| **`storeId` é cidadão obrigatório**        | Toda entidade transacional carrega. Nenhuma create deixa storeId vazio                        |
| **Filtragem implícita**                    | `withStoreScope` aplica automaticamente. Features não precisam lembrar de filtrar             |
| **Owner cross-store, demais single-store** | Scope `all` no RBAC libera; demais ficam restritos                                            |
| **Imutabilidade de storeId**               | Não editável após criação no MVP. Transferência é Fase 2 com fluxo próprio                    |
| **UI presente, ainda que limitada**        | `<StoreSwitcher>` está sempre visível, mesmo com 1 loja, para validar UX e preparar o usuário |
| **Persistência defensiva**                 | localStorage com loja inválida = fallback silencioso para loja primária                       |
| **Audit log de troca**                     | Mudar de loja é evento sensível. Sempre registrar                                             |

### Orientações Gerais

| Aspecto                                 | Orientação                                                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Onde inserir `<MultistoreProvider>`** | No App.tsx: `<ThemeProvider> > <DataProvidersProvider> > <AuthProvider> > <MultistoreProvider> > <BrowserRouter>` |
| **getCurrentContext**                   | Lê stores Zustand de auth + multistore. Útil para chamadas de provider que ocorrem fora de componentes React      |
| **Invalidação de cache**                | Se um dia for adicionado React Query, ao trocar loja invalidar queries cuja chave depende de storeId              |
| **`<StoreSwitcher>` mobile**            | Em viewports < 768px, mostrar apenas o badge de tipo + nome curto, dropdown abre overlay                          |
| **Imutabilidade no MockProvider**       | Wrap das mutations `update` que rejeitam alteração de storeId — mensagem clara                                    |
| **Tipagem de `withStoreScope`**         | Genérico `<T extends Record<string, unknown>>` preservando o tipo dos params de entrada                           |
| **Lista cross-store futura**            | Quando Owner ver lista cross-store (Fase 2 visão executiva), usar `<StoreBadge>` em cada item para distinguir     |

### O que NÃO Fazer

| ❌ Evitar                                                                                       |
| ----------------------------------------------------------------------------------------------- |
| Permitir criação de filial/parceira pela UI no MVP — Fase 2                                     |
| Esquecer de aplicar `withStoreScope` em uma operação `list` de provider                         |
| Permitir alteração de `storeId` em mutations update no MVP                                      |
| Hardcodar `matriz.id` em qualquer lugar — sempre via `useCurrentStore` ou `getStoreForUser`     |
| Multi-tenant por subdomínio — não escolhido, fica explícito                                     |
| Tornar `<StoreSwitcher>` invisível quando só há 1 loja — sempre visível para preparar usuário   |
| Esquecer fallback de localStorage inválido — silenciosamente, sem erro UI                       |
| Logar troca de loja apenas no console — usar `auditLog` real do PRD-006                         |
| Bypassar `withStoreScope` em provider supondo "essa query é segura" — sempre passar pelo helper |
| Modelar transferência de cliente entre lojas no MVP — fica explícito como Fase 2                |
| Implementar consolidação cross-store no MVP — é Bloco 4 (Visão Executiva, PRD-040)              |

---

## Status de Implementação

| Campo                     | Valor                                                                                                                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**                | ✅ IMPLEMENTADO                                                                                                                                                                                                                                    |
| **Data de Implementação** | 2026-05-25                                                                                                                                                                                                                                         |
| **Versão do App**         | v0.6.0                                                                                                                                                                                                                                             |
| **Codinome**              | Compass                                                                                                                                                                                                                                            |
| **Implementado por**      | Claude Opus 4.7 via Claude Code CLI                                                                                                                                                                                                                |
| **Observações**           | Fecha o Bloco 0 (Fundação). Modelagem multi-loja completa, operação MVP restrita à matriz, seletor visual presente, `withStoreScope` aplicado em 11 providers, página `/app/configuracoes/lojas` read-only e documentação em `docs/multistore.md`. |

---

## Histórico

| Data       | Versão | Alteração                                                                                                         |
| ---------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — modelagem multi-loja completa, operação MVP focada na matriz, seletor visual e helpers de scope |

---

**AILA - Sistemas Inteligentes**
