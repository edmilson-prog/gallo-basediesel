# Provider Pattern — GALLO BASE DIESEL

> Documento canônico do Provider Pattern adotado pela plataforma.
> Origem: PRD-005 (Arquitetura de Provedores de Dados).
> Stack: Vite + TanStack Router + React + TypeScript estrito.

---

## 1. Por que existe

Quando a Fase 2 chegar, a plataforma vai trocar a camada de mocks por chamadas
ao Supabase. Sem uma abstração no meio, essa troca exigiria varrer dezenas
(centenas) de componentes substituindo imports — com cada feature acoplada
diretamente a `@/mocks`.

O **Provider Pattern** resolve o problema com três camadas:

```
┌──────────────────────────────────────────────────────────┐
│  Features  (CRM, SDR, Gestão, E-commerce, Admin, …)      │
│    consome:  useCustomersProvider(), useOrdersProvider() │
└──────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│  Contratos  (interfaces TypeScript)                      │
│    ICustomersProvider, IOrdersProvider, …                │
└──────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│  Implementações intercambiáveis                          │
│    ├─ mockXxxProvider     (Fase 1, delega @/mocks)       │
│    └─ supabaseXxxProvider (Fase 2, esqueleto)            │
└──────────────────────────────────────────────────────────┘
```

A escolha entre `mock` e `supabase` é feita em **build time** via
`VITE_DATA_SOURCE`. Features nunca tocam essa decisão.

---

## 2. Estrutura no repositório

```
src/providers/data/
├── contracts/              # 16 interfaces + tipo agregador IDataProviders
│   ├── _shared.ts          # IPaginatedResult, IPaginationParams
│   ├── customers.ts        # ICustomersProvider + IListCustomersParams
│   ├── …                   # 15 outros (vehicles, leads, …)
│   └── index.ts            # barrel + IDataProviders
├── impl/
│   ├── mock/               # 16 implementações que delegam para @/mocks
│   └── supabase/           # 16 esqueletos com NotImplementedError
├── hooks/                  # 16 hooks de consumo (useCustomersProvider, …)
├── context.tsx             # DataProviderContext + <DataProvidersProvider>
├── errors.ts               # NotImplementedError
├── factory.ts              # getDataProviders() — escolhe via env
└── index.ts                # ⬅ ÚNICA superfície pública
```

**Regra de ouro:** features só importam de `@/providers/data`. ESLint
(`no-restricted-imports`) bloqueia qualquer outra entrada.

---

## 3. Switch de implementação

| `VITE_DATA_SOURCE` | Implementação ativa                   | Quando usar                               |
| ------------------ | ------------------------------------- | ----------------------------------------- |
| `mock` (default)   | `mockXxxProvider` (PRD-004)           | Toda a Fase 1, demos, Storybook, CI       |
| `supabase`         | `supabaseXxxProvider` (PRD-110+)      | Fase 2 (cada agregado entra ao seu tempo) |
| Outro / vazio      | Cai em `mock` + `console.warn` em dev | Erro de config                            |

A leitura acontece uma vez em `factory.ts`. A factory devolve o **mesmo
objeto** em todas as chamadas — referência estável para o Context.

---

## 4. Consumindo dados em uma feature

```tsx
// src/features/customers/components/CustomersList.tsx
import { useEffect, useState } from "react";
import { useCustomersProvider, type IPaginatedResult } from "@/providers/data";
import type { ICustomer } from "@/shared/types";

export function CustomersList({ storeId }: { storeId: string }) {
  const customers = useCustomersProvider();
  const [result, setResult] = useState<IPaginatedResult<ICustomer> | null>(null);

  useEffect(() => {
    customers.list({ storeId, page: 1, pageSize: 20 }).then(setResult);
  }, [customers, storeId]);

  if (!result) return <p>Carregando…</p>;
  return <pre>{JSON.stringify(result, null, 2)}</pre>;
}
```

Note três coisas:

1. **Zero conhecimento da origem dos dados.** Nada de `@/mocks`.
2. **`customers` é estável entre re-renders** — não invalida queries.
3. **`IPaginatedResult` vem do contrato**, não dos mocks.

---

## 5. Adicionando um novo agregado (passo a passo)

Vamos supor que você criou `src/mocks/api/invoices.ts` no PRD-004 com a API
`invoicesApi`. Para expor via Provider Pattern:

1. **Contrato** — `src/providers/data/contracts/invoices.ts`

   ```ts
   import type { ID, IInvoice } from "@/shared/types";
   import type { IPaginatedResult, IPaginationParams } from "./_shared";

   export interface IListInvoicesParams extends IPaginationParams {
     /* … */
   }

   export interface IInvoicesProvider {
     list(params?: IListInvoicesParams): Promise<IPaginatedResult<IInvoice>>;
     get(id: ID): Promise<IInvoice>;
   }
   ```

2. **Mock impl** — `src/providers/data/impl/mock/invoices.ts`

   ```ts
   import { invoicesApi } from "@/mocks";
   import type { IInvoicesProvider } from "../../contracts/invoices";

   export const mockInvoicesProvider: IInvoicesProvider = {
     list: (params) => invoicesApi.list(params),
     get: (id) => invoicesApi.get(id),
   };
   ```

3. **Esqueleto Supabase** — `src/providers/data/impl/supabase/invoices.ts`

   ```ts
   import { NotImplementedError } from "../../errors";
   import type { IInvoicesProvider } from "../../contracts/invoices";

   const stub = (m: string) => () => {
     throw new NotImplementedError(`SupabaseInvoicesProvider.${m} — implementar no PRD-???.`);
   };

   export const supabaseInvoicesProvider: IInvoicesProvider = {
     list: stub("list"),
     get: stub("get"),
   };
   ```

4. **Hook** — `src/providers/data/hooks/useInvoicesProvider.ts`

   ```ts
   import type { IInvoicesProvider } from "../contracts/invoices";
   import { useDataProviderSlice } from "./_useDataProviderSlice";

   export function useInvoicesProvider(): IInvoicesProvider {
     return useDataProviderSlice("invoices", "useInvoicesProvider");
   }
   ```

5. **Tipo agregador** — adicionar `invoices: IInvoicesProvider;` em
   `contracts/index.ts` (e re-export do tipo).

6. **Factory** — adicionar campo em `mockProviders` e `supabaseProviders` em
   `factory.ts`.

7. **Barrel público** — adicionar `useInvoicesProvider` e tipos em
   `src/providers/data/index.ts`.

Sete tocadas. Repetível. Sem surpresas.

---

## 6. Mock delega, Supabase falha alto

| Implementação | Conteúdo                                                                           |
| ------------- | ---------------------------------------------------------------------------------- |
| `mockXxx`     | Apenas **delegação** para `xxxApi` em `@/mocks`. Zero lógica de negócio.           |
| `supabaseXxx` | Cada método lança `NotImplementedError` com nome do provider, método e PRD futuro. |

A regra "mock delega, não inventa" é dura. Qualquer transformação extra entra
em `src/mocks/api/`, nunca no provider — caso contrário, mock e Supabase
divergem silenciosamente.

---

## 7. Onde se aplica este padrão

Este mesmo padrão arquitetural será replicado em outras camadas:

- **`src/providers/whatsapp/`** — `IWhatsAppProvider` com impls `meta` e
  `evolution` (PRDs 100–102).
- **`src/providers/payment/`** — gateway de pagamento (PRD-140).
- **`src/providers/shipping/`** — frete e logística (PRD-130).

Sempre que houver um ponto onde duas (ou mais) integrações concretas precisam
ser intercambiáveis via env var, **espelhe a estrutura de `src/providers/data/`**.

---

## 8. Isolamento via ESLint

| Importação                               | Permitido onde                                 |
| ---------------------------------------- | ---------------------------------------------- |
| `@/mocks` e `@/mocks/api/*`              | `src/providers/data/impl/mock/**` apenas       |
| `@/mocks/store/*` `@/mocks/generators/*` | `src/mocks/**` apenas (interno)                |
| `@/providers/data/impl/*`                | `src/providers/data/**` apenas (factory)       |
| `@/providers/data/contracts/*`           | `src/providers/data/**` apenas (barrel)        |
| `@/providers/data/factory`               | `src/providers/data/**` apenas (context)       |
| `@/providers/data`                       | **Em qualquer lugar — é a superfície pública** |

Exceções: `src/routes/design-system.tsx` pode importar `useResetMocks` de
`@/mocks` (utilitário dev-only de regeração de seed).

A regra é **disciplina de código**, não segurança. Um dev pode burlar com
`// eslint-disable`. Mas em code review, qualquer tentativa de burla acende
um alerta vermelho.

---

## 9. Tree-shaking

A factory importa **as duas implementações** (mock + supabase) no topo do
arquivo. Quando o Vite faz tree-shake em produção, apenas a implementação
ativa entra no bundle — porque a outra branch é estaticamente eliminada pelo
`if` constante (`DATA_SOURCE === "supabase"`).

Isso significa que adicionar dependências pesadas (ex.: `@supabase/supabase-js`
quando chegar) só impacta o bundle quando `VITE_DATA_SOURCE=supabase`.

---

## 10. Erros e debug

`NotImplementedError` carrega no `.message` o nome completo do provider, o
método chamado e o PRD futuro. Stack trace aponta para o componente
consumidor — debug é literalmente "qual feature chamou o método não
implementado?".

```
NotImplementedError: SupabaseCustomersProvider.list — implementar no PRD-110+ (clientes via Supabase).
    at CustomersList (src/features/customers/components/CustomersList.tsx:12:5)
```

---

**AILA — Sistemas Inteligentes**
