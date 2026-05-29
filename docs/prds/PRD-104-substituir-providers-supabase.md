# PRD-104: Substituir Providers Mock por Supabase

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Repositório**       | _Repositório vivo da Fase 1, diretório `src/providers/supabase/`_                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Objetivo**          | Implementar `SupabaseDataProvider` substituindo o stub criado no PRD-005 Fase 1, mantendo **interface 100% estável** (drop-in replacement). Configurar 2 clients React (`crmClient`, `lojaClient`) com schemas distintos. Mapeamento automático camelCase ↔ snake_case. Tratamento padronizado de erros (RLS denial, constraint violations, integration errors). Quando `VITE_DATA_SOURCE=supabase`, a aplicação roda contra banco real sem refatoração nos consumidores |
| **Tipo**              | Feature                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Complexidade**      | Crítica                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Total de Fases**    | 5                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Prioridade**        | P0 — destrava o "lado real" do switch e abre todas as Ondas 5+                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Épico**             | Onda 4 — Backend Supabase Real (v2.0.0 Engine)                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **PRDs Relacionados** | PRD-005 Fase 1 (Provider Pattern — fonte da interface); PRD-002 Fase 1 (modelo conceitual); PRD-101 (Schema — tabelas que este provider acessa); PRD-103 (RLS — segurança); PRD-107 (Auth — JWT com claims); PRD-102 (Edge Functions — operações privilegiadas); PRD-108 (Performance — caching opcional)                                                                                                                                                                |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Padrão de código**  | Feature-based; código em `src/providers/supabase/`; uma classe `SupabaseDataProvider` ou conjunto de módulos funcionais (decisão do dev — interface única deve ser preservada)                                                                                                                                                                                                                                                                                           |

### Critérios de Complexidade

> **Justificativa de Crítica:** este PRD é o **portal de saída do MVP mockado** para o sistema real. Toca dezenas de componentes consumidores indiretamente. Erro aqui causa regressão em todas as telas. Envolve: mapeamento TS↔SQL (camelCase↔snake_case) em ~50 entidades, 2 clients distintos (crm + storefront) com schemas diferentes, tratamento de erros do Supabase (códigos PostgREST, RLS denials, constraints, network), preservação da interface do PRD-005, ponte para Edge Functions em operações privilegiadas, validação E2E sobre a navegação inteira da Fase 1. Risco máximo de regressão; vale dedicação total.

---

## Contexto do Problema

A Fase 1 entregou o **Provider Pattern** (PRD-005) com 2 implementações:

- `MockDataProvider` — operacional, retorna dados de `src/mocks/`
- `SupabaseDataProvider` — **stub**, lança `NotImplementedError` em todo método

O switch `VITE_DATA_SOURCE=mock|supabase` na verdade só funciona com mock. Por mais que tabelas, RLS e Edge Functions já estejam prontas (PRDs 101, 102, 103), o frontend não consegue consumir — falta o tradutor entre o mundo TS (camelCase, interfaces) e o mundo SQL (snake_case, JSONB).

Este PRD **destrava o switch**. Após este PRD:

- `VITE_DATA_SOURCE=supabase npm run dev` roda contra staging real
- Login com user existente, navegação por todas as telas Fase 1, listagens, filtros, ordenações funcionam
- Mocks continuam operacionais (`VITE_DATA_SOURCE=mock`) — não removemos nada

A complexidade não está em "fazer query" — está em **garantir que cada um dos N métodos da interface do PRD-005 mapeia 1:1 com o que o consumidor espera**, sem regressão visual, sem regressão de comportamento, sem vazamento de erro server-side, com performance pelo menos comparável aos mocks (mocks rodam em < 5ms; Supabase São Paulo p95 < 100ms).

---

## Conceito da Solução

### Arquitetura

```
src/
├── providers/
│   ├── mock/                       ← já existe (PRD-005)
│   │   └── MockDataProvider.ts
│   ├── supabase/                   ← NOVO neste PRD
│   │   ├── SupabaseDataProvider.ts ← classe principal (ou módulos)
│   │   ├── clients.ts              ← crmClient + lojaClient
│   │   ├── mappers/                ← mapeamento TS↔SQL
│   │   │   ├── customer.ts
│   │   │   ├── order.ts
│   │   │   ├── lead.ts
│   │   │   └── ... (um por entidade)
│   │   ├── errors.ts               ← mapeamento de erros Supabase → AppError
│   │   ├── invocations/            ← chamadas a Edge Functions privilegiadas
│   │   │   ├── refreshStorefront.ts
│   │   │   ├── writeAuditLog.ts
│   │   │   └── ...
│   │   └── __tests__/
│   ├── ProviderFactory.ts          ← já existe; escolhe entre mock e supabase
│   └── IDataProvider.ts            ← já existe; interface estável
├── types/
│   ├── supabase.generated.ts       ← gerado pelo PRD-101 (commited)
│   └── domain/                     ← interfaces TS canônicas (IPart, ICustomer etc.)
```

### Dois clients distintos

Conforme decisão consolidada do briefing v1.3 §4.3:

```typescript
// src/providers/supabase/clients.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase.generated";

const URL = import.meta.env.VITE_SUPABASE_URL!;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY!;

export const crmClient = createClient<Database>(URL, ANON_KEY, {
  db: { schema: "crm" },
  auth: { persistSession: true, autoRefreshToken: true },
});

export const lojaClient = createClient<Database>(URL, ANON_KEY, {
  db: { schema: "storefront" },
  auth: { persistSession: true, autoRefreshToken: true },
});
```

Componentes do `/app`, `/pwa`, `/portal` consomem via `SupabaseDataProvider` (que internamente usa `crmClient`).
Componentes do `/loja` consomem `SupabaseStorefrontProvider` (analogamente, via `lojaClient`).

**Importante:** o `SupabaseDataProvider` é a fachada que segue a interface `IDataProvider` definida no PRD-005. Internamente pode usar 1 ou 2 clients — para componentes consumidores, é transparente.

### Mapeamento camelCase ↔ snake_case

Padrão funcional:

```typescript
// src/providers/supabase/mappers/customer.ts
import type { Database } from "@/types/supabase.generated";
import type { ICustomer } from "@/types/domain/customer";

type CustomerRow = Database["crm"]["Tables"]["customers"]["Row"];

export function rowToCustomer(row: CustomerRow): ICustomer {
  return {
    id: row.id,
    storeId: row.store_id,
    sellerId: row.seller_id,
    name: row.name,
    document: row.document,
    documentType: row.document_type as "cpf" | "cnpj" | null,
    email: row.email,
    phone: row.phone,
    whatsapp: row.whatsapp,
    address: row.address as ICustomer["address"], // jsonb → objeto tipado
    customerType: row.customer_type as "b2c" | "b2b",
    segmentationTags: row.segmentation_tags ?? [],
    consentRecords: row.consent_records as ICustomer["consentRecords"],
    lgpdStatus: row.lgpd_status as ICustomer["lgpdStatus"],
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function customerToInsert(
  customer: Omit<ICustomer, "id" | "createdAt" | "updatedAt">,
): Database["crm"]["Tables"]["customers"]["Insert"] {
  return {
    store_id: customer.storeId,
    seller_id: customer.sellerId,
    name: customer.name,
    document: customer.document,
    document_type: customer.documentType,
    email: customer.email,
    phone: customer.phone,
    whatsapp: customer.whatsapp,
    address: customer.address,
    customer_type: customer.customerType,
    segmentation_tags: customer.segmentationTags,
    consent_records: customer.consentRecords,
    lgpd_status: customer.lgpdStatus,
    is_active: customer.isActive,
  };
}
```

Um mapper por entidade. Repetitivo, mas explícito e type-safe — melhor que reflection magic.

### Tratamento de erros

Padrão:

```typescript
// src/providers/supabase/errors.ts
import { PostgrestError } from "@supabase/supabase-js";
import { AppError } from "@/shared/errors";

export function mapSupabaseError(
  error: PostgrestError | Error,
  context: { operation: string },
): AppError {
  if ("code" in error) {
    const pgError = error as PostgrestError;
    switch (pgError.code) {
      case "23505": // unique violation
        return new AppError("CONFLICT", 409, "Registro duplicado", pgError.message, context);
      case "23503": // foreign key violation
        return new AppError(
          "VALIDATION_ERROR",
          422,
          "Referência inválida",
          pgError.message,
          context,
        );
      case "23514": // check violation (constraint, ex: snapshot schema)
        return new AppError("VALIDATION_ERROR", 422, "Dados inválidos", pgError.message, context);
      case "42501": // permission denied (RLS)
        return new AppError("FORBIDDEN", 403, "Acesso negado", pgError.message, context);
      case "PGRST116": // no rows from .single()
        return new AppError("NOT_FOUND", 404, "Registro não encontrado", pgError.message, context);
      default:
        return new AppError("INTERNAL_ERROR", 500, "Erro interno", pgError.message, context);
    }
  }
  return new AppError("INTERNAL_ERROR", 500, "Erro de rede", error.message, context);
}
```

Consumidores recebem `AppError` consistente, com `code` semântico — o mesmo que vem das Edge Functions (PRD-102). Frontend lida uniforme.

### Operações privilegiadas via Edge Functions

Algumas operações exigem `service_role` (bypass RLS) — refresh de view, write em audit log, batch operations. O provider invoca Edge Functions ao invés de query direta:

```typescript
// src/providers/supabase/invocations/writeAuditLog.ts
import { crmClient } from "../clients";
import type { AuditLogInput } from "@/types/domain/audit";

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  const { error } = await crmClient.functions.invoke("audit-write", {
    body: input,
  });
  if (error) throw new AppError("INTEGRATION_ERROR", 500, "Audit log falhou", error.message);
}
```

A Edge Function `audit-write` (a ser criada como subdeliverable deste PRD ou em PRD-110) usa `service_role` internamente.

### Cache opcional

Provider implementa cache em memória (Map por entidade) com TTL configurável (default: 30s). Útil para reduzir round-trips em telas com múltiplos componentes lendo a mesma entidade. **Não é cache-aside complex** — apenas memoization simples.

Invalidation: toda mutation (INSERT/UPDATE/DELETE) limpa o cache da entidade afetada. Realtime (PRD-105) também invalida.

Para o MVP deste PRD, cache pode ser **opt-in** (desabilitado por default) — habilitar em PRD-108 quando profiling indicar.

### Alternativas Consideradas

| Alternativa                                 | Por que descartada                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| ORM como Prisma                             | Adiciona camada extra; provider já abstrai. Não compensa                            |
| Reflection/Decorators para mapeamento       | Magic difícil de debugar. Mappers explícitos são chatos mas claros                  |
| Provider único multi-schema (sem 2 clients) | Mais complexo internamente (passar schema em cada query). 2 clients é clearer       |
| Cache distribuído (Redis)                   | Overkill para MVP. Cache in-memory resolve                                          |
| RPC functions Postgres para tudo            | RPC para casos específicos é útil; para CRUD direto, PostgREST nativo é melhor      |
| Repository pattern (camada extra)           | Provider já é o repository. Mais camadas = mais boilerplate                         |
| Substituir mocks (deletar)                  | Mocks continuam vivos para demos, treino, dev sem rede. Briefing v1.3 §5.2 garantiu |

---

## Escopo

### Incluído

- ✅ Estrutura `src/providers/supabase/` completa
- ✅ `clients.ts` com `crmClient` e `lojaClient` configurados (schemas separados, tipos `Database`)
- ✅ `SupabaseDataProvider` (ou módulos funcionais equivalentes) implementando 100% da interface `IDataProvider` do PRD-005 — todos os métodos sem `NotImplementedError`
- ✅ Mappers por entidade em `src/providers/supabase/mappers/` (um arquivo por agregado: customer, vehicle, lead, conversation, message, quote, order, commission, goal, etc.)
- ✅ `errors.ts` com `mapSupabaseError()` cobrindo códigos PostgREST mais comuns (23505, 23503, 23514, 42501, PGRST116, etc.)
- ✅ `invocations/` com chamadas a Edge Functions privilegiadas: `writeAuditLog`, `refreshStorefrontProducts`, outros conforme necessidade
- ✅ Atualização do `ProviderFactory.ts` para escolher `MockDataProvider` ou `SupabaseDataProvider` conforme `VITE_DATA_SOURCE`
- ✅ Para o storefront (`/loja`): provider análogo `SupabaseStorefrontProvider` consumindo `lojaClient`, implementando interface `IStorefrontProvider`
- ✅ Cache em memória opt-in com TTL configurável (default desabilitado)
- ✅ Testes unitários cobrindo mappers (round-trip TS → SQL → TS preserva dados) e error mapping
- ✅ Testes E2E em CI (com Playwright ou similar) navegando pelas principais telas Fase 1 contra staging real — valida que o switch funciona end-to-end
- ✅ Documentação `docs/dev/supabase-provider.md` explicando: como o provider funciona, como adicionar mapping de nova entidade, como debugar erros
- ✅ Validação manual final: rodar `VITE_DATA_SOURCE=supabase npm run dev`, fazer login com user de teste, navegar por: dashboard, lista de clientes, ficha de cliente, lista de orçamentos, lista de pedidos, painel gestor, configurações. Cada tela funciona com dados reais do staging.

### Excluído

- ❌ Implementação de cache avançado (Redis, react-query) — PRD-108 reavalia
- ❌ Otimistic updates — PRD-105 (Realtime) ou Onda futura
- ❌ Retry automático com backoff — pode entrar em PRD-110 se necessário; para o MVP, erro vira mensagem ao usuário
- ❌ Implementações de providers de outros schemas além de crm + storefront (não existem)
- ❌ Edge Functions de negócio (vão em PRDs específicos das ondas 5+)
- ❌ Modificações no `MockDataProvider` (mantém intacto)
- ❌ Modificações nos consumidores (componentes React, hooks) — drop-in replacement preserva interface
- ❌ Setup de WebSocket Realtime (vai no PRD-105)
- ❌ Upload/download de arquivos (vai no PRD-106 Storage)

---

## Requisitos Funcionais

### Configuração de Clients

- **RF-001:** Criar `src/providers/supabase/clients.ts` exportando `crmClient` e `lojaClient`.
- **RF-002:** `crmClient` configurado com `db: { schema: 'crm' }`; `lojaClient` com `db: { schema: 'storefront' }`.
- **RF-003:** Ambos clients usam `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (de env, validados na inicialização).
- **RF-004:** Persistência de sessão habilitada (`persistSession: true`) — login persiste em refresh do browser.
- **RF-005:** Auto-refresh de token habilitado (`autoRefreshToken: true`) — Supabase Auth renova JWT antes de expirar.
- **RF-006:** Em desenvolvimento, se `VITE_SUPABASE_URL` está vazio (modo mock), os clients não são instanciados (evita erro). Tentativa de uso retorna AppError clara.

### Mappers (1 por entidade)

- **RF-010:** Para cada agregado da Fase 1 + extensões Fase 2 (vide PRD-101), criar arquivo `src/providers/supabase/mappers/<entidade>.ts` com:
  - `rowTo<Entidade>(row)` — mapeia snake_case SQL para camelCase TS
  - `<entidade>ToInsert(domain)` — mapeia camelCase TS para snake_case Insert
  - `<entidade>ToUpdate(domain)` — análogo para UPDATE (geralmente Partial<Insert>)
- **RF-011:** Entidades a cobrir: `Store`, `Seller`, `Customer`, `Vehicle`, `Brand`, `Category`, `Part`, `Application`, `Lead`, `WhatsAppAccount`, `Conversation`, `Message`, `CustomerNote`, `CustomerSegment`, `VehicleServiceEntry`, `CarteiraTransfer`, `Quote`, `QuoteItem`, `Order`, `OrderItem`, `Goal`, `GamificationBadge`, `Positivation`, `ABCClassification`, `Commission`, `Recommendation`, `Team`, `PortalSettings`, `PlatformSetting`, `AppVersion`, `FeatureFlag`, `AuditLog` (read-only), `LLMProvider`, `LLMOverride`, `LLMUsageMetric`. **Storefront:** `Category`, `Featured`, `ContentPage`, `CartSession`, `CustomerAccount`, `Address`, `ProductReview` + view `Product`.
- **RF-012:** Snapshots JSONB (`price_snapshot`, `cost_snapshot`, `rule_snapshot`) mapeiam para objetos TS tipados via interfaces auxiliares.
- **RF-013:** Tipos do banco vêm de `src/types/supabase.generated.ts` (commited via PRD-101). Mappers usam `Database['crm']['Tables']['<tabela>']['Row']` para type safety.
- **RF-014:** Testes unitários: round-trip `rowToCustomer(customerToInsert(c))` deve produzir um customer equivalente a `c` (módulo campos gerados como id/created_at).

### Implementação do SupabaseDataProvider

- **RF-020:** Classe ou módulo `SupabaseDataProvider` implementa **100%** da interface `IDataProvider` do PRD-005. Métodos esperados (lista parcial — consultar PRD-005 para conjunto completo):
  - Customers: `listCustomers`, `getCustomerById`, `createCustomer`, `updateCustomer`, `transferCustomers`, `searchCustomers`
  - Sellers: `listSellers`, `getCurrentSeller`, `updateSeller`
  - Leads: `listLeads`, `getLeadById`, `createLead`, `updateLead`, `moveLeadStage`, `closeLeadAsWon`, `closeLeadAsLost`
  - Conversations: `listConversations`, `getConversationById`, `getMessages`, `sendMessage` (mock; PRD-115 real)
  - Quotes/Orders: `listQuotes`, `createQuote`, `updateQuote`, `convertQuoteToOrder`, `listOrders`, etc.
  - BI: `getDashboardKPIs`, `getSalesByPeriod`, `getCommissionsByPeriod`, `getABCClassification` etc.
- **RF-021:** Cada método segue padrão:
  1. Construir query usando `crmClient.from('<tabela>').select(...)`
  2. Aplicar filtros (with RLS — não precisa filtrar por seller_id manualmente, RLS faz)
  3. Aplicar ordenação, paginação
  4. Executar
  5. Mapear via `rowTo<Entidade>(row)` — array ou single
  6. Em erro, lançar via `mapSupabaseError()`
- **RF-022:** Métodos que retornam paginação devem aceitar `{ limit, offset }` e retornar `{ items, total }` (total via `{ count: 'exact' }` no Supabase).
- **RF-023:** Métodos de mutation (create/update) retornam a entidade atualizada (após `.select().single()`).

### Implementação do SupabaseStorefrontProvider

- **RF-030:** Análogo ao `SupabaseDataProvider` mas para `lojaClient`. Métodos cobrem:
  - `listProducts` (view `storefront.products`)
  - `getProductById`
  - `listCategories`, `getCategoryBySlug`
  - `getCart`, `addToCart`, `removeFromCart`, `clearCart`
  - `createAccount` (signup B2C)
  - `getAccount`, `updateAccount`
  - `listAddresses`, `createAddress`, `updateAddress`, `deleteAddress`
  - `submitReview` (cria product_review com is_approved=false)
- **RF-031:** Implementa interface `IStorefrontProvider` (extender ou criar nova — decisão de arquitetura local).

### Mapeamento de Erros

- **RF-040:** Função `mapSupabaseError(error, context): AppError` em `src/providers/supabase/errors.ts`.
- **RF-041:** Códigos cobertos:
  - `23505` (unique violation) → `CONFLICT 409 "Registro duplicado"`
  - `23503` (FK violation) → `VALIDATION_ERROR 422 "Referência inválida"`
  - `23514` (check violation) → `VALIDATION_ERROR 422 "Dados inválidos"`
  - `42501` (RLS/permission denied) → `FORBIDDEN 403 "Acesso negado"`
  - `PGRST116` (no rows from .single) → `NOT_FOUND 404 "Registro não encontrado"`
  - `PGRST301` (JWT expired) → `UNAUTHORIZED 401 "Sessão expirada"` — frontend redireciona para login
  - Network/fetch errors → `INTERNAL_ERROR 500 "Erro de rede"`
- **RF-042:** Cada erro carrega `internalMessage` (mensagem original Postgres/PostgREST) para log; **nunca** exposto ao usuário, mas registrado via logger estruturado.

### Edge Function Invocations

- **RF-050:** Em `src/providers/supabase/invocations/` criar wrappers para Edge Functions privilegiadas:
  - `writeAuditLog(input)`: invoca `audit-write` function
  - `refreshStorefrontProducts()`: invoca `storefront-refresh` function (refresh manual da view)
  - Outras conforme necessidade emerge dos métodos do provider
- **RF-051:** Edge Functions correspondentes (`audit-write`, `storefront-refresh`) devem ser criadas neste PRD como subdeliverables. Seguem o padrão de `_shared` do PRD-102.

### Provider Factory

- **RF-060:** Atualizar `src/providers/ProviderFactory.ts` (existe da Fase 1) para:
  - Se `VITE_DATA_SOURCE === 'mock'`: retornar `MockDataProvider` (comportamento atual)
  - Se `VITE_DATA_SOURCE === 'supabase'`: retornar `SupabaseDataProvider`
  - Outro valor: lançar erro claro de configuração na inicialização
- **RF-061:** A factory é a única forma de obter um provider; consumidores nunca instanciam diretamente. Garante isolamento.

### Cache (Opt-in)

- **RF-070:** Cache simples em memória, baseado em `Map<string, { value, expiresAt }>`.
- **RF-071:** Habilitado via env `VITE_PROVIDER_CACHE_ENABLED=true` (default `false`).
- **RF-072:** TTL configurável via `VITE_PROVIDER_CACHE_TTL_MS` (default 30000).
- **RF-073:** Mutations invalidam cache da entidade afetada.
- **RF-074:** Cache não é usado para listagens com filtros dinâmicos (apenas para `getById` single-record).

### Testes

- **RF-080:** Testes unitários (`vitest`) para cada mapper: round-trip preserva dados.
- **RF-081:** Testes unitários para `mapSupabaseError`: cada código mapeia para AppError correto.
- **RF-082:** Testes E2E em CI (Playwright) que rodam contra staging real após deploy:
  - Login com user de teste
  - Navegar para lista de clientes → ver pelo menos 1 cliente (do seed ou criado em teste)
  - Abrir ficha de cliente → ver dados completos
  - Criar customer novo via UI → verificar persistência
  - Tentar acessar cliente de outro vendedor (manipulação manual de URL) → recebe 403/404 mascarado
- **RF-083:** Configurar pipeline CI com job dedicado `e2e-supabase` que roda Playwright contra staging após cada PR. Falha bloqueia merge.

### Documentação

- **RF-090:** `docs/dev/supabase-provider.md` com:
  - Arquitetura do provider (clients, mappers, errors, invocations)
  - Como adicionar suporte a nova entidade (passo a passo)
  - Como debugar erro (logs, network tab, Supabase Dashboard)
  - Convenções para mappers
  - Quando usar Edge Function vs query direta

---

## Requisitos Não-Funcionais

- **RNF-001 (Drop-in — preservar interface):** **Zero modificação** nos consumidores do PRD-005. Hooks, componentes, telas continuam chamando `useDataProvider()` igual. Apenas o switch de env muda a implementação.
- **RNF-002 (Performance — listing):** Listing de 100 customers com paginação < 300ms p95 contra staging (vs ~5ms do mock). Aceitável para MVP.
- **RNF-003 (Performance — single record):** `getCustomerById` < 100ms p95.
- **RNF-004 (Type safety):** `tsc` deve passar sem erros. Tipos `Database` do `supabase.generated.ts` devem ser respeitados em todos os mappers.
- **RNF-005 (Observabilidade):** Toda chamada do provider é instrumentada com logger (level `debug` por default; configurável). Erros sempre logados.
- **RNF-006 (LGPD):** Provider não loga dados pessoais (PII) por padrão — apenas IDs e metadados. Configurável via env para debug temporário.
- **RNF-007 (Backward compat):** Switch para mock deve continuar funcionando 100%. Quem está acostumado a `VITE_DATA_SOURCE=mock` não percebe mudança.
- **RNF-008 (Falha graciosa):** Network failure ou Supabase down não trava UI — provider lança AppError, componentes mostram mensagem de erro elegante.

---

## Critérios de Aceitação

### RF-020 + RNF-001: Drop-in Replacement

```gherkin
DADO uma aplicação rodando com VITE_DATA_SOURCE=mock
  E todas as telas funcionando
QUANDO altero VITE_DATA_SOURCE=supabase e reinicio
ENTÃO a aplicação carrega contra staging real
  E nenhum componente lança erro de "method not implemented"
  E nenhum import precisou mudar nos consumidores
  E todas as telas Fase 1 (lista clientes, ficha, pipeline, painel) carregam com dados reais
```

### RF-010 + RF-014: Mappers Preservam Dados

```gherkin
DADO um customer TS com nome="João", segmentationTags=['VIP','Frota']
QUANDO faço rowToCustomer(customerToInsert(c)) preenchendo created_at/updated_at simulados
ENTÃO o customer resultante tem name="João" e segmentationTags=['VIP','Frota']
  E nenhum campo é perdido
  E camelCase é restaurado corretamente
```

### RF-040 + RF-041: Erros Mapeados Corretamente

```gherkin
DADO tentativa de INSERT em customers violando unique constraint (CPF duplicado)
QUANDO o provider executa via supabase client
ENTÃO Postgres retorna error com code='23505'
  E mapSupabaseError converte para AppError(code='CONFLICT', httpStatus=409)
  E o componente recebe AppError e exibe "Registro duplicado"
  E o logger registra a mensagem original do Postgres (debug)

DADO tentativa de SELECT em customer de outro vendedor (RLS bloqueia)
QUANDO RLS aplica policy e retorna 0 rows
ENTÃO provider chama .single() que retorna PGRST116
  E mapSupabaseError converte para AppError(code='NOT_FOUND', httpStatus=404)
  E usuário vê "Registro não encontrado" (não vaza info sobre existência)
```

### RF-082: E2E Funciona contra Staging

```gherkin
DADO ambiente CI configurado para staging com VITE_DATA_SOURCE=supabase
QUANDO o workflow e2e-supabase.yml executa
ENTÃO Playwright faz login com user de teste
  E navega para /app/clientes
  E vê listagem com customers seed
  E clica em customer → ficha abre com dados completos
  E todos os assertions passam
  E o report Playwright fica disponível para download
```

### RF-060 + RF-061: Factory Funciona em Ambos os Modos

```gherkin
DADO VITE_DATA_SOURCE='mock'
QUANDO ProviderFactory.getProvider() é chamado
ENTÃO retorna MockDataProvider
  E não tenta instanciar SupabaseDataProvider

DADO VITE_DATA_SOURCE='supabase'
QUANDO ProviderFactory.getProvider() é chamado
ENTÃO retorna SupabaseDataProvider
  E crmClient está inicializado

DADO VITE_DATA_SOURCE='blob'
QUANDO ProviderFactory.getProvider() é chamado
ENTÃO lança erro claro "VITE_DATA_SOURCE deve ser 'mock' ou 'supabase', recebido 'blob'"
```

---

## Fases de Implementação

### Fase 1 — Clients + factory + provider esqueleto (1 dia)

- Criar `src/providers/supabase/clients.ts` (crmClient + lojaClient)
- Criar `src/providers/supabase/SupabaseDataProvider.ts` esqueleto (implementa interface mas todos métodos lançam `NotImplementedError` ainda)
- Atualizar `ProviderFactory.ts` para usar `VITE_DATA_SOURCE`
- Validar: `VITE_DATA_SOURCE=supabase` carrega a aplicação (telas vão mostrar erro nas chamadas, mas a app boots)

### Fase 2 — Mappers + métodos core (2 dias)

- Implementar mappers para: Customer, Seller, Vehicle, Part, Lead, Conversation, Message
- Implementar métodos core: `listCustomers`, `getCustomerById`, `listLeads`, `getConversationById`, `getMessages`
- Tela "Lista de Clientes" e "Ficha de Cliente" funcionando contra staging
- Tests unitários de mappers

### Fase 3 — Comercial + BI (2 dias)

- Mappers para: Quote, QuoteItem, Order, OrderItem, Commission, Goal, etc.
- Métodos de cockpit, vendas, comissões, metas
- Painel gestor funcionando contra staging
- E2E test #1: lista clientes

### Fase 4 — Storefront + Erros + Invocations (1.5 dias)

- Storefront provider completo
- `errors.ts` mapeamento de códigos
- Invocações de Edge Functions (`writeAuditLog`, `storefront-refresh`)
- Edge Functions correspondentes implementadas (segue padrão PRD-102)
- E2E test #2: navegação storefront

### Fase 5 — Cache + Testes + Docs (1.5 dias)

- Cache opt-in (default off)
- E2E tests Playwright cobrindo principais fluxos
- Workflow CI `e2e-supabase.yml`
- Documentação `docs/dev/supabase-provider.md`
- Validação manual completa (Edmilson + Frederico)
- Marcar como `_DONE`

---

## Dependências

### PRDs

- **Bloqueia:** PRD-105 (Realtime — depende de provider real para subscriptions), Onda 5+ (todas usam dados reais)
- **Depende de:**
  - **PRD-005 Fase 1** (interface IDataProvider)
  - **PRD-101** (tabelas + tipos gerados)
  - **PRD-102** (infra Edge Functions)
  - **PRD-103** (RLS — provider opera sob policies; mocks de seed precisam estar acessíveis)
  - PRD-107 parcial — sem custom claims, vendedor logado vê tudo da store? Não — RLS bloqueia se `seller_id` não está populado. **Workaround:** durante desenvolvimento, criar JWT manualmente com claims fixas. **Solução final:** PRD-107 completa o ciclo.

### Bibliotecas

- `@supabase/supabase-js` (já no projeto da Fase 1)
- `vitest` (já no projeto)
- `@playwright/test` para E2E (adicionar)

### Decisões Pendentes

- **Cache TTL default:** sugestão 30s; pode ajustar.
- **Realtime hooks:** parte vai no PRD-105; aqui, provider deve estar "preparado" para integrar (não bloqueante).
- **Estratégia de paginação:** offset-based (simples) vs cursor-based (escalável). MVP: offset-based; PRD-108 reavalia para volume.

---

## Cadeia de PRDs

```
   ┌──────────────┐
   │ PRD-005 F1   │
   │ Interface    │
   └──────┬───────┘
          │
   ┌──────▼───────┐
   │ PRDs 101-103 │
   │ Schema+Edge  │
   │ +RLS pronto  │
   └──────┬───────┘
          │
   ┌──────▼───────┐
   │ PRD-104      │ ← ESTE
   │ Provider     │
   │ Real         │
   └──────┬───────┘
          │
   ┌──────┼──────┐
   ▼      ▼      ▼
 PRD-105 PRD-107 Onda 5+
 Realtime Auth   Webhooks etc.
```

---

## Considerações de Segurança

- **ANON_KEY exposta no bundle:** correto e esperado. Segurança está no JWT + RLS. ANON_KEY sem JWT não acessa nada além de `storefront` público.
- **JWT validation:** delegada ao Supabase. Provider não valida — apenas passa headers automaticamente via supabase-js.
- **RLS confiança:** provider não filtra manualmente por `seller_id` etc. RLS faz. Defense-in-depth real.
- **Audit log write via Edge Function:** evita que frontend (com ANON_KEY) possa flooded audit_logs — Edge Function (service_role) tem rate limit natural.
- **Mensagens de erro sanitized:** `mapSupabaseError` nunca propaga `internalMessage` para UI — apenas `userMessage` genérico. Logs registram detalhes (server-side).
- **Cache em memória:** dados sensíveis ficam em memória JS — limpos no logout (provider expõe `clearCache()`).
- **PII em logs:** RNF-006 garante que provider não loga PII por default. Debug logging em produção deve ser desabilitado.

---

## Fluxos de Uso

### Fluxo principal — Listar clientes

```
[Vendedor abre /app/clientes]
   ──▶ useCustomers() hook chama provider.listCustomers({ limit: 50 })
   ──▶ SupabaseDataProvider monta query: crmClient.from('customers').select('*', { count: 'exact' }).range(0, 49)
   ──▶ JWT atual é incluído automaticamente
   ──▶ Postgres aplica RLS: filtra customers onde seller_id = current_seller_id()
   ──▶ Retorna ~23 linhas (carteira do vendedor)
   ──▶ Provider aplica rowToCustomer() em cada row
   ──▶ Retorna { items: ICustomer[], total: 23 }
   ──▶ Hook atualiza estado React
   ──▶ Tela renderiza
```

### Fluxo de erro — RLS bloqueia

```
[Vendedor abre /app/clientes/<id-de-outro-vendedor>]
   ──▶ useCustomer(id) chama provider.getCustomerById(id)
   ──▶ SupabaseDataProvider: crmClient.from('customers').select('*').eq('id', id).single()
   ──▶ RLS filtra: customer não tem seller_id = current → 0 linhas
   ──▶ .single() retorna error com code='PGRST116' (no rows)
   ──▶ mapSupabaseError → AppError(NOT_FOUND, 404, "Registro não encontrado")
   ──▶ Componente recebe AppError
   ──▶ Tela exibe "Cliente não encontrado" (não vaza existência)
```

### Fluxo de mutation — Criar customer

```
[Vendedor preenche form e clica "Salvar"]
   ──▶ provider.createCustomer({ name, document, ... })
   ──▶ customerToInsert(customer) → snake_case object
   ──▶ crmClient.from('customers').insert([row]).select().single()
   ──▶ RLS permite (INSERT policy aceita seller_id = current_seller_id)
   ──▶ Postgres triggers updated_at, gera id
   ──▶ Retorna row inserida
   ──▶ rowToCustomer(row) → entidade TS
   ──▶ Cache invalidado (se ativo)
   ──▶ Provider retorna ICustomer
   ──▶ Tela atualiza, redireciona para ficha
```

---

## Convenções de Código (Referência Rápida)

| Elemento                     | Convenção                                      | Exemplo                                     |
| ---------------------------- | ---------------------------------------------- | ------------------------------------------- |
| **Diretório provider**       | `src/providers/supabase/`                      | —                                           |
| **Clients**                  | exports nomeados singletons                    | `export const crmClient = ...`              |
| **Mappers**                  | funções `rowTo<X>` e `<x>ToInsert/Update`      | `rowToCustomer`, `customerToInsert`         |
| **Files**                    | kebab-case ou camelCase consistente            | `customer.ts` (camelCase preferido para TS) |
| **Edge Function invocation** | wrapper em `invocations/`                      | `writeAuditLog.ts`                          |
| **Provider methods**         | camelCase verbo + entidade                     | `listCustomers`, `getCustomerById`          |
| **Error class**              | reutilizar `AppError` do `_shared` se possível | importar do PRD-102 ou shared module        |

---

## Notas para o Agente Desenvolvedor

> **Contexto:** Claude Code CLI implementando. PRD pelo Arquiteto na web.

### Esclarecimento de Dúvidas

> 💬 Confirme: estratégia de paginação (offset vs cursor — sugerido offset), TTL default de cache (sugerido 30s desabilitado por default), estratégia de loading state (suspense vs explicit), `react-query` adoção (talvez sim, simplifica cache/invalidação — mas é decisão do dev).

### Instruções Obrigatórias

> ⚠️ **1. ANTES DE IMPLEMENTAR:** Releia PRD-005 Fase 1 completo para conhecer a interface IDataProvider exata. Releia mappers como referência. Use os tipos gerados em `src/types/supabase.generated.ts` (PRD-101).

> ⚠️ **2. APÓS IMPLEMENTAR:**
>
> - Bump app para v2.0.0-rc.4
> - CHANGELOG detalhado por entidade implementada
> - Renomear `PRD-104-substituir-providers-supabase_DONE.md`
> - E2E tests passando em CI
> - Documentação completa

### Princípios de Implementação

| Princípio                           | Descrição                                                             |
| ----------------------------------- | --------------------------------------------------------------------- |
| **Drop-in is sacred**               | Zero modificação em consumidores. Se precisa modificar, pare e reveja |
| **Mappers explícitos**              | Sem magic. Cada campo mapeado à mão é melhor que reflection           |
| **Erros nunca vazam internos**      | userMessage genérico; internalMessage apenas em log                   |
| **RLS é a fonte de verdade**        | Provider não filtra duplicado — confia em RLS                         |
| **Cache é opt-in**                  | Default off; habilitar só onde profiling justifica                    |
| **Test mappers obsessivamente**     | Round-trip é fácil de testar; bugs aqui são silenciosos               |
| **Edge Function para privilegiado** | Audit log, refresh, batch — service_role só via Edge                  |

### Orientações Específicas

| Aspecto                      | Orientação                                                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **TypeScript Database type** | `Database['crm']['Tables']['customers']['Row']` — nunca usar `any`                                                                |
| **JSONB columns**            | Definir interface TS auxiliar para o conteúdo; cast explícito no mapper                                                           |
| **Snapshots**                | Mappers de quote_item, order_item, commission devem mapear snapshots como objetos tipados                                         |
| **Boolean defaults**         | Postgres pode retornar null mesmo em coluna NOT NULL DEFAULT false em casos raros (legacy); validar                               |
| **Date handling**            | timestamptz vem como string ISO. Manter assim no domain ou converter para Date? **Manter string** (consistência com mocks Fase 1) |
| **Paginação**                | `{ count: 'exact' }` em first call para `total`; subsequent fetches sem `count` para perf                                         |
| **MCP debugging**            | Use `Supabase:execute_sql` para validar queries direto no banco antes de implementar no provider                                  |

### O que NÃO Fazer

| ❌ Evitar                                                             |
| --------------------------------------------------------------------- |
| Modificar consumidores (componentes, hooks, telas)                    |
| Acessar `lojaClient` em `/app` ou `crmClient` em `/loja`              |
| Usar `service_role` no frontend (apenas via Edge Function)            |
| Engolir erros (sempre via `mapSupabaseError`)                         |
| Mappers que dependem de input externo (devem ser puros)               |
| Lançar erros não-AppError (use a classe consistentemente)             |
| Logar dados de cliente em produção (PII vazamento)                    |
| Reusar tipos gerados como tipo de domínio (sempre passar pelo mapper) |
| Cache aggressive em listings com filtros (apenas single-record)       |
| Esquecer de tratar `null` em colunas optional                         |
| Quebrar drop-in alterando interface de IDataProvider                  |

---

## Status de Implementação

| Campo                     | Valor       |
| ------------------------- | ----------- |
| **Status**                | ⏳ PENDENTE |
| **Data de Implementação** | -           |
| **Versão do App**         | -           |
| **Implementado por**      | -           |
| **Observações**           | -           |

---

## Histórico

| Data       | Versão | Alteração                                        |
| ---------- | ------ | ------------------------------------------------ |
| 27/05/2026 | v1     | Criação inicial — Sub-lote 1b do Lote 1 (Onda 4) |

---

**AILA - Sistemas Inteligentes**
