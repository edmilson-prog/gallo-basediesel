# Conversas fixadas no Inbox — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada atendente fixa até N conversas (N por loja, padrão 5) que passam a aparecer no topo do Inbox, independentemente dos filtros e da paginação.

**Architecture:** Tabela nova `conversation_pins` (por vendedor, RLS de dono) + um segundo fetch limitado por ids, mesclado à frente da lista existente numa **lista única de exibição**. O teto vive em `stores.settings->'inboxPins'` (jsonb, sem migration). Nada do cache de Atendimento (realtime, signing de mídia, query keys de mensagens) é tocado.

**Tech Stack:** React 19 + TypeScript strict, TanStack Router/Query, Zustand (mocks), Tailwind v4 + shadcn/ui, Supabase (PostgREST + RLS), Vitest, bun.

**Spec:** `docs/superpowers/specs/2026-08-11-inbox-conversas-fixadas-design.md`

## Global Constraints

- **Provider Pattern:** features nunca importam `@/mocks` nem `@/providers/data/impl/*`. Todo acesso a dado passa pelo barrel `@/providers/data`.
- **Congelado por ordem do dono:** não alterar `useConversationsList.ts`, `useRealtimeConversations.ts`, `useRealtimeMessages.ts`, `useMessages.ts`, `useSeedSignedMediaUrls.ts`, `useResolvedMediaUrl.ts`, `useConversationMessageMedia.ts`, nem qualquer query key de mensagem/mídia.
- **Migration não é aplicada por este trabalho.** O arquivo `.sql` vai versionado no PR; aplicar em produção exige OK explícito do dono. Mergear o PR não aplica nada.
- **Tokens semânticos apenas** (`text-muted-foreground`, `border-border`, `bg-card`, `text-severity-*`). Nunca primitivos `--gallo-*` nem hex direto.
- **Idioma:** código, comentários e mensagens de commit em inglês; toda string de UI em português do Brasil, com acentuação correta.
- **Interfaces de domínio** levam prefixo `I`. `strict: true` — sem `any`.
- **Teto:** padrão **5**, faixa aceita **1–20**.
- **Commits:** Conventional Commits, um por task, ao final dela.
- **Rodar teste de um arquivo:** `bunx vitest run <caminho>`. Suite inteira: `bun run test`. Build: `bun run build`.

---

### Task 1: Tipo do parâmetro, defaults e engine de regras

Regra pura primeiro, sem React e sem rede. É a única parte com teste automatizado, e todas as tasks seguintes consomem estas funções.

**Files:**
- Modify: `src/shared/types/platform.ts` (novo tipo + campo em `IPlatformSettings`)
- Modify: `src/shared/types/index.ts:24-49` (export do tipo no barrel)
- Create: `src/features/conversations/config/pinDefaults.ts`
- Create: `src/features/conversations/engine/pinPolicy.ts`
- Test: `src/features/conversations/engine/pinPolicy.test.ts`

**Interfaces:**
- Consumes: nada (primeira task).
- Produces:
  - `IInboxPinsSettings { maxPinned: number }` em `@/shared/types`
  - `IPlatformSettings.inboxPins?: IInboxPinsSettings`
  - `DEFAULT_INBOX_PINS_SETTINGS: IInboxPinsSettings`, `MIN_PINNED = 1`, `MAX_PINNED = 20` em `../config/pinDefaults`
  - `resolveMaxPinned(raw: number | undefined): number`
  - `canPinMore(pinnedCount: number, maxPinned: number): boolean`
  - `shouldShowPinnedBlock(ctx: { searchActive: boolean; messageSearchActive: boolean; pinnedCount: number }): boolean`
  - `mergePinnedFirst(pinned: IConversation[], list: IConversation[]): { items: IConversation[]; pinnedCount: number }`

- [ ] **Step 1: Declarar o tipo do parâmetro**

Em `src/shared/types/platform.ts`, logo após a interface `IEchoContinuitySettings` (que termina antes do bloco de `ISoundSettings`), adicionar:

```ts
/**
 * Conversas fixadas do Inbox (spec 2026-08-11). O pin em si é PESSOAL de cada
 * atendente (tabela `conversation_pins`); a loja define apenas quantas cabem.
 * Guardado em `stores.settings->'inboxPins'`. Ausente → DEFAULT_INBOX_PINS_SETTINGS.
 */
export interface IInboxPinsSettings {
  /** Teto de conversas fixadas por atendente. Inteiro em [1, 20]. */
  maxPinned: number;
}
```

- [ ] **Step 2: Adicionar o campo em `IPlatformSettings`**

Em `src/shared/types/platform.ts`, dentro de `IPlatformSettings`, logo abaixo da linha `echoContinuity?: IEchoContinuitySettings;`:

```ts
  /** Conversas fixadas do Inbox (2026-08-11). Undefined → DEFAULT_INBOX_PINS_SETTINGS. */
  inboxPins?: IInboxPinsSettings;
```

- [ ] **Step 3: Exportar o tipo no barrel**

Em `src/shared/types/index.ts`, dentro do bloco `export type { ... } from "./platform";`, adicionar `IInboxPinsSettings,` logo após `IIdleAlertsSettings,`.

- [ ] **Step 4: Criar os defaults**

Criar `src/features/conversations/config/pinDefaults.ts`:

```ts
import type { IInboxPinsSettings } from "@/shared/types";

/** Menor teto aceito pela tela de configuração. */
export const MIN_PINNED = 1;

/** Maior teto aceito. Também é o pageSize do fetch das fixadas — o bloco nunca
 *  pede mais linhas do que o teto permite existir. */
export const MAX_PINNED = 20;

/** Teto padrão por atendente (spec 2026-08-11, decisão D-4). */
export const DEFAULT_INBOX_PINS_SETTINGS: IInboxPinsSettings = { maxPinned: 5 };
```

- [ ] **Step 5: Escrever o teste falhando**

Criar `src/features/conversations/engine/pinPolicy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { IConversation } from "@/shared/types";
import { canPinMore, mergePinnedFirst, resolveMaxPinned, shouldShowPinnedBlock } from "./pinPolicy";

/** Conversa mínima — só os campos que o engine lê (id). */
function conv(id: string): IConversation {
  return { id } as IConversation;
}

describe("resolveMaxPinned", () => {
  it("cai no padrão 5 quando o valor está ausente", () => {
    expect(resolveMaxPinned(undefined)).toBe(5);
  });

  it("cai no padrão quando o valor não é um número finito", () => {
    expect(resolveMaxPinned(Number.NaN)).toBe(5);
    expect(resolveMaxPinned(Number.POSITIVE_INFINITY)).toBe(5);
  });

  it("prende o valor na faixa [1, 20]", () => {
    expect(resolveMaxPinned(0)).toBe(1);
    expect(resolveMaxPinned(-3)).toBe(1);
    expect(resolveMaxPinned(999)).toBe(20);
  });

  it("trunca fração para inteiro", () => {
    expect(resolveMaxPinned(7.5)).toBe(7);
  });

  it("preserva um valor válido", () => {
    expect(resolveMaxPinned(3)).toBe(3);
  });
});

describe("canPinMore", () => {
  it("libera abaixo do teto", () => {
    expect(canPinMore(4, 5)).toBe(true);
  });

  it("bloqueia no teto", () => {
    expect(canPinMore(5, 5)).toBe(false);
  });

  it("bloqueia acima do teto (teto reduzido depois de já ter fixado)", () => {
    expect(canPinMore(7, 5)).toBe(false);
  });
});

describe("shouldShowPinnedBlock", () => {
  it("esconde quando não há nenhuma fixada", () => {
    expect(
      shouldShowPinnedBlock({ searchActive: false, messageSearchActive: false, pinnedCount: 0 }),
    ).toBe(false);
  });

  it("esconde durante busca por texto", () => {
    expect(
      shouldShowPinnedBlock({ searchActive: true, messageSearchActive: false, pinnedCount: 3 }),
    ).toBe(false);
  });

  it("esconde no modo de busca em mensagens", () => {
    expect(
      shouldShowPinnedBlock({ searchActive: false, messageSearchActive: true, pinnedCount: 3 }),
    ).toBe(false);
  });

  it("mostra no caso normal", () => {
    expect(
      shouldShowPinnedBlock({ searchActive: false, messageSearchActive: false, pinnedCount: 3 }),
    ).toBe(true);
  });
});

describe("mergePinnedFirst", () => {
  it("coloca as fixadas na frente e preserva a ordem de cada lado", () => {
    const result = mergePinnedFirst([conv("p1"), conv("p2")], [conv("a"), conv("b")]);
    expect(result.items.map((c) => c.id)).toEqual(["p1", "p2", "a", "b"]);
    expect(result.pinnedCount).toBe(2);
  });

  it("não duplica a fixada que também veio na lista", () => {
    const result = mergePinnedFirst([conv("p1")], [conv("a"), conv("p1"), conv("b")]);
    expect(result.items.map((c) => c.id)).toEqual(["p1", "a", "b"]);
    expect(result.pinnedCount).toBe(1);
  });

  it("sem fixadas devolve a lista intacta", () => {
    const result = mergePinnedFirst([], [conv("a"), conv("b")]);
    expect(result.items.map((c) => c.id)).toEqual(["a", "b"]);
    expect(result.pinnedCount).toBe(0);
  });

  it("sem lista devolve só as fixadas", () => {
    const result = mergePinnedFirst([conv("p1")], []);
    expect(result.items.map((c) => c.id)).toEqual(["p1"]);
    expect(result.pinnedCount).toBe(1);
  });
});
```

- [ ] **Step 6: Rodar o teste e confirmar que falha**

Run: `bunx vitest run src/features/conversations/engine/pinPolicy.test.ts`
Expected: FAIL — `Failed to resolve import "./pinPolicy"`.

- [ ] **Step 7: Implementar o engine**

Criar `src/features/conversations/engine/pinPolicy.ts`:

```ts
import type { IConversation } from "@/shared/types";
import { DEFAULT_INBOX_PINS_SETTINGS, MAX_PINNED, MIN_PINNED } from "../config/pinDefaults";

/**
 * Regras puras das conversas fixadas (spec 2026-08-11). Sem React e sem rede —
 * é aqui que mora tudo o que precisa ser testado.
 */

/**
 * Sanea o teto vindo de `stores.settings->'inboxPins'->'maxPinned'`: um jsonb
 * editado à mão pode trazer qualquer coisa, e um teto inválido não pode nem
 * derrubar a tela nem liberar pin infinito.
 */
export function resolveMaxPinned(raw: number | undefined): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_INBOX_PINS_SETTINGS.maxPinned;
  }
  const floored = Math.floor(raw);
  if (floored < MIN_PINNED) return MIN_PINNED;
  if (floored > MAX_PINNED) return MAX_PINNED;
  return floored;
}

/**
 * Cabe mais uma? Falso ao atingir OU ultrapassar o teto — o Owner pode reduzir
 * o teto depois de alguém já ter fixado mais do que ele, e nesse caso o certo é
 * travar novos pins, nunca desafixar por conta própria.
 */
export function canPinMore(pinnedCount: number, maxPinned: number): boolean {
  return pinnedCount < maxPinned;
}

/**
 * O bloco de fixadas aparece? Some durante qualquer busca (decisão D-3): a busca
 * é global por decisão do dono e ignora todos os filtros, então um bloco fixo
 * acima do resultado só competiria com o que foi buscado.
 */
export function shouldShowPinnedBlock(ctx: {
  searchActive: boolean;
  messageSearchActive: boolean;
  pinnedCount: number;
}): boolean {
  if (ctx.pinnedCount === 0) return false;
  return !ctx.searchActive && !ctx.messageSearchActive;
}

/**
 * Lista única de exibição: fixadas na frente, seguidas da lista normal SEM os
 * ids já fixados.
 *
 * Uma lista só (em vez de duas paralelas) é o que mantém corretos, de graça, a
 * navegação por setas, o "zerar badge ao abrir", o "reabrir última conversa" e a
 * ausência de linha duplicada — todos varrem `items` por id.
 */
export function mergePinnedFirst(
  pinned: IConversation[],
  list: IConversation[],
): { items: IConversation[]; pinnedCount: number } {
  if (pinned.length === 0) return { items: list, pinnedCount: 0 };
  const pinnedIds = new Set(pinned.map((c) => c.id));
  const rest = list.filter((c) => !pinnedIds.has(c.id));
  return { items: [...pinned, ...rest], pinnedCount: pinned.length };
}
```

- [ ] **Step 8: Rodar o teste e confirmar que passa**

Run: `bunx vitest run src/features/conversations/engine/pinPolicy.test.ts`
Expected: PASS — 16 testes.

- [ ] **Step 9: Commit**

```bash
git add src/shared/types/platform.ts src/shared/types/index.ts src/features/conversations/config/pinDefaults.ts src/features/conversations/engine/pinPolicy.ts src/features/conversations/engine/pinPolicy.test.ts
git commit -m "feat(conversations): add pinned-conversation policy engine and store setting type"
```

---

### Task 2: Migration da tabela `conversation_pins`

**Files:**
- Create: `supabase/migrations/20260811120000_conversation_pins.sql`

**Interfaces:**
- Consumes: nada.
- Produces: tabela `public.conversation_pins` com colunas `conversation_id`, `seller_id`, `store_id`, `created_at` — consumida pelo provider da Task 3.

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/20260811120000_conversation_pins.sql`:

```sql
-- Conversas fixadas do Inbox (spec 2026-08-11).
--
-- O pin é PESSOAL: guarda a intenção "quero essa conversa à mão" de UM vendedor.
-- Fixar não altera a conversa nem a visão de mais ninguém — por isso a tabela é
-- separada e `conversations` não ganha coluna alguma (o hot path do Inbox já
-- derrubou produção por statement_timeout em 2026-07-02; nada entra lá).
--
-- Esta tabela NÃO é portão de acesso: ler a conversa continua governado pela RLS
-- de `conversations` (modelo de 2 portões). Um pin cuja conversa ficou
-- inacessível simplesmente não retorna no fetch — sem erro e sem vazamento.

create table if not exists public.conversation_pins (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  seller_id       uuid not null references public.sellers(id) on delete cascade,
  store_id        uuid not null references public.stores(id),
  created_at      timestamptz not null default now(),
  primary key (seller_id, conversation_id)
);

comment on table public.conversation_pins is
  'Conversas fixadas no topo do Inbox, por vendedor. Preferência pessoal — nunca um portão de acesso (a RLS de conversations continua valendo).';

-- A PK composta já serve todo SELECT (sempre filtrado por seller_id) e torna o
-- pin duplicado impossível no banco. Este índice serve a ordenação por recência.
create index if not exists conversation_pins_seller_created_idx
  on public.conversation_pins (seller_id, created_at desc);

alter table public.conversation_pins enable row level security;

-- SELECT/INSERT: só os próprios pins, na loja ativa.
create policy "conversation_pins_select"
  on public.conversation_pins for select to authenticated
  using (
    seller_id = (select public.current_seller_id())
    and store_id = (select public.current_store_id())
  );

create policy "conversation_pins_insert"
  on public.conversation_pins for insert to authenticated
  with check (
    seller_id = (select public.current_seller_id())
    and store_id = (select public.current_store_id())
  );

-- DELETE: sem o gate de loja — desafixar precisa funcionar mesmo depois de o
-- vendedor ter trocado de loja ativa, senão o pin fica preso e sem dono.
create policy "conversation_pins_delete"
  on public.conversation_pins for delete to authenticated
  using (seller_id = (select public.current_seller_id()));

-- Sem policy de UPDATE: fixar é INSERT, desafixar é DELETE.
grant select, insert, delete on public.conversation_pins to authenticated;
```

- [ ] **Step 2: Conferir que nada foi aplicado**

Run: `git status --short supabase/migrations/`
Expected: apenas o arquivo novo, não rastreado. **Não** rodar `apply_migration`, `supabase db push` nem qualquer MCP de banco — a aplicação em produção é manual e exige OK explícito do dono.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260811120000_conversation_pins.sql
git commit -m "feat(db): add conversation_pins table with per-seller RLS"
```

---

### Task 3: Provider de pins (contrato + mock + supabase + wiring)

**Files:**
- Create: `src/providers/data/contracts/conversationPins.ts`
- Create: `src/providers/data/impl/mock/conversationPins.ts`
- Create: `src/providers/data/impl/supabase/conversationPins.ts`
- Create: `src/providers/data/hooks/useConversationPinsProvider.ts`
- Modify: `src/providers/data/contracts/index.ts` (import type, export type, campo em `IDataProviders`)
- Modify: `src/providers/data/factory.ts` (2 imports + 2 entradas)
- Modify: `src/providers/data/index.ts` (export do hook + export dos tipos)

**Interfaces:**
- Consumes: nada da Task 1; usa a tabela da Task 2 em runtime.
- Produces:
  - `IConversationPin { conversationId: ID; sellerId: ID; storeId: ID; createdAt: ISO8601 }`
  - `IConversationPinsProvider` com `list(sellerId: ID): Promise<IConversationPin[]>`, `pin(input: { conversationId: ID; sellerId: ID; storeId: ID }): Promise<IConversationPin>`, `unpin(conversationId: ID, sellerId: ID): Promise<void>`
  - hook `useConversationPinsProvider(): IConversationPinsProvider` exportado por `@/providers/data`

- [ ] **Step 1: Criar o contrato**

Criar `src/providers/data/contracts/conversationPins.ts`:

```ts
import type { ID, ISO8601 } from "@/shared/types";

/** Uma conversa fixada por um vendedor (spec 2026-08-11). */
export interface IConversationPin {
  conversationId: ID;
  sellerId: ID;
  storeId: ID;
  createdAt: ISO8601;
}

/**
 * Conversas fixadas no topo do Inbox, por vendedor.
 *
 * O `sellerId` é explícito mesmo no supabase (onde a RLS já o imporia): mantém o
 * mock honesto e garante o uso do índice `(seller_id, created_at desc)`.
 *
 * @see ../../../../supabase/migrations/20260811120000_conversation_pins.sql
 */
export interface IConversationPinsProvider {
  /** Pins do vendedor, fixados mais recentemente primeiro. */
  list(sellerId: ID): Promise<IConversationPin[]>;
  /** Fixa. Idempotente: fixar de novo devolve o pin existente sem erro. */
  pin(input: { conversationId: ID; sellerId: ID; storeId: ID }): Promise<IConversationPin>;
  /** Desafixa. Idempotente: desafixar o que não está fixado é no-op. */
  unpin(conversationId: ID, sellerId: ID): Promise<void>;
}
```

- [ ] **Step 2: Criar a impl mock**

Criar `src/providers/data/impl/mock/conversationPins.ts`:

```ts
import type { ID } from "@/shared/types";
import type { IConversationPin, IConversationPinsProvider } from "../../contracts/conversationPins";
import { logMockMutation } from "./_audit";

/**
 * Mock em memória de {@link IConversationPinsProvider}. Os pins nascem vazios e
 * vivem só na sessão (some no reload) — aceitável para a fonte de dados demo;
 * a persistência real é a impl supabase.
 */
const PINS: IConversationPin[] = [];

export const mockConversationPinsProvider: IConversationPinsProvider = {
  list: async (sellerId) =>
    PINS.filter((p) => p.sellerId === sellerId).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    ),

  pin: async ({ conversationId, sellerId, storeId }) => {
    const existing = PINS.find(
      (p) => p.conversationId === conversationId && p.sellerId === sellerId,
    );
    if (existing) return existing;
    const pin: IConversationPin = {
      conversationId,
      sellerId,
      storeId,
      createdAt: new Date().toISOString(),
    };
    PINS.push(pin);
    logMockMutation({
      action: "create",
      resource: "conversation_pin",
      resourceId: conversationId,
      after: pin,
      storeId,
    });
    return pin;
  },

  unpin: async (conversationId: ID, sellerId: ID) => {
    const idx = PINS.findIndex(
      (p) => p.conversationId === conversationId && p.sellerId === sellerId,
    );
    if (idx < 0) return;
    const [removed] = PINS.splice(idx, 1);
    logMockMutation({
      action: "delete",
      resource: "conversation_pin",
      resourceId: conversationId,
      storeId: removed?.storeId,
    });
  },
};
```

- [ ] **Step 3: Criar a impl supabase**

Criar `src/providers/data/impl/supabase/conversationPins.ts`:

```ts
import type { ID } from "@/shared/types";
import type { IConversationPin, IConversationPinsProvider } from "../../contracts/conversationPins";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { captureObservabilityException } from "@/shared/lib/observability";

/**
 * Implementação supabase de {@link IConversationPinsProvider}.
 *
 * RLS: SELECT/INSERT só dos próprios pins na loja ativa; DELETE só dos próprios
 * (sem gate de loja, para desafixar continuar funcionando após troca de loja).
 */
interface ConversationPinRow {
  conversation_id: string;
  seller_id: string;
  store_id: string;
  created_at: string;
}

const TABLE = "conversation_pins";
const COLUMNS = "conversation_id, seller_id, store_id, created_at";

/** Postgres: relação inexistente — a migration ainda não foi aplicada. */
const UNDEFINED_TABLE = "42P01";
/** Postgres: violação de unicidade — o pin já existe (fixar duas vezes). */
const UNIQUE_VIOLATION = "23505";

function rowToPin(row: ConversationPinRow): IConversationPin {
  return {
    conversationId: row.conversation_id,
    sellerId: row.seller_id,
    storeId: row.store_id,
    createdAt: row.created_at,
  };
}

export const supabaseConversationPinsProvider: IConversationPinsProvider = {
  async list(sellerId: ID): Promise<IConversationPin[]> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("seller_id", sellerId)
      .order("created_at", { ascending: false });
    if (error) {
      // Migration ainda não aplicada não pode derrubar o Inbox: a feature fica
      // inerte (zero fixadas) e o caso é reportado. Qualquer OUTRO erro (RLS,
      // rede) propaga normalmente — nada de engolir falha de verdade.
      if (error.code === UNDEFINED_TABLE) {
        captureObservabilityException(
          new Error(`[supabase] conversation_pins ausente: ${error.message}`),
          { source: "conversationPins.list" },
        );
        return [];
      }
      throw new Error(`[supabase] conversationPins.list(${sellerId}) failed: ${error.message}`);
    }
    return (data as unknown as ConversationPinRow[]).map(rowToPin);
  },

  async pin({ conversationId, sellerId, storeId }): Promise<IConversationPin> {
    const createdAt = new Date().toISOString();
    // INSERT sem `.select()`: o RETURNING reavalia a policy de SELECT no mesmo
    // comando e não há nada a ganhar com o round-trip — a linha é inteiramente
    // conhecida aqui.
    const { error } = await getSupabaseClient().from(TABLE).insert({
      conversation_id: conversationId,
      seller_id: sellerId,
      store_id: storeId,
      created_at: createdAt,
    });
    if (error && error.code !== UNIQUE_VIOLATION) {
      throw new Error(`[supabase] conversationPins.pin(${conversationId}) failed: ${error.message}`);
    }
    return { conversationId, sellerId, storeId, createdAt };
  },

  async unpin(conversationId: ID, sellerId: ID): Promise<void> {
    const { error } = await getSupabaseClient()
      .from(TABLE)
      .delete()
      .eq("conversation_id", conversationId)
      .eq("seller_id", sellerId);
    if (error) {
      throw new Error(
        `[supabase] conversationPins.unpin(${conversationId}) failed: ${error.message}`,
      );
    }
  },
};
```

- [ ] **Step 4: Criar o hook do provider**

Criar `src/providers/data/hooks/useConversationPinsProvider.ts`:

```ts
import type { IConversationPinsProvider } from "../contracts/conversationPins";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useConversationPinsProvider(): IConversationPinsProvider {
  return useDataProviderSlice("conversationPins", "useConversationPinsProvider");
}
```

- [ ] **Step 5: Registrar no barrel dos contratos**

Em `src/providers/data/contracts/index.ts`, três edições:

1. Junto dos outros `import type`, após a linha `import type { IConversationNotesProvider } from "./conversationNotes";`:
```ts
import type { IConversationPinsProvider } from "./conversationPins";
```

2. Junto dos outros `export type`, após `export type { IConversationNotesProvider } from "./conversationNotes";`:
```ts
export type { IConversationPinsProvider, IConversationPin } from "./conversationPins";
```

3. Dentro da interface `IDataProviders`, após a linha `conversationNotes: IConversationNotesProvider;`:
```ts
  conversationPins: IConversationPinsProvider;
```

- [ ] **Step 6: Registrar no factory**

Em `src/providers/data/factory.ts`, quatro edições:

1. Após `import { mockConversationNotesProvider } from "./impl/mock/conversationNotes";`:
```ts
import { mockConversationPinsProvider } from "./impl/mock/conversationPins";
```

2. Após `import { supabaseConversationNotesProvider } from "./impl/supabase/conversationNotes";`:
```ts
import { supabaseConversationPinsProvider } from "./impl/supabase/conversationPins";
```

3. No objeto `mockProviders`, após `conversationNotes: mockConversationNotesProvider,`:
```ts
  conversationPins: mockConversationPinsProvider,
```

4. No objeto `supabaseProviders`, após `conversationNotes: supabaseConversationNotesProvider,`:
```ts
  conversationPins: supabaseConversationPinsProvider,
```

- [ ] **Step 7: Exportar pelo barrel público**

Em `src/providers/data/index.ts`, duas edições:

1. Após `export { useConversationNotesProvider } from "./hooks/useConversationNotesProvider";`:
```ts
export { useConversationPinsProvider } from "./hooks/useConversationPinsProvider";
```

2. Dentro do bloco `export type { ... }` que reexporta os contratos, adicionar as duas entradas (na mesma lista, junto das demais):
```ts
  IConversationPinsProvider,
  IConversationPin,
```

- [ ] **Step 8: Verificar que compila**

Run: `bun run build`
Expected: build conclui sem erro. Se o TypeScript reclamar de `conversationPins` faltando em `IDataProviders`, algum dos dois objetos do factory ficou sem a entrada — os dois são obrigatórios.

- [ ] **Step 9: Commit**

```bash
git add src/providers/data/contracts/conversationPins.ts src/providers/data/impl/mock/conversationPins.ts src/providers/data/impl/supabase/conversationPins.ts src/providers/data/hooks/useConversationPinsProvider.ts src/providers/data/contracts/index.ts src/providers/data/factory.ts src/providers/data/index.ts
git commit -m "feat(providers): add conversation pins provider (mock + supabase)"
```

---

### Task 4: Filtro `ids` no provider de conversas

É assim que uma conversa fixada aparece mesmo estando fora da janela paginada — sem isso, o pin morre junto com a paginação.

**Files:**
- Modify: `src/providers/data/contracts/conversations.ts` (campo em `IListConversationsParams`)
- Modify: `src/providers/data/impl/supabase/conversations.ts:336` (dentro de `list`)
- Modify: `src/mocks/api/conversations.ts:151` (dentro de `applyNonSearchFilters`)

**Interfaces:**
- Consumes: nada.
- Produces: `IListConversationsParams.ids?: ID[]` — usado pelo hook da Task 5.

- [ ] **Step 1: Declarar o parâmetro no contrato**

Em `src/providers/data/contracts/conversations.ts`, dentro de `IListConversationsParams`, logo após o campo `storeId?: ID;`:

```ts
  /**
   * Restringe o resultado a estes ids (bloco de conversas fixadas do Inbox).
   * Lista SEMPRE curta — no máximo o teto de fixadas (20). Nunca usar para
   * paginar um conjunto grande: viraria uma URL gigante no PostgREST.
   */
  ids?: ID[];
```

- [ ] **Step 2: Aplicar no provider supabase**

Em `src/providers/data/impl/supabase/conversations.ts`, dentro de `list`, logo após a linha `if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);`:

```ts
    if (params.ids && params.ids.length > 0) query = query.in("id", params.ids);
```

- [ ] **Step 3: Aplicar no mock**

Em `src/mocks/api/conversations.ts`, dentro de `applyNonSearchFilters`, logo após a linha `if (params.storeId) filtered = filtered.filter((c) => c.storeId === params.storeId);`:

```ts
  if (params.ids && params.ids.length > 0) {
    const wanted = new Set(params.ids);
    filtered = filtered.filter((c) => wanted.has(c.id));
  }
```

- [ ] **Step 4: Verificar que nada regrediu**

Run: `bun run test`
Expected: PASS — mesma contagem de testes de antes (o filtro é aditivo e opcional; nenhum chamador existente passa `ids`).

Run: `bun run build`
Expected: build conclui sem erro.

> **Nota de honestidade:** esta task não ganha teste automatizado próprio — `applyNonSearchFilters` não é exportado e o projeto não tem harness para o provider supabase. A verificação real acontece no smoke da Task 7 (critério de aceite 3: fixar uma conversa antiga, fora da primeira página, e vê-la no topo).

- [ ] **Step 5: Commit**

```bash
git add src/providers/data/contracts/conversations.ts src/providers/data/impl/supabase/conversations.ts src/mocks/api/conversations.ts
git commit -m "feat(providers): support filtering conversations by id list"
```

---

### Task 5: Hook `usePinnedConversations`

**Files:**
- Create: `src/features/conversations/hooks/useInboxPinsLimit.ts`
- Create: `src/features/conversations/hooks/usePinnedConversations.ts`
- Modify: `src/features/conversations/i18n/pt-BR.ts` (bloco `pin` dentro de `INBOX_STRINGS`)

**Interfaces:**
- Consumes: `resolveMaxPinned`, `canPinMore` (Task 1); `MAX_PINNED` (Task 1); `useConversationPinsProvider`, `IConversationPin` (Task 3); `IListConversationsParams.ids` (Task 4).
- Produces:
  - `useInboxPinsLimit(): number`
  - `usePinnedConversations(params: { sellerId: ID | null; refreshKey?: number }): IPinnedConversationsState` com `{ pinnedItems: IConversation[]; pinnedIds: Set<ID>; isPinned: (id: ID) => boolean; togglePin: (conversation: IConversation) => Promise<void>; canPin: boolean; maxPinned: number; pinnedCount: number }`
  - `INBOX_STRINGS.pin.{ fix, unfix, badgeAria, blockTitle, blockCount, limitReached, listSeparator }`

- [ ] **Step 1: Adicionar as strings de UI**

Em `src/features/conversations/i18n/pt-BR.ts`, dentro do objeto `INBOX_STRINGS`, logo após o bloco `messageSearch: { ... },`:

```ts
  // Conversas fixadas (spec 2026-08-11)
  pin: {
    fix: "Fixar conversa",
    unfix: "Desafixar conversa",
    badgeAria: "Conversa fixada",
    blockTitle: "Fixadas",
    blockCount: (n: number, max: number) => `${n}/${max}`,
    limitReached: (max: number) =>
      `Limite de ${max} conversa${max === 1 ? "" : "s"} fixada${max === 1 ? "" : "s"} — desafixe uma para fixar outra.`,
    limitTooltip: "Limite de conversas fixadas atingido",
    listSeparator: "Todas as conversas",
  },
```

- [ ] **Step 2: Criar o hook do teto**

Criar `src/features/conversations/hooks/useInboxPinsLimit.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { useSettingsProvider } from "@/providers/data";
import { useCurrentStore } from "@/features/multistore";
import { resolveMaxPinned } from "../engine/pinPolicy";

const STALE_MS = 30 * 60 * 1000;

/**
 * Teto de conversas fixadas configurado pelo Owner da loja. Compartilha o cache
 * ["platform-settings", storeId] com TagsCard e useConversationTagsHeaderMode
 * (mesma key + staleTime), então não custa requisição nova no Inbox.
 */
export function useInboxPinsLimit(): number {
  const settingsProvider = useSettingsProvider();
  const { currentStoreId } = useCurrentStore();
  const { data } = useQuery({
    queryKey: ["platform-settings", currentStoreId],
    queryFn: () => settingsProvider.get(currentStoreId!).catch(() => null),
    enabled: !!currentStoreId,
    staleTime: STALE_MS,
  });
  return resolveMaxPinned(data?.inboxPins?.maxPinned);
}
```

- [ ] **Step 3: Criar o hook das fixadas**

Criar `src/features/conversations/hooks/usePinnedConversations.ts`:

```ts
import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, IConversation } from "@/shared/types";
import {
  useConversationPinsProvider,
  useConversationsProvider,
  type IConversationPin,
} from "@/providers/data";
import { MAX_PINNED } from "../config/pinDefaults";
import { canPinMore } from "../engine/pinPolicy";
import { useInboxPinsLimit } from "./useInboxPinsLimit";
import { INBOX_STRINGS } from "../i18n/pt-BR";

/** Mesma janela que a lista usa para colapsar uma rajada de ticks de realtime. */
const REALTIME_REFETCH_DEBOUNCE_MS = 300;

export interface IUsePinnedConversationsParams {
  /** Vendedor dono dos pins. Sem ele (perfil sem vendedor) a feature fica inerte. */
  sellerId: ID | null;
  /** Tick de realtime do Inbox — mantém o preview das fixadas fresco. */
  refreshKey?: number;
}

export interface IPinnedConversationsState {
  /** Conversas fixadas, mais recentes primeiro. */
  pinnedItems: IConversation[];
  pinnedIds: Set<ID>;
  isPinned: (id: ID) => boolean;
  /** Fixa se não estiver fixada, desafixa se estiver. Trata o limite por dentro. */
  togglePin: (conversation: IConversation) => Promise<void>;
  /** Falso ao atingir o teto — desabilita o gesto de fixar. */
  canPin: boolean;
  maxPinned: number;
  pinnedCount: number;
}

/**
 * Conversas fixadas do atendente logado (spec 2026-08-11).
 *
 * Dois fetches encadeados: os pins (ids) e, com eles, as conversas por id. É esse
 * segundo fetch que faz o pin sobreviver a filtro e paginação — a conversa fixada
 * vem mesmo estando fora da janela carregada pela lista.
 *
 * NÃO toca em nada do cache congelado do Atendimento: query keys próprias, sem
 * assinatura de realtime nova (consome o tick que o Inbox já recebe) e sem
 * qualquer relação com o pipeline de mídia.
 */
export function usePinnedConversations({
  sellerId,
  refreshKey = 0,
}: IUsePinnedConversationsParams): IPinnedConversationsState {
  const pinsProvider = useConversationPinsProvider();
  const conversationsProvider = useConversationsProvider();
  const queryClient = useQueryClient();
  const maxPinned = useInboxPinsLimit();

  const pinsKey = useMemo(() => ["conversation-pins", sellerId] as const, [sellerId]);

  const pinsQuery = useQuery({
    queryKey: pinsKey,
    queryFn: () => pinsProvider.list(sellerId as ID),
    enabled: sellerId !== null,
  });

  const pins = useMemo(() => pinsQuery.data ?? [], [pinsQuery.data]);
  const ids = useMemo(() => pins.map((p) => p.conversationId), [pins]);
  // Chave estável do conjunto de ids: sem isso a query refaz o fetch a cada
  // render (um array novo nunca é igual ao anterior por referência).
  const idsKey = useMemo(() => [...ids].sort().join(","), [ids]);

  const conversationsQuery = useQuery({
    queryKey: ["pinned-conversations", sellerId, idsKey] as const,
    queryFn: () =>
      conversationsProvider
        .list({ ids, withTotal: false, page: 1, pageSize: MAX_PINNED })
        .then((res) => res.data),
    enabled: sellerId !== null && ids.length > 0,
  });

  const pinnedItems = useMemo(() => {
    const rows = conversationsQuery.data ?? [];
    // Mesma leitura de recência da lista — quem olha o bloco espera a conversa
    // com movimento mais novo em cima, não a que ele fixou por último.
    return [...rows].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  }, [conversationsQuery.data]);

  const pinnedIds = useMemo(() => new Set(ids), [ids]);
  const isPinned = useCallback((id: ID) => pinnedIds.has(id), [pinnedIds]);

  // O tick de realtime do Inbox também refresca o preview das fixadas. Debounce
  // igual ao da lista para uma rajada virar um único refetch.
  useEffect(() => {
    if (refreshKey === 0) return;
    const handle = window.setTimeout(() => {
      void conversationsQuery.refetch();
    }, REALTIME_REFETCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const togglePin = useCallback(
    async (conversation: IConversation) => {
      if (!sellerId) return;
      const currentlyPinned = pinnedIds.has(conversation.id);
      if (!currentlyPinned && !canPinMore(pins.length, maxPinned)) {
        toast.info(INBOX_STRINGS.pin.limitReached(maxPinned));
        return;
      }
      const previous = queryClient.getQueryData<IConversationPin[]>(pinsKey) ?? pins;
      const optimistic: IConversationPin[] = currentlyPinned
        ? previous.filter((p) => p.conversationId !== conversation.id)
        : [
            {
              conversationId: conversation.id,
              sellerId,
              storeId: conversation.storeId,
              createdAt: new Date().toISOString(),
            },
            ...previous,
          ];
      queryClient.setQueryData(pinsKey, optimistic);
      try {
        if (currentlyPinned) {
          await pinsProvider.unpin(conversation.id, sellerId);
        } else {
          await pinsProvider.pin({
            conversationId: conversation.id,
            sellerId,
            storeId: conversation.storeId,
          });
        }
        await queryClient.invalidateQueries({ queryKey: pinsKey });
      } catch {
        queryClient.setQueryData(pinsKey, previous);
        toast.error(INBOX_STRINGS.actionFailed);
      }
    },
    [sellerId, pinnedIds, pins, maxPinned, queryClient, pinsKey, pinsProvider],
  );

  return {
    pinnedItems,
    pinnedIds,
    isPinned,
    togglePin,
    canPin: sellerId !== null && canPinMore(pins.length, maxPinned),
    maxPinned,
    pinnedCount: pins.length,
  };
}
```

- [ ] **Step 4: Verificar que compila e nada regrediu**

Run: `bun run build`
Expected: build conclui sem erro.

Run: `bun run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/hooks/useInboxPinsLimit.ts src/features/conversations/hooks/usePinnedConversations.ts src/features/conversations/i18n/pt-BR.ts
git commit -m "feat(conversations): add pinned conversations hook and store limit reader"
```

---

### Task 6: Gesto e marca visual na linha da lista

**Files:**
- Modify: `src/features/conversations/components/ConversationListItem.tsx` (prop `isPinned` + ícone)
- Modify: `src/features/conversations/components/QuickActions.tsx` (botão de fixar)

**Interfaces:**
- Consumes: `INBOX_STRINGS.pin` (Task 5).
- Produces:
  - `IConversationListItemProps.isPinned?: boolean`
  - `IQuickActionsProps.isPinned?: boolean`, `.canPin?: boolean`, `.onTogglePin?: () => void`

- [ ] **Step 1: Aceitar a prop na linha**

Em `src/features/conversations/components/ConversationListItem.tsx`, dentro de `IConversationListItemProps`, após o campo `isUnread: boolean;`:

```ts
  /** Conversa fixada por este atendente — mostra o alfinete ao lado do horário. */
  isPinned?: boolean;
```

E na desestruturação de `ConversationListItemInner`, após `isUnread,`, adicionar `isPinned,`.

- [ ] **Step 2: Renderizar o alfinete**

No mesmo arquivo, trocar a linha do horário relativo:

```tsx
            <span className="text-xs text-muted-foreground">{relative}</span>
```

por:

```tsx
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {isPinned && (
                <Icon
                  icon="mdi:pin"
                  size={11}
                  className="shrink-0"
                  aria-label={INBOX_STRINGS.pin.badgeAria}
                />
              )}
              {relative}
            </span>
```

`Icon` e `INBOX_STRINGS` já estão importados no arquivo.

- [ ] **Step 3: Aceitar as props no QuickActions**

Em `src/features/conversations/components/QuickActions.tsx`, substituir a interface:

```ts
export interface IQuickActionsProps {
  conversation: IConversation;
  onMutated?: () => void;
}
```

por:

```ts
export interface IQuickActionsProps {
  conversation: IConversation;
  onMutated?: () => void;
  /** Conversa já fixada por este atendente. */
  isPinned?: boolean;
  /** Falso quando o teto de fixadas foi atingido — desabilita o botão de fixar. */
  canPin?: boolean;
  /** Ausente ⇒ o botão de fixar não é renderizado (ex.: perfil sem vendedor). */
  onTogglePin?: () => void;
}
```

E a assinatura do componente:

```ts
export function QuickActions({ conversation, onMutated }: IQuickActionsProps) {
```

por:

```ts
export function QuickActions({
  conversation,
  onMutated,
  isPinned = false,
  canPin = true,
  onTogglePin,
}: IQuickActionsProps) {
```

- [ ] **Step 4: Renderizar o botão de fixar**

No mesmo arquivo, dentro do `<div className="flex items-center gap-0.5 …">`, ANTES do bloco `{canSelfAssign && (`:

```tsx
      {onTogglePin && (
        <Tooltip>
          <TooltipTrigger asChild>
            {/* O botão desabilitado não dispara eventos de mouse, e o Tooltip
                precisa de um alvo que os dispare — daí o span intermediário. */}
            <span className="inline-flex">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={!isPinned && !canPin}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onTogglePin();
                }}
                aria-label={isPinned ? INBOX_STRINGS.pin.unfix : INBOX_STRINGS.pin.fix}
              >
                <Icon icon={isPinned ? "mdi:pin-off-outline" : "mdi:pin-outline"} size={14} />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="left">
            {isPinned
              ? INBOX_STRINGS.pin.unfix
              : canPin
                ? INBOX_STRINGS.pin.fix
                : INBOX_STRINGS.pin.limitTooltip}
          </TooltipContent>
        </Tooltip>
      )}
```

O tooltip do caso "sem espaço" usa `limitTooltip` (texto fixo, sem número) de propósito: o teto vive no hook e empurrá-lo por props até cada linha da lista só para compor uma frase não se paga. O número aparece no toast de `togglePin` e no contador do bloco.

- [ ] **Step 5: Verificar que compila**

Run: `bun run build`
Expected: build conclui sem erro. As props novas são todas opcionais, então o `QuickActions` usado hoje pelo `InboxPage` continua válido (o botão simplesmente não aparece até a Task 7 ligar o `onTogglePin`).

- [ ] **Step 6: Commit**

```bash
git add src/features/conversations/components/ConversationListItem.tsx src/features/conversations/components/QuickActions.tsx src/features/conversations/i18n/pt-BR.ts
git commit -m "feat(conversations): add pin affordance to inbox rows"
```

---

### Task 7: Bloco de fixadas no Inbox

O ponto onde a feature aparece. Depois desta task ela é usável de ponta a ponta.

**Files:**
- Modify: `src/features/conversations/pages/InboxPage.tsx`

**Interfaces:**
- Consumes: `usePinnedConversations` (Task 5), `mergePinnedFirst` + `shouldShowPinnedBlock` (Task 1), props de `ConversationListItem` e `QuickActions` (Task 6).
- Produces: nada para tasks seguintes.

- [ ] **Step 1: Importar o que falta**

Em `src/features/conversations/pages/InboxPage.tsx`, junto dos outros imports de hooks locais:

```ts
import { usePinnedConversations } from "../hooks/usePinnedConversations";
import { mergePinnedFirst, shouldShowPinnedBlock } from "../engine/pinPolicy";
```

- [ ] **Step 2: Chamar o hook e montar a lista de exibição**

No mesmo arquivo, logo APÓS o bloco que define `items` (o `useMemo` que aplica o pós-filtro `escalated`) e ANTES da linha `const related = useRelatedEntities(items, …)`:

```tsx
  const pins = usePinnedConversations({ sellerId, refreshKey: realtime.tick });
  // O bloco some durante qualquer busca (decisão D-3): a busca já ignora todos
  // os filtros, e um bloco fixo acima do resultado competiria com ele.
  const showPinned = shouldShowPinnedBlock({
    searchActive,
    messageSearchActive,
    pinnedCount: pins.pinnedItems.length,
  });
  // Uma lista só: as fixadas na frente, a lista normal sem elas. Setas do
  // teclado, badge de não-lida e "reabrir última conversa" varrem esta lista,
  // então todos passam a enxergar as fixadas sem nenhum caso especial.
  const { items: displayItems, pinnedCount } = useMemo(
    () => mergePinnedFirst(showPinned ? pins.pinnedItems : [], items),
    [showPinned, pins.pinnedItems, items],
  );
```

- [ ] **Step 3: Trocar `items` por `displayItems` nos consumidores**

No mesmo arquivo, cinco substituições:

1. `const related = useRelatedEntities(items, { skipLastMessages: messageSearchActive });`
   → `const related = useRelatedEntities(displayItems, { skipLastMessages: messageSearchActive });`

2. No efeito que reabre a última conversa: `if (!items.find((c) => c.id === lastId)) return;`
   → `if (!displayItems.find((c) => c.id === lastId)) return;`
   e na lista de dependências do mesmo efeito, trocar `items` por `displayItems`.

3. No efeito que zera o contador de não lidas, `rawItems` **permanece** (ele é o
   superset — trocá-lo por `displayItems` regrediria o caso em que o filtro
   "escaladas" esconde a conversa aberta). Só acrescentar o fallback nas fixadas,
   que podem estar fora da janela paginada:

   `const conv = rawItems.find((c) => c.id === selectedId);`
   → `const conv = rawItems.find((c) => c.id === selectedId) ?? pins.pinnedItems.find((c) => c.id === selectedId);`

   e na lista de dependências, acrescentar `pins.pinnedItems` (mantendo `rawItems`).

4. No handler de teclado, trocar as três ocorrências de `items` por `displayItems`
   (`items.findIndex`, `items[0]`, `items.length - 1`, `items[next]`), e a dependência `items` do `useEffect` por `displayItems`.

5. No `useMemo` do `unreadGlobal`, trocar `items` por `displayItems` (nas duas ocorrências: corpo e dependências).

- [ ] **Step 4: Renderizar cabeçalho, separador e as linhas**

No mesmo arquivo, substituir o bloco de renderização das linhas:

```tsx
          {!error &&
            items.map((conversation) => (
              <ConversationListItem
                key={conversation.id}
```

por:

```tsx
          {!error &&
            displayItems.map((conversation, index) => (
              <div key={conversation.id}>
                {showPinned && index === 0 && (
                  <div className="flex items-center justify-between gap-2 bg-muted/40 px-3 py-1.5">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Icon icon="mdi:pin" size={12} />
                      {INBOX_STRINGS.pin.blockTitle}
                    </span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {INBOX_STRINGS.pin.blockCount(pinnedCount, pins.maxPinned)}
                    </span>
                  </div>
                )}
                {showPinned && pinnedCount > 0 && index === pinnedCount && (
                  <div className="bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {INBOX_STRINGS.pin.listSeparator}
                  </div>
                )}
                <ConversationListItem
```

A `key` passou para o `<div>` externo — remover a linha `key={conversation.id}` que ficou logo abaixo de `<ConversationListItem`.

Fechar o `<div>` extra: no fim do mesmo bloco, trocar

```tsx
                showAssignee={showAssignee}
              />
            ))}
```

por:

```tsx
                showAssignee={showAssignee}
                />
              </div>
            ))}
```

- [ ] **Step 5: Ligar a prop `isPinned` e o botão do QuickActions**

No mesmo `ConversationListItem`, adicionar a prop (junto de `isUnread`):

```tsx
                isPinned={pins.isPinned(conversation.id)}
```

E no `trailing`, substituir:

```tsx
                trailing={
                  conversation.isAccessible === false ? undefined : (
                    <QuickActions conversation={conversation} onMutated={refetch} />
                  )
                }
```

por:

```tsx
                trailing={
                  conversation.isAccessible === false ? undefined : (
                    <QuickActions
                      conversation={conversation}
                      onMutated={refetch}
                      isPinned={pins.isPinned(conversation.id)}
                      canPin={pins.canPin}
                      onTogglePin={sellerId ? () => void pins.togglePin(conversation) : undefined}
                    />
                  )
                }
```

- [ ] **Step 6: Verificar que compila e nada regrediu**

Run: `bun run build`
Expected: build conclui sem erro.

Run: `bun run test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/conversations/pages/InboxPage.tsx
git commit -m "feat(conversations): render pinned conversations block at the top of the inbox"
```

---

### Task 8: Fixar pelo menu da conversa aberta

**Files:**
- Modify: `src/features/conversations/components/ConversationMenu.tsx`
- Modify: `src/features/conversations/pages/ConversationPage.tsx:268-277`

**Interfaces:**
- Consumes: `usePinnedConversations` (Task 5), `INBOX_STRINGS.pin` (Task 5).
- Produces: `IConversationMenuProps.isPinned?: boolean`, `.canPin?: boolean`, `.onTogglePin?: () => void`

- [ ] **Step 1: Aceitar as props no menu**

Em `src/features/conversations/components/ConversationMenu.tsx`, dentro de `IConversationMenuProps`, após `onMutated?: () => void;`:

```ts
  /** Conversa fixada no topo do Inbox por este atendente. */
  isPinned?: boolean;
  /** Falso quando o teto de fixadas foi atingido. */
  canPin?: boolean;
  /** Ausente ⇒ o item de fixar não é renderizado. */
  onTogglePin?: () => void;
```

E na desestruturação do componente, após `onMutated,`:

```ts
  isPinned = false,
  canPin = true,
  onTogglePin,
```

- [ ] **Step 2: Importar as strings do Inbox**

No mesmo arquivo, na linha de import do i18n, trocar:

```ts
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";
```

por:

```ts
import { CONVERSATION_STRINGS, INBOX_STRINGS } from "../i18n/pt-BR";
```

- [ ] **Step 3: Renderizar o item**

No mesmo arquivo, dentro de `<DropdownMenuContent align="end" className="w-56">`, logo ANTES do bloco `{canEditOwn && ( <DropdownMenuItem onSelect={handleResolveToggle}>`:

```tsx
          {onTogglePin && (
            <DropdownMenuItem
              onSelect={() => {
                if (!isPinned && !canPin) {
                  toast.info(INBOX_STRINGS.pin.limitTooltip);
                  return;
                }
                onTogglePin();
              }}
            >
              <Icon
                icon={isPinned ? "mdi:pin-off-outline" : "mdi:pin-outline"}
                size={14}
                className="mr-2"
              />
              {isPinned ? INBOX_STRINGS.pin.unfix : INBOX_STRINGS.pin.fix}
            </DropdownMenuItem>
          )}
```

`toast` e `Icon` já estão importados no arquivo.

- [ ] **Step 4: Ligar na página da conversa**

Em `src/features/conversations/pages/ConversationPage.tsx`, junto dos outros imports de hooks locais:

```ts
import { usePinnedConversations } from "../hooks/usePinnedConversations";
```

Logo após a linha `const sellerId: ID | null = currentUser?.sellerId ?? null;`:

```tsx
  // Mesma query key do Inbox — o react-query compartilha o cache, então abrir a
  // conversa não custa requisição nova.
  const pins = usePinnedConversations({ sellerId });
```

E no `menuSlot`, dentro de `<ConversationMenu …>`, após `onMutated={detail.refresh}`:

```tsx
                    isPinned={pins.isPinned(conversation.id)}
                    canPin={pins.canPin}
                    onTogglePin={sellerId ? () => void pins.togglePin(conversation) : undefined}
```

- [ ] **Step 5: Verificar que compila e nada regrediu**

Run: `bun run build`
Expected: build conclui sem erro.

Run: `bun run test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/conversations/components/ConversationMenu.tsx src/features/conversations/pages/ConversationPage.tsx
git commit -m "feat(conversations): add pin toggle to the conversation kebab menu"
```

---

### Task 9: Tela de configuração do teto

**Files:**
- Create: `src/features/admin-settings/pages/InboxPinsSettingsPage.tsx`
- Create: `src/routes/app.configuracoes.atendimento.fixadas.tsx`
- Modify: `src/features/admin-settings/index.ts` (export da página)
- Modify: `src/features/shell/layouts/SettingsLayout.tsx` (item de menu)

**Interfaces:**
- Consumes: `IInboxPinsSettings`, `DEFAULT_INBOX_PINS_SETTINGS`, `MIN_PINNED`, `MAX_PINNED` (Task 1); `usePlatformSettings` (já existe).
- Produces: rota `/app/configuracoes/atendimento/fixadas`.

- [ ] **Step 1: Criar a página**

Criar `src/features/admin-settings/pages/InboxPinsSettingsPage.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentStore } from "@/features/multistore";
import {
  DEFAULT_INBOX_PINS_SETTINGS,
  MAX_PINNED,
  MIN_PINNED,
} from "@/features/conversations/config/pinDefaults";
import { SectionHeader } from "../components/SectionHeader";
import { usePlatformSettings } from "../hooks/usePlatformSettings";
import { UnsavedChangesDialog } from "../components/UnsavedChangesDialog";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";

/**
 * Configurações → Atendimento → Conversas fixadas (spec 2026-08-11).
 * Owner-only: define QUANTAS conversas cada atendente pode manter fixadas no
 * topo do Inbox. Quem fixa o quê é escolha pessoal de cada um.
 */
export function InboxPinsSettingsPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const { settings, loading, saving, update } = usePlatformSettings(storeId);
  const queryClient = useQueryClient();
  const [draftMax, setDraftMax] = useState(DEFAULT_INBOX_PINS_SETTINGS.maxPinned);

  const savedMax = settings?.inboxPins?.maxPinned ?? DEFAULT_INBOX_PINS_SETTINGS.maxPinned;

  useEffect(() => {
    if (settings) setDraftMax(savedMax);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const dirty = useMemo(
    () => settings != null && draftMax !== savedMax,
    [settings, draftMax, savedMax],
  );
  const unsaved = useUnsavedChanges(dirty);

  const handleSave = async () => {
    if (!settings) return;
    try {
      await update({ inboxPins: { maxPinned: draftMax } }, "settings.inbox_pins.update");
      // O Inbox lê o teto do mesmo cache ["platform-settings", storeId]; sem
      // invalidar, o novo limite só valeria após o staleTime de 30 min.
      await queryClient.invalidateQueries({ queryKey: ["platform-settings", storeId] });
      toast.success("Configuração salva", { icon: <Icon icon="mdi:check" size={16} /> });
    } catch {
      toast.error("Não foi possível salvar.");
    }
  };

  if (loading || !settings) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="Conversas fixadas"
          description="Quantas conversas cada atendente pode manter fixadas no topo do Inbox."
        />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Conversas fixadas"
        description="Quantas conversas cada atendente pode manter fixadas no topo do Inbox."
      />

      <div className="space-y-6 rounded-lg border border-border bg-card p-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Icon icon="mdi:pin-outline" size={18} className="text-muted-foreground" />
              <span className="text-sm font-medium">Limite por atendente</span>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold tabular-nums">{draftMax}</p>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {draftMax === 1 ? "conversa" : "conversas"}
              </p>
            </div>
          </div>
          <Slider
            value={[draftMax]}
            min={MIN_PINNED}
            max={MAX_PINNED}
            step={1}
            onValueChange={(v) => setDraftMax(v[0] ?? draftMax)}
            aria-label="Limite de conversas fixadas por atendente"
          />
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>{MIN_PINNED}</span>
            <span>Atual: {savedMax}</span>
            <span>{MAX_PINNED}</span>
          </div>
        </div>

        <div className="space-y-2 rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Como funciona:</strong> cada atendente escolhe as
            suas conversas fixadas — elas ficam no topo do Inbox dele mesmo quando envelhecem ou
            quando os filtros as excluiriam. Fixar{" "}
            <strong className="text-foreground">não muda o Inbox de mais ninguém</strong>.
          </p>
          <p>
            Ao atingir o limite, o atendente precisa desafixar uma conversa para fixar outra —
            nada é desafixado automaticamente.
          </p>
          <p>
            <strong className="text-foreground">Ao reduzir o limite:</strong> quem já tiver mais
            conversas fixadas do que o novo limite continua vendo todas elas, e apenas fica
            impedido de fixar novas até desafixar. Nenhuma conversa some da lista de ninguém.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={() => setDraftMax(savedMax)} disabled={!dirty || saving}>
            Descartar
          </Button>
          <Button onClick={handleSave} disabled={!dirty || saving}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </div>
      </div>

      <UnsavedChangesDialog
        open={unsaved.promptOpen}
        onConfirmDiscard={unsaved.confirmDiscard}
        onCancel={unsaved.cancel}
      />
    </div>
  );
}
```

- [ ] **Step 2: Exportar a página**

Em `src/features/admin-settings/index.ts`, junto dos outros exports de página, na mesma forma que a linha do `EchoContinuitySettingsPage`:

```ts
export { InboxPinsSettingsPage } from "./pages/InboxPinsSettingsPage";
```

- [ ] **Step 3: Criar a rota**

Criar `src/routes/app.configuracoes.atendimento.fixadas.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { InboxPinsSettingsPage } from "@/features/admin-settings";

export const Route = createFileRoute("/app/configuracoes/atendimento/fixadas")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner"], { resource: "settings", action: "edit" }),
  component: () => (
    <SettingsLayout>
      <InboxPinsSettingsPage />
    </SettingsLayout>
  ),
});
```

- [ ] **Step 4: Adicionar o item de menu**

Em `src/features/shell/layouts/SettingsLayout.tsx`, no grupo "Operação", logo após o item "Continuidade de conversas" (`to: "/app/configuracoes/atendimento/continuidade"`):

```ts
      {
        label: "Conversas fixadas",
        icon: "mdi:pin-outline",
        to: "/app/configuracoes/atendimento/fixadas",
        roles: ["Owner"],
      },
```

- [ ] **Step 5: Regenerar a árvore de rotas e verificar**

Run: `bun run build`
Expected: build conclui sem erro. O plugin do Vite regenera `src/routeTree.gen.ts` com a rota nova — **nunca editar esse arquivo à mão**.

Run: `bun run test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin-settings/pages/InboxPinsSettingsPage.tsx src/features/admin-settings/index.ts src/routes/app.configuracoes.atendimento.fixadas.tsx src/features/shell/layouts/SettingsLayout.tsx src/routeTree.gen.ts
git commit -m "feat(settings): add store-level limit for pinned conversations"
```

---

### Task 10: Verificação final e PR

**Files:**
- Nenhum arquivo de código; apenas verificação e publicação.

**Interfaces:**
- Consumes: tudo.
- Produces: PR aberto.

- [ ] **Step 1: Suite completa**

Run: `bun run test`
Expected: PASS, incluindo os 16 testes de `pinPolicy.test.ts`.

- [ ] **Step 2: Build**

Run: `bun run build`
Expected: build conclui sem erro. Este é o gate real de CI (o build **não** faz type-check completo).

- [ ] **Step 3: Type-check por delta**

Run: `bunx tsc --noEmit`

O repositório tem um baseline de ~315 erros pré-existentes; o critério é **delta zero** nos arquivos desta branch. Para isolar:

Run: `git diff --name-status main...HEAD`

Expected: nenhum erro do `tsc` aponta para um arquivo dessa lista.

- [ ] **Step 4: Lint dos arquivos tocados**

Run: `bun run lint`
Expected: sem erro novo. Avisos de `Delete ␍` (CRLF) são falso positivo conhecido do ambiente Windows e podem ser ignorados.

- [ ] **Step 5: Confirmar que o cache congelado ficou intacto**

Run: `git diff --name-only main...HEAD`

Expected: a lista **não** contém `useConversationsList.ts`, `useRealtimeConversations.ts`, `useRealtimeMessages.ts`, `useMessages.ts`, `useSeedSignedMediaUrls.ts`, `useResolvedMediaUrl.ts` nem `useConversationMessageMedia.ts`. Se contiver, algo saiu do escopo e precisa ser revertido.

- [ ] **Step 6: Abrir o PR**

```bash
git push -u origin feat/inbox-conversas-fixadas
```

Abrir PR (não-draft) para `main` com corpo apontando o spec, listando a migration pendente de aplicação manual e os critérios de aceite do §12 do spec como roteiro de smoke.

**Não mergear.** Não aplicar a migration. Ambos exigem OK explícito do dono.

---

## Pendências que ficam para o dono

1. **Aplicar a migration** `20260811120000_conversation_pins.sql` em produção (manual, com OK explícito). Até lá a feature fica inerte: o Inbox segue idêntico ao de hoje.
2. **Smoke** dos 9 critérios de aceite do §12 do spec.
3. **Bump de versão + changelog** — entram no fechamento, não neste PR.
