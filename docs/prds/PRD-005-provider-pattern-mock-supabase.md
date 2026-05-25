# PRD-005: Arquitetura de Provedores de Dados (Mock/Supabase)

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _A definir após criação no Lovable_ |
| **Objetivo** | Formalizar o Provider Pattern como filosofia transversal da plataforma, criando a camada de abstração que permite alternar entre mock e backend real via switch parametrizado, sem qualquer alteração no código consumidor |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 4 |
| **Prioridade** | Alta |
| **Épico** | Bloco 0 — Fundação |
| **PRDs Relacionados** | PRD-002 (Modelo Conceitual), PRD-004 (Mocks), PRD-006 (RBAC), PRD-007 (Multi-Loja) |
| **Implementação** | 🔵 Claude Code CLI (sobre o scaffold do Lovable) |
| **Padrão de código** | Interfaces em `src/providers/data/contracts/`; implementações em `src/providers/data/impl/`; hooks em `src/providers/data/hooks/`; factory em `src/providers/data/factory.ts` |

### Critérios de Complexidade Utilizados

| Complexidade | Critérios |
|--------------|-----------|
| **Baixa** | 1 arquivo, sem dependências externas, < 100 linhas |
| **Média** | 2-5 arquivos, banco OU integração, funcionalidade isolada |
| **Alta** | 5+ arquivos, múltiplas integrações, regras de negócio complexas |

> **Justificativa de Alta:** define a abstração que serve para todos os agregados (~15 contratos), com duas implementações coexistindo (`MockDataProvider` ativo + `SupabaseDataProvider` esqueleto), factory parametrizada por env, hooks de consumo, context e regras de coerência. É a "fundação invisível" que protege todo o projeto de retrabalho na Fase 2 — escolher errado aqui custa semanas de refatoração depois.

---

## Contexto do Problema

O PRD-004 entregou uma camada de mocks com APIs assíncronas tipadas. Funciona perfeitamente na Fase 1. Mas como exatamente o sistema vai trocar essas APIs por chamadas reais ao Supabase quando chegar a Fase 2? Sem uma resposta arquitetural clara para essa pergunta, três problemas se materializam:

**Componentes importam mocks diretamente.** Se um componente do Bloco 1 escreve `import { customersApi } from '@/mocks'`, ele fica acoplado ao caminho de mocks. Na Fase 2, será preciso varrer toda a base de código trocando esses imports — em dezenas de arquivos, cada um com risco de erro. **Diferenças sutis entre mock e Supabase quebram silenciosamente.** Se a API mock retorna `IPaginatedResult` e o Supabase retorna algo levemente diferente, a UI quebra em produção. Sem um contrato explícito, essas divergências aparecem só em runtime. **Outras integrações futuras (WhatsApp Meta/Evolution, pagamento, frete) não têm template para seguir.** A decisão arquitetural do briefing v1.1 fala em "Provider Pattern parametrizável" como filosofia recorrente, mas até este PRD ela existe só como conceito.

O PRD-005 resolve os três: formaliza o Provider Pattern com **contratos TypeScript explícitos** (interfaces de provider para cada agregado), **factory parametrizada** que decide qual implementação devolver baseado em `VITE_DATA_SOURCE`, **hooks de consumo** que escondem inteiramente a origem dos dados, e estabelece o **template canônico** que outras integrações (WhatsApp, pagamento) vão seguir nos PRDs 100+.

Conceitualmente, este PRD é uma **camada fina** — não adiciona funcionalidade visível ao usuário, apenas reorganiza como features consomem dados. Mas é também a peça mais estratégica do Bloco 0 para a longevidade do projeto.

---

## Conceito da Solução

### Situação Atual (As-Is)

PRD-004 estabeleceu `src/mocks/api/` com funções como `customersApi.list()`. Features podem importar diretamente: `import { customersApi } from '@/mocks'`. Funciona, mas cria acoplamento entre features e a camada de mocks — exatamente o que se quer evitar.

### Situação Desejada (To-Be)

Três camadas claras de responsabilidade:

```
┌──────────────────────────────────────────────────────────┐
│  Features (CRM, SDR, Gestão, E-commerce...)              │
│   └─ consome: useCustomersProvider(), useOrdersProvider() │
└──────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────┐
│  Contratos (interfaces TypeScript)                       │
│   └─ ICustomersProvider, IOrdersProvider, etc.           │
└──────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────┐
│  Implementações intercambiáveis                          │
│   ├─ MockProvider (Fase 1) ──▶ delega para src/mocks/api │
│   └─ SupabaseProvider (Fase 2) ──▶ delega para Supabase  │
└──────────────────────────────────────────────────────────┘
```

A factory escolhe a implementação em build time via `VITE_DATA_SOURCE`. Features nunca veem a implementação, nunca importam de `src/mocks/`. O switch entre mock e Supabase é **literalmente uma variável de ambiente** — zero código consumidor afetado.

### Características fundamentais

- **Um contrato por agregado** (`ICustomersProvider`, `IOrdersProvider`, `IConversationsProvider`, etc.) — paralelo aos arquivos de tipo do PRD-002
- **Assinatura idêntica em ambas as implementações** — TypeScript valida
- **MockProvider** apenas **delega** para as APIs do PRD-004 (não duplica lógica)
- **SupabaseProvider** é um esqueleto tipado na Fase 1 — métodos lançam `NotImplementedError`; serão preenchidos nos PRDs 100+ da Fase 2
- **Factory `getDataProvider()`** lê `import.meta.env.VITE_DATA_SOURCE` (default `'mock'`) e retorna a instância correta
- **Context `<DataProviderContext>`** no root da aplicação (logo após `<ThemeProvider>` e `<AuthProvider>`) expõe a instância via Context API
- **Hooks de consumo** (`useCustomersProvider`, `useOrdersProvider`, etc.) — cada feature usa o hook do seu agregado
- **Mesmo padrão arquitetural** será replicado em outros domínios na Fase 2: WhatsApp providers (PRDs 100-102), pagamento (PRD-140), frete (PRD-130)

### Alternativas Consideradas

| Alternativa | Por que foi descartada |
|-------------|------------------------|
| Sem abstração — features importam direto de `@/mocks` | Acoplamento total; Fase 2 vira retrabalho massivo varrendo dezenas de arquivos |
| React Query como abstração principal | React Query é cache/state management, não orquestração de providers. Pode coexistir, mas não substitui Provider Pattern |
| Service Locator global (objeto singleton) | Difícil de testar, esconde dependências, viola princípios de DI moderna |
| Switch via runtime (toggle no UI) | Provider Pattern é configuração de ambiente, não de UX. Trocar em runtime exigiria reset de estado e cache — complexidade desnecessária |
| Implementar Supabase já na Fase 1 mesmo sem usar | Adiciona dependência pesada (supabase-js ~150KB), credenciais, configuração — sem benefício no MVP |
| Class-based providers com herança | Composition over inheritance: usar objetos plain + interfaces TypeScript é mais simples e tree-shakable |

**Decisão consolidada:** **Provider Pattern com interfaces TypeScript, factory de build-time via env var, hooks de consumo via Context, e `SupabaseProvider` como esqueleto tipado na Fase 1.**

---

## Inventário de Contratos

Cada agregado do PRD-004 vira um contrato no PRD-005. A regra é simples: para cada arquivo em `src/mocks/api/`, há um contrato em `src/providers/data/contracts/` com a mesma forma.

| # | Contrato | Agregado | APIs principais |
|---|----------|----------|-----------------|
| 1 | `ICustomersProvider` | Clientes | list, get, create, update, delete, addNote, listNotes |
| 2 | `IVehiclesProvider` | Veículos | list, get, create, update, addServiceEntry |
| 3 | `ILeadsProvider` | Leads | list, get, create, update, convertToCustomer, markAsLost |
| 4 | `IConversationsProvider` | Conversas | list, get, listByCustomer, listByLead, assign, archive |
| 5 | `IMessagesProvider` | Mensagens | listByConversation, send, markAsRead |
| 6 | `IPartsProvider` | Catálogo | list, get, search, findByOem, findEquivalents |
| 7 | `IQuotesProvider` | Orçamentos | list, get, create, update, convertToOrder, expire |
| 8 | `IOrdersProvider` | Pedidos | list, get, create, update, updateStatus, listByCustomer |
| 9 | `ICommissionsProvider` | Comissões | list, get, listBySeller, listByPeriod, approve, pay |
| 10 | `IGoalsProvider` | Metas | list, get, create, update, calculateProgress |
| 11 | `IRecommendationsProvider` | Recomendações | listForCustomer, listForStore, dismiss |
| 12 | `ITransfersProvider` | Transferências carteira | list, create, revert, expire |
| 13 | `ISegmentsProvider` | Segmentos salvos | list, get, create, update, delete |
| 14 | `ISellersProvider` | Vendedores | list, get, update, listByStore |
| 15 | `IStoresProvider` | Lojas | list, get |
| 16 | `ISettingsProvider` | Configurações de loja | get, update |

Total: **16 contratos**. Cada um tipado de ponta a ponta usando os tipos do PRD-002.

---

## Escopo

### Incluído

- ✅ Estrutura `src/providers/data/` em 4 subpastas:
  - `contracts/` — interfaces TypeScript (16 contratos)
  - `impl/mock/` — implementações que delegam para `src/mocks/api/`
  - `impl/supabase/` — esqueletos tipados que lançam `NotImplementedError`
  - `hooks/` — hooks React de consumo (`useCustomersProvider`, etc.)
- ✅ Factory `getDataProvider()` que decide implementação via `import.meta.env.VITE_DATA_SOURCE` (`'mock' | 'supabase'`, default `'mock'`)
- ✅ Context `<DataProviderContext>` + provider component `<DataProviderProvider>` no root
- ✅ 16 contratos cobrindo todos os agregados do PRD-004
- ✅ Implementação `MockProvider` para cada contrato, delegando para `src/mocks/api/`
- ✅ Esqueleto `SupabaseProvider` para cada contrato com `NotImplementedError` tipado
- ✅ 16 hooks de consumo (um por agregado)
- ✅ Documento `docs/provider-pattern.md` explicando a filosofia para outros agentes desenvolvedores
- ✅ Configuração de `.env.example` documentando `VITE_DATA_SOURCE`
- ✅ Lint rule (ESLint `no-restricted-imports`) impedindo features de importar `@/mocks/api` diretamente — apenas `src/providers/data/impl/mock/` pode
- ✅ Erro tipado `NotImplementedError` em `src/providers/data/errors.ts`
- ✅ Documentação inline (JSDoc) em cada contrato explicando responsabilidade e exemplos de uso

### Excluído

- ❌ Implementação real do Supabase para qualquer contrato — Fase 2 (PRDs 100+)
- ❌ Configuração de cliente Supabase, autenticação, RLS — Fase 2
- ❌ Cache layer (React Query/SWR) — fica em PRD futuro se necessário; no MVP, hooks chamam diretamente
- ❌ Mocking de WhatsApp providers (Meta/Evolution) — escopo do PRD-100 (Fase 2), seguindo este mesmo padrão arquitetural
- ❌ Mocking de gateway de pagamento — PRD-140 (Fase 2)
- ❌ Optimistic updates ou rollback automático — fora do MVP
- ❌ Retry policies, exponential backoff — fora do MVP; tratamento de erro fica na camada de UI
- ❌ Observabilidade (telemetria, distributed tracing) — Fase 2
- ❌ Migration de dados entre mock e supabase — quando trocar, é projeto novo

---

## Anatomia de um Contrato

Exemplo do `ICustomersProvider` para ilustrar o padrão que se replica nos outros 15:

```typescript
// src/providers/data/contracts/customers.ts

import type {
  ICustomer,
  ICustomerNote,
  ID,
  IPaginatedResult,
} from '@/shared/types';

export interface IListCustomersParams {
  storeId?: ID;
  status?: ICustomer['status'];
  sellerId?: ID;
  search?: string;
  tags?: string[];
  segmentId?: ID;
  page?: number;
  pageSize?: number;
  orderBy?: 'name' | 'lastPurchaseAt' | 'ticketMedio';
  orderDir?: 'asc' | 'desc';
}

/**
 * Contrato para acesso a dados de clientes.
 * Implementações: MockCustomersProvider (Fase 1), SupabaseCustomersProvider (Fase 2).
 *
 * @see ../../../mocks/api/customers.ts para implementação atual
 * @see docs/provider-pattern.md para a filosofia geral
 */
export interface ICustomersProvider {
  list(params?: IListCustomersParams): Promise<IPaginatedResult<ICustomer>>;
  get(id: ID): Promise<ICustomer | null>;
  create(input: Omit<ICustomer, 'id' | 'createdAt'>): Promise<ICustomer>;
  update(id: ID, patch: Partial<ICustomer>): Promise<ICustomer>;
  delete(id: ID): Promise<void>;
  addNote(customerId: ID, content: string, authorId: ID): Promise<ICustomerNote>;
  listNotes(customerId: ID): Promise<ICustomerNote[]>;
}
```

A implementação **mock** delega:

```typescript
// src/providers/data/impl/mock/customers.ts

import { customersApi } from '@/mocks/api';  // ÚNICO local autorizado a importar @/mocks
import type { ICustomersProvider } from '../../contracts/customers';

export const mockCustomersProvider: ICustomersProvider = {
  list: customersApi.list,
  get: customersApi.get,
  create: customersApi.create,
  update: customersApi.update,
  delete: customersApi.delete,
  addNote: customersApi.addNote,
  listNotes: customersApi.listNotes,
};
```

A implementação **Supabase** é um esqueleto:

```typescript
// src/providers/data/impl/supabase/customers.ts

import { NotImplementedError } from '../../errors';
import type { ICustomersProvider } from '../../contracts/customers';

export const supabaseCustomersProvider: ICustomersProvider = {
  list: async () => { throw new NotImplementedError('SupabaseCustomersProvider.list — implementar no PRD-110+'); },
  get: async () => { throw new NotImplementedError('SupabaseCustomersProvider.get — implementar no PRD-110+'); },
  create: async () => { throw new NotImplementedError('SupabaseCustomersProvider.create — implementar no PRD-110+'); },
  update: async () => { throw new NotImplementedError('SupabaseCustomersProvider.update — implementar no PRD-110+'); },
  delete: async () => { throw new NotImplementedError('SupabaseCustomersProvider.delete — implementar no PRD-110+'); },
  addNote: async () => { throw new NotImplementedError('SupabaseCustomersProvider.addNote — implementar no PRD-110+'); },
  listNotes: async () => { throw new NotImplementedError('SupabaseCustomersProvider.listNotes — implementar no PRD-110+'); },
};
```

A factory escolhe:

```typescript
// src/providers/data/factory.ts

import { mockCustomersProvider } from './impl/mock/customers';
import { supabaseCustomersProvider } from './impl/supabase/customers';
// ... outros 15

type DataSource = 'mock' | 'supabase';

const DATA_SOURCE: DataSource = (import.meta.env.VITE_DATA_SOURCE as DataSource) ?? 'mock';

export function getDataProviders() {
  if (DATA_SOURCE === 'supabase') {
    return {
      customers: supabaseCustomersProvider,
      // ... outros 15
    };
  }
  return {
    customers: mockCustomersProvider,
    // ... outros 15
  };
}
```

E o consumo em uma feature é trivial:

```typescript
// src/features/customers/components/CustomersList.tsx

import { useCustomersProvider } from '@/providers/data';

export function CustomersList() {
  const customers = useCustomersProvider();

  // depois, em algum useEffect ou onClick:
  const { data, total } = await customers.list({ storeId, page: 1, pageSize: 20 });
}
```

Note que `CustomersList` **não sabe** se está falando com mock ou Supabase. Não importa de `@/mocks`. Não precisa mudar uma linha quando o `VITE_DATA_SOURCE` mudar.

---

## Requisitos Funcionais

### Estrutura e contratos

- **RF-001:** Criar estrutura `src/providers/data/` com subpastas: `contracts/`, `impl/mock/`, `impl/supabase/`, `hooks/`, e arquivos raiz `factory.ts`, `errors.ts`, `context.tsx`, `index.ts`.
- **RF-002:** Definir 16 contratos TypeScript em `src/providers/data/contracts/`, um por arquivo, nomeados conforme inventário (`customers.ts`, `vehicles.ts`, etc.).
- **RF-003:** Cada contrato deve ser uma interface TypeScript com prefixo `I` e sufixo `Provider` (ex: `ICustomersProvider`).
- **RF-004:** As assinaturas de método em cada contrato devem espelhar 1:1 as funções correspondentes em `src/mocks/api/` (mesmo nome, mesmos parâmetros, mesmo retorno).
- **RF-005:** Cada contrato deve ter JSDoc explicando responsabilidade + referência para o arquivo de mock correspondente + referência para `docs/provider-pattern.md`.

### Implementações

- **RF-006:** Criar `src/providers/data/impl/mock/` com 16 arquivos, cada um exportando um objeto que implementa o contrato correspondente delegando para `src/mocks/api/`.
- **RF-007:** Implementações mock devem ser **delegação pura** — sem lógica adicional. Se uma transformação for necessária, ela vive em `src/mocks/api/`, não no provider.
- **RF-008:** Criar `src/providers/data/impl/supabase/` com 16 arquivos esqueleto, cada um implementando o contrato lançando `NotImplementedError` em todos os métodos.
- **RF-009:** Cada mensagem de `NotImplementedError` deve indicar nome do provider + método + PRD futuro onde será implementado.

### Factory e context

- **RF-010:** Criar `src/providers/data/factory.ts` exportando `getDataProviders(): IDataProviders` que retorna objeto com 16 providers.
- **RF-011:** A factory deve ler `import.meta.env.VITE_DATA_SOURCE` e selecionar implementação:
  - `'mock'` (default) → retorna todos os `mockXxxProvider`
  - `'supabase'` → retorna todos os `supabaseXxxProvider`
- **RF-012:** Definir tipo `IDataProviders` em `src/providers/data/contracts/index.ts` agregando todos os 16 contratos.
- **RF-013:** Criar `src/providers/data/context.tsx` com:
  - `DataProviderContext` (React Context com tipo `IDataProviders`)
  - `<DataProvidersProvider>` (componente que envolve children e provê os providers via Context)
- **RF-014:** O `<DataProvidersProvider>` deve ser inserido no `App.tsx` logo após `<AuthProvider>` (que vem após `<ThemeProvider>`).

### Hooks de consumo

- **RF-015:** Criar 16 hooks em `src/providers/data/hooks/`, um por agregado:
  - `useCustomersProvider(): ICustomersProvider`
  - `useOrdersProvider(): IOrdersProvider`
  - ...etc.
- **RF-016:** Cada hook deve consumir `DataProviderContext` e retornar apenas o slice correspondente (ex: `useCustomersProvider()` retorna `context.customers`).
- **RF-017:** Hooks devem lançar erro claro se chamados fora do `<DataProvidersProvider>` (mensagem: "useXxxProvider deve ser usado dentro de <DataProvidersProvider>").

### Barrel e isolamento

- **RF-018:** Criar `src/providers/data/index.ts` (barrel) exportando:
  - Todos os hooks (`useCustomersProvider`, etc.)
  - O componente `<DataProvidersProvider>`
  - O tipo `IDataProviders`
  - **Não exportar** factory diretamente (uso interno)
  - **Não exportar** implementações mock ou supabase (uso interno)
- **RF-019:** Configurar ESLint rule `no-restricted-imports` proibindo features de importar de:
  - `@/mocks/api` (apenas `@/providers/data/impl/mock/*` pode)
  - `@/providers/data/impl/*` (apenas o factory.ts pode)
  - `@/providers/data/contracts/*` direto (consumir via `@/providers/data` barrel)

### Erros e edge cases

- **RF-020:** Definir classe `NotImplementedError` em `src/providers/data/errors.ts` herdando de `Error`, com `name: 'NotImplementedError'`.
- **RF-021:** Se `VITE_DATA_SOURCE` tiver valor inválido (ex: `'foo'`), factory deve cair em `'mock'` com `console.warn` em dev.
- **RF-022:** Se um hook for usado em modo Supabase e atingir um método não implementado, o erro deve ser claro o suficiente para o dev saber qual PRD futuro o cobrirá.

### Documentação

- **RF-023:** Criar `docs/provider-pattern.md` com:
  - Filosofia geral do Provider Pattern no projeto
  - Diagrama de camadas (features → contratos → implementações)
  - Como adicionar um novo contrato (passo a passo)
  - Como migrar uma feature de import direto de mocks para hook do provider
  - Aplicação futura em outras integrações (WhatsApp, pagamento, frete)
- **RF-024:** Atualizar `.env.example` documentando `VITE_DATA_SOURCE=mock` e comentário explicando opções.

---

## Requisitos Não-Funcionais

- **RNF-001 (Tipagem estrita):** Todos os contratos, implementações e hooks devem compilar em modo strict total. Zero `any`.
- **RNF-002 (Tree-shaking):** A implementação não escolhida (ex: Supabase quando em modo mock) deve ser eliminada do bundle pelo Vite via dead code elimination. Validar inspecionando o bundle final.
- **RNF-003 (Performance):** Acesso ao provider via hook deve ter custo zero adicional comparado a import direto (Context é instanciado uma vez, hooks só consomem ref).
- **RNF-004 (Manutenibilidade):** Adicionar um novo agregado deve impactar exatamente: arquivo de contrato + impl mock + impl supabase + hook + atualização da factory + barrel. Padrão repetível.
- **RNF-005 (Isolamento):** Lint rule deve bloquear merges que violem o isolamento (feature importando direto de mocks ou contratos).
- **RNF-006 (Documentação):** Cada contrato tem JSDoc; o documento mestre `provider-pattern.md` existe e é referenciado nas JSDocs.

---

## Critérios de Aceitação

### Contratos e implementações

```gherkin
DADO o contrato ICustomersProvider declarado em contracts/customers.ts
QUANDO o TypeScript compila mockCustomersProvider e supabaseCustomersProvider
ENTÃO ambos devem satisfazer o contrato (validação de tipo)
  E uma divergência de assinatura entre mock e supabase deve quebrar o build
```

### Factory e env switching

```gherkin
DADO que VITE_DATA_SOURCE é "mock" (ou omitido)
QUANDO o app inicia
ENTÃO getDataProviders() deve retornar todos os mockXxxProvider
  E chamadas via hooks devem funcionar normalmente (delegando para src/mocks/api)

DADO que VITE_DATA_SOURCE é "supabase"
QUANDO o app inicia e uma feature chama useCustomersProvider().list()
ENTÃO o método deve lançar NotImplementedError com mensagem clara
  E a mensagem deve referenciar o PRD futuro de implementação

DADO que VITE_DATA_SOURCE é "foo" (valor inválido)
QUANDO o app inicia em dev mode
ENTÃO factory deve cair em "mock" como fallback
  E deve emitir console.warn alertando o desenvolvedor
```

### Hooks e Context

```gherkin
DADO um componente que chama useCustomersProvider() dentro de <DataProvidersProvider>
QUANDO o componente é renderizado
ENTÃO deve receber a instância correta de ICustomersProvider
  E a instância deve ser estável entre re-renders (mesmo objeto)

DADO um componente que chama useOrdersProvider() FORA de <DataProvidersProvider>
QUANDO o componente é renderizado
ENTÃO deve lançar erro com mensagem "useOrdersProvider deve ser usado dentro de <DataProvidersProvider>"
```

### Isolamento via lint

```gherkin
DADO uma feature em src/features/customers/ tenta importar @/mocks/api
QUANDO o ESLint roda
ENTÃO deve reportar erro com mensagem indicando que features devem usar hooks de providers

DADO um arquivo em src/providers/data/impl/mock/ importa @/mocks/api
QUANDO o ESLint roda
ENTÃO deve permitir (é o único local autorizado)
```

### Tree-shaking

```gherkin
DADO que VITE_DATA_SOURCE é "mock"
QUANDO o build de produção é gerado
ENTÃO o bundle final NÃO deve conter código de supabaseXxxProvider
  E não deve conter import de @supabase/supabase-js (se ainda não houver dependência, n/a)

DADO que VITE_DATA_SOURCE é "supabase"
QUANDO o build de produção é gerado
ENTÃO o bundle final NÃO deve conter código de mockXxxProvider nem de src/mocks/*
```

### Cenários de erro

```gherkin
DADO que estou em modo Supabase e um componente chama useQuotesProvider().convertToOrder(id)
QUANDO o método executa
ENTÃO deve lançar NotImplementedError com mensagem incluindo "SupabaseQuotesProvider.convertToOrder — implementar no PRD-110+"
  E o stack trace deve apontar claramente o componente chamador para facilitar debug
```

---

## Fases de Implementação

| Fase | Objetivo | Arquivos Estimados |
|------|----------|-------------------|
| 1 | Estrutura, erros e barrel inicial | 4-5 |
| 2 | Contratos (16 interfaces) + Context + Factory | 18-20 |
| 3 | Implementações Mock (16 arquivos delegando) + hooks (16 arquivos) | 32-34 |
| 4 | Esqueletos Supabase (16 arquivos) + lint rules + documentação | 18-20 |

### Detalhamento das Fases

#### Fase 1: Estrutura Base

**Objetivo:** preparar a infraestrutura compartilhada

**Ações:**
- [ ] Criar estrutura de pastas `src/providers/data/{contracts,impl/mock,impl/supabase,hooks}/`
- [ ] Criar `src/providers/data/errors.ts` com classe `NotImplementedError`
- [ ] Criar `.env.example` com `VITE_DATA_SOURCE=mock` e comentário explicativo
- [ ] Criar arquivo `src/providers/data/index.ts` vazio (será preenchido na Fase 3)
- [ ] Configurar tipos do `import.meta.env` em `src/vite-env.d.ts` para incluir `VITE_DATA_SOURCE`

**Validação:** `NotImplementedError` instanciável com `instanceof Error` funcionando; estrutura criada.

#### Fase 2: Contratos, Context e Factory

**Objetivo:** definir o contrato canônico e a orquestração

**Ações:**
- [ ] Criar os 16 arquivos em `src/providers/data/contracts/` (uma interface por agregado)
- [ ] Criar `src/providers/data/contracts/index.ts` com barrel e tipo `IDataProviders` agregando todos os 16
- [ ] Criar `src/providers/data/factory.ts` com `getDataProviders()` (inicialmente referenciando implementações que ainda nem existem — placeholder com `as IDataProviders`)
- [ ] Criar `src/providers/data/context.tsx` com `DataProviderContext` e `<DataProvidersProvider>`

**Validação:** tipos compilam; factory existe mas ainda não conectada às implementações.

#### Fase 3: Implementações Mock e Hooks

**Objetivo:** conectar provider às APIs do PRD-004 e expor hooks

**Ações:**
- [ ] Criar 16 arquivos em `src/providers/data/impl/mock/`, cada um delegando para `src/mocks/api/`
- [ ] Atualizar `factory.ts` para retornar os mocks quando `DATA_SOURCE === 'mock'`
- [ ] Criar 16 hooks em `src/providers/data/hooks/` (um por agregado)
- [ ] Atualizar `src/providers/data/index.ts` barrel com hooks, `<DataProvidersProvider>` e tipo `IDataProviders`
- [ ] Adicionar `<DataProvidersProvider>` no `App.tsx` (logo após `<AuthProvider>`)

**Validação:** uma feature de teste pode chamar `useCustomersProvider().list()` e receber dados mockados; switch de env var para `supabase` faz hooks falharem (esperado, pois esqueletos lançarão erro).

#### Fase 4: Esqueletos Supabase + Isolamento + Docs

**Objetivo:** preparar o terreno para Fase 2 e proteger o isolamento

**Ações:**
- [ ] Criar 16 arquivos em `src/providers/data/impl/supabase/` com `NotImplementedError` em cada método
- [ ] Atualizar `factory.ts` para retornar Supabase quando `DATA_SOURCE === 'supabase'`
- [ ] Configurar ESLint `no-restricted-imports` para bloquear:
  - `@/mocks/api` em qualquer lugar fora de `src/providers/data/impl/mock/*`
  - `@/providers/data/impl/*` em qualquer lugar fora de `src/providers/data/factory.ts`
  - `@/providers/data/contracts/*` em qualquer lugar fora de `src/providers/data/*`
- [ ] Escrever `docs/provider-pattern.md` com filosofia, diagrama, passo a passo de adição
- [ ] Validar tree-shaking inspecionando bundle de produção em ambos os modos

**Validação:** lint quebra em violações de import; modo Supabase compila mas lança erros tipados em runtime; bundle não inclui implementação não escolhida.

---

## Dependências

### PRDs Anteriores

| PRD | Descrição | Status |
|-----|-----------|--------|
| PRD-002 | Modelo Conceitual de Domínio e Glossário | ⏳ Pendente (tipos consumidos) |
| PRD-004 | Geradores de Dados Fictícios e Camada de Mocks | ⏳ Pendente (APIs consumidas pelo MockProvider) |

### Serviços Externos

| Serviço | Tipo | Status |
|---------|------|--------|
| ESLint com plugin `no-restricted-imports` | Lib | Provavelmente já instalado pelo Lovable |

### Decisões Pendentes

Nenhuma.

---

## Cadeia de PRDs

Este PRD faz parte do épico **"Bloco 0 — Fundação"**.

| Ordem | PRD | Título | Status | Relação |
|-------|-----|--------|--------|---------|
| 1 | PRD-001 | Identidade Visual GALLO e Design System Base | ⏳ | — |
| 2 | PRD-002 | Modelo Conceitual de Domínio e Glossário | ⏳ | Pré-requisito (tipos consumidos pelos contratos) |
| 3 | PRD-003 | Shell do App, Navegação e Layouts Base | ⏳ | Paralelo |
| 4 | PRD-004 | Geradores de Dados Fictícios e Camada de Mocks | ⏳ | Pré-requisito (APIs consumidas pelo MockProvider) |
| **5** | **PRD-005** | **Arquitetura de Provedores de Dados** | **🔄 ATUAL** | Depende de PRD-002 e PRD-004 |
| 6 | PRD-006 | Sistema de Roles, Permissões e Auditoria | ⏳ | Consome providers |
| 7 | PRD-007 | Multi-Loja | ⏳ | Consome providers |

> **Nota:** PRD-005 é a peça que protege todos os PRDs subsequentes do retrabalho na Fase 2. Fazer este PRD bem é o que torna o "drop-in replacement" prometido no briefing efetivo.

**Legenda:** ✅ Implementado | 🔄 Atual | ⏳ Pendente

---

## Considerações de Segurança

### Esqueletos Supabase não vazam credenciais

Como os esqueletos da Fase 1 apenas lançam `NotImplementedError`, **nenhuma credencial Supabase é tocada** neste PRD. A configuração de cliente Supabase real (URL, anon key, RLS) entra nos PRDs 110+ da Fase 2.

### Switch de provider via build-time, não runtime

`VITE_DATA_SOURCE` é lido em build time (no Vite). Não há mecanismo de runtime para trocar de provider, o que é proposital: trocar entre mock e supabase em runtime exigiria reset de cache, autenticação, estado — complexidade desnecessária. Build com `VITE_DATA_SOURCE=mock` é o build de dev/demo; build com `VITE_DATA_SOURCE=supabase` é o build de produção (Fase 2).

### Lint não é segurança

A regra de lint `no-restricted-imports` é **disciplina de código**, não segurança. Um dev determinado pode burlar (`// eslint-disable-next-line`). A disciplina vem de code review e cultura — lint só ajuda a flagear acidentes.

---

## Fluxos de Usuário

> Este PRD é estrutural, sem fluxos diretos de usuário final. Os fluxos relevantes são os do **desenvolvedor**:

### Fluxo Principal — Feature consome dados

1. Dev cria componente `CustomersList`
2. Importa `useCustomersProvider` de `@/providers/data`
3. Chama `customers.list({ ... })` em um `useEffect` ou handler
4. Recebe dados (no MVP, vêm do MockProvider via APIs do PRD-004)
5. Renderiza na UI

### Fluxo Alternativo — Switch para Supabase (Fase 2)

1. Time decide ativar Supabase em ambiente de staging
2. Define `VITE_DATA_SOURCE=supabase` no `.env.staging`
3. Roda build de staging
4. Factory retorna `supabaseXxxProvider` em vez de mocks
5. Features chamam exatamente o mesmo código — sem alteração
6. **Se o PRD de implementação Supabase do agregado ainda não foi feito**, o método lança `NotImplementedError` com mensagem clara

### Fluxo de Adição — Novo agregado precisa de provider

1. Dev cria novo agregado no PRD-004 (mocks)
2. Cria novo contrato em `src/providers/data/contracts/`
3. Cria implementação mock em `impl/mock/` delegando para o novo agregado
4. Cria esqueleto supabase em `impl/supabase/`
5. Atualiza `factory.ts` (adiciona campo)
6. Atualiza tipo `IDataProviders`
7. Cria hook em `hooks/`
8. Atualiza barrel `index.ts`

8 arquivos tocados em padrão repetível — sem surpresas.

### Fluxo de Erro — Lint protege isolamento

1. Dev distraído escreve `import { customersApi } from '@/mocks/api'` em uma feature
2. ESLint quebra com mensagem clara: "Features devem consumir dados via hooks de providers (useCustomersProvider). Importação direta de @/mocks/api não é permitida."
3. Dev corrige, usa `useCustomersProvider()`
4. PR passa no review

---

## Convenções de Código (Referência Rápida)

> **Consulte a Seção 5 do `guia-prd.md` para a versão completa.**

| Elemento | Convenção | Exemplo |
|----------|-----------|---------|
| **Contratos** | PascalCase + `I` + sufixo `Provider` | `ICustomersProvider`, `IOrdersProvider` |
| **Implementações mock** | camelCase + prefixo `mock` + sufixo `Provider` | `mockCustomersProvider`, `mockOrdersProvider` |
| **Implementações supabase** | camelCase + prefixo `supabase` + sufixo `Provider` | `supabaseCustomersProvider`, `supabaseOrdersProvider` |
| **Hooks** | camelCase + prefixo `use` + sufixo `Provider` | `useCustomersProvider()`, `useOrdersProvider()` |
| **Tipo agregador** | PascalCase + `I` + `DataProviders` | `IDataProviders` |
| **Componente do Context** | PascalCase + sufixo `Provider` | `<DataProvidersProvider>` |
| **Erros** | PascalCase + sufixo `Error` | `NotImplementedError` |
| **Pastas** | kebab-case | `data/`, `contracts/`, `impl/mock/` |
| **Arquivos** | kebab-case | `customers.ts`, `factory.ts` |
| **Env vars** | `VITE_` prefix | `VITE_DATA_SOURCE` |
| **Git commits** | Conventional Commits | `feat: add provider pattern with mock and supabase scaffolding` |

---

## Notas para o Agente Desenvolvedor

> **Contexto:** Você é o Claude Opus 4.7 operando via Claude Code CLI v2.1.3. Este PRD foi criado pelo Agente Arquiteto (Claude Opus 4.7 na plataforma web). Este PRD é implementado **após** PRD-002 e PRD-004 estarem prontos.

### Esclarecimento de Dúvidas

> **💬 Antes de implementar, faça perguntas para esclarecer qualquer ambiguidade sobre: requisitos funcionais, restrições técnicas, dependências, comportamentos esperados e critérios de aceitação.**

### Instruções Obrigatórias

> **⚠️ 1. ANTES DE IMPLEMENTAR:**
> "Lembre-se: explore a estrutura dos dados, planeje primeiro cada passo, analise, investigue a fundo, pense e revise tudo antes de realizar qualquer atualização ou implementação."

> **⚠️ 2. APÓS IMPLEMENTAR:**
> - Incrementar a versão do app seguindo [SemVer](https://semver.org/)
> - Atualizar o `CHANGELOG.md` seguindo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
> - Renomear este arquivo adicionando `_DONE` ao final
>   Ex: `PRD-005-provider-pattern-mock-supabase_DONE.md`
> - Atualizar a seção "Status de Implementação"

### Princípios de Implementação

| Princípio | Descrição |
|-----------|-----------|
| **Contrato é lei** | Mock e Supabase devem ter assinatura **idêntica**. TypeScript valida; se quebrar, é erro de design — não relaxar o tipo, ajustar a implementação |
| **Mock delega, não inventa** | `mockXxxProvider` apenas repassa para `customersApi.list` etc. Nunca faz transformação ou lógica adicional |
| **Supabase falha alto** | `NotImplementedError` deve ter mensagem útil incluindo PRD futuro. Falha cedo é melhor que falha confusa |
| **Hooks são finos** | Cada hook é 3-5 linhas: usa Context, retorna o slice, valida que está dentro do Provider |
| **Isolamento via lint** | Confiar em disciplina de dev é otimismo. Lint é a rede de segurança |
| **Padrão para tudo** | Este mesmo padrão se aplica a WhatsApp (PRDs 100-102), pagamento (PRD-140), frete (PRD-130). Quando criar esses contratos futuros, espelhar a estrutura de `src/providers/data/` em `src/providers/whatsapp/`, etc. |

### Orientações Gerais

| Aspecto | Orientação |
|---------|------------|
| **Mensagens de erro** | `NotImplementedError` deve dizer claramente qual provider, qual método, e em qual PRD futuro. Ex: `"SupabaseOrdersProvider.create — implementar no PRD-110 (DINTEC) ou PRD-120 (ERP de terceiros)"` |
| **Tipagem do `import.meta.env`** | Adicionar interface em `src/vite-env.d.ts` para que `import.meta.env.VITE_DATA_SOURCE` seja tipado como `'mock' \| 'supabase' \| undefined` |
| **Estabilidade da instância dos providers** | A factory retorna a mesma instância sempre (não cria nova a cada chamada) — assim os hooks têm referência estável |
| **Context fora do AuthProvider** | A ordem no `App.tsx` deve ser: `<ThemeProvider>` > `<DataProvidersProvider>` > `<AuthProvider>` > rotas. AuthProvider eventualmente vai consumir providers (para verificar credenciais na Fase 2) |
| **Validação de env** | Logar em console qual `VITE_DATA_SOURCE` está ativo, mas só em dev mode |

### O que NÃO Fazer

| ❌ Evitar |
|----------|
| Adicionar lógica de negócio nos `mockXxxProvider` — eles delegam, ponto |
| Importar `@/mocks/api` em qualquer arquivo fora de `src/providers/data/impl/mock/` |
| Importar `@/providers/data/contracts/customers` direto numa feature — sempre via barrel `@/providers/data` |
| Fazer `<DataProvidersProvider>` envolver dentro do `<BrowserRouter>` (deve envolver por fora) |
| Esquecer de configurar `no-restricted-imports` no ESLint |
| Tornar a factory async — ela é síncrona; providers são instâncias prontas, não promises |
| Implementar Supabase de verdade neste PRD — é esqueleto |
| Esquecer de documentar `VITE_DATA_SOURCE` no `.env.example` |
| Misturar contratos em um único arquivo — um arquivo por agregado |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ⏳ PENDENTE |
| **Data de Implementação** | - |
| **Versão do App** | - |
| **Codinome** | - |
| **Implementado por** | - |
| **Observações** | - |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 25/05/2026 | v1 | Criação inicial — Provider Pattern para 16 agregados com factory parametrizada via VITE_DATA_SOURCE |

---

**AILA - Sistemas Inteligentes**
