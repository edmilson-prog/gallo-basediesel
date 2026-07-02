# Conversation Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tags de conversa reais — catálogo Owner-only (`conversation_tags`), IDs gravados na coluna existente `conversations.tags text[]`, exibição em ficha/header/lista, filtro da Inbox operando só sobre tags de conversa, e hub de gestão com 2 abas (conversa + cliente).

**Architecture:** Catálogo em tabela dedicada com RLS Owner-strict; associação via `conversationsProvider.update(id, { tags })` já existente (policy de prod verificada); UI lê o catálogo por hook TanStack Query e resolve id→label/cor na render. Zona congelada do atendimento intocada — mutação otimista escreve apenas em `["conversation-detail", id]`.

**Tech Stack:** React 19 + TanStack Router/Query, Tailwind v4 + shadcn/ui (Popover/Command/DropdownMenu/AlertDialog/Tabs), Supabase (RLS), Zustand mock store, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-02-conversation-tags-design.md` (aprovado 2026-07-02).

## Global Constraints

- Trabalhe na worktree `D:\claude\gallo-basediesel\.claude\worktrees\conversation-tags` (branch `feat/conversation-tags`). Nunca commitar fora dela.
- UI 100% pt-BR com acentos corretos; comentários de código em inglês.
- Componentes consomem APENAS tokens semânticos (`bg-muted`, `text-foreground`, `border-border`…). A ÚNICA exceção é cor-de-identidade da tag via `style={{ backgroundColor: hex }}` num dot `aria-hidden` (precedente: `instanceAccent.ts`).
- Imports de dados SÓ via barrel `@/providers/data` fora de `src/providers/data/**` e `src/mocks/**` (ESLint impõe).
- **ZONA CONGELADA (não tocar):** `useMessages.ts`, `useRealtimeConversations.ts`, `useRealtimeMessages.ts`, query keys de mensagens, `useSeedSignedMediaUrls.ts`, RPCs gated-once. Permitido: `setQueryData`/`invalidateQueries` em `["conversation-detail", id]` e uso do `refetch` exposto por `useConversationsList`.
- Conventional Commits em inglês, atômicos. Testes: `bun run test` (Vitest). Build: `bun run build`. Type-check por delta: `bunx tsc --noEmit` (há baseline de ~315 erros pré-existentes — avalie só arquivos novos/tocados).
- A migration NÃO é aplicada durante a implementação — apenas versionada. Aplicação em prod é passo de rollout com OK do dono.
- IDs de tag são uuid (supabase) / `ctag-*` (mock). Nunca usar o literal `demo-seed` como tag.

---

### Task 1: Domain types + engine `tagCatalog` (TDD)

**Files:**
- Modify: `src/shared/types/conversation.ts` (append `IConversationTag`)
- Modify: `src/shared/types/platform.ts` (append `ConversationTagsHeaderMode` + `IConversationTagsSettings` + campo em `IPlatformSettings`)
- Modify: `src/shared/types/index.ts` (barrel)
- Modify: `src/providers/data/engine/buildDefaultSettings.ts` (default)
- Create: `src/features/conversations/engine/tagCatalog.ts`
- Test: `src/features/conversations/engine/tagCatalog.test.ts`

**Interfaces:**
- Produces: `IConversationTag { id, storeId, label, color, archived, createdAt, updatedAt }`; `ConversationTagsHeaderMode = "readonly" | "quick-add" | "band"`; `TAG_PALETTE: ITagPaletteEntry[]`; `tagColorHex(colorId): string`; `TAG_LABEL_MAX = 24`; `normalizeTagLabel(raw): string`; `validateTagLabel(raw, existingLabels): { ok: true; label: string } | { ok: false; error: "empty" | "too_long" | "duplicate" }`; `resolveConversationTags(ids, catalog): IConversationTag[]`; `splitVisibleTags<T>(items, max): { visible: T[]; overflowCount: number; overflow: T[] }`.

- [ ] **Step 1: Add domain types**

Em `src/shared/types/conversation.ts`, após a interface `IConversation`, adicionar:

```ts
/**
 * Owner-managed catalog entry for CONVERSATION tags (distinct from customer
 * tags in IPlatformSettings.tagSuggestions). `conversations.tags` stores the
 * IDs of these entries — renaming/recoloring never rewrites conversations.
 */
export interface IConversationTag {
  id: ID;
  storeId: ID;
  label: string;
  /** Curated palette color id (e.g. "teal") — resolved to hex at render time. */
  color: string;
  /** Archived tags disappear from pickers but keep rendering on old conversations. */
  archived: boolean;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}
```

Em `src/shared/types/platform.ts`, logo após `ITagSuggestion` (linha ~73), adicionar:

```ts
/** Where the conversation-tag chips render in the conversation header. */
export type ConversationTagsHeaderMode = "readonly" | "quick-add" | "band";

/** Display settings for conversation tags (association always lives in the fiche). */
export interface IConversationTagsSettings {
  headerMode: ConversationTagsHeaderMode;
}
```

E em `IPlatformSettings`, após o campo `ecommerceIntegration` (final da interface, ~linha 287):

```ts
  /** Conversation tags display settings. Undefined → { headerMode: "readonly" }. */
  conversationTags?: IConversationTagsSettings;
```

No barrel `src/shared/types/index.ts`: adicionar `IConversationTag` ao bloco de exports de `./conversation` (após `IConversationMessageMatch`) e `ConversationTagsHeaderMode, IConversationTagsSettings` ao bloco de `./platform` (junto de `ITagSuggestion`).

Em `src/providers/data/engine/buildDefaultSettings.ts`, no objeto retornado, após `ecommerceIntegration: ...` (linha ~88):

```ts
    conversationTags: { headerMode: "readonly" },
```

- [ ] **Step 2: Write the failing engine tests**

Create `src/features/conversations/engine/tagCatalog.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { IConversationTag } from "@/shared/types";
import {
  TAG_PALETTE,
  TAG_LABEL_MAX,
  tagColorHex,
  normalizeTagLabel,
  validateTagLabel,
  resolveConversationTags,
  splitVisibleTags,
} from "./tagCatalog";

function tag(id: string, label: string, overrides: Partial<IConversationTag> = {}): IConversationTag {
  return {
    id,
    storeId: "00000000-0000-0000-0000-000000000001",
    label,
    color: "teal",
    archived: false,
    createdAt: "2026-07-01T12:00:00.000Z",
    updatedAt: "2026-07-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("TAG_PALETTE", () => {
  it("has 8-10 entries with unique ids and valid hex", () => {
    expect(TAG_PALETTE.length).toBeGreaterThanOrEqual(8);
    expect(TAG_PALETTE.length).toBeLessThanOrEqual(10);
    const ids = new Set(TAG_PALETTE.map((p) => p.id));
    expect(ids.size).toBe(TAG_PALETTE.length);
    for (const entry of TAG_PALETTE) {
      expect(entry.hex).toMatch(/^#[0-9a-f]{6}$/i);
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });

  it("resolves a known color id and falls back for unknown ids", () => {
    expect(tagColorHex("teal")).toBe(TAG_PALETTE.find((p) => p.id === "teal")!.hex);
    expect(tagColorHex("nope")).toBe(TAG_PALETTE[TAG_PALETTE.length - 1]!.hex);
  });
});

describe("normalizeTagLabel / validateTagLabel", () => {
  it("trims and collapses internal whitespace", () => {
    expect(normalizeTagLabel("  Aguardando   peça  ")).toBe("Aguardando peça");
  });

  it("rejects empty labels", () => {
    expect(validateTagLabel("   ", [])).toEqual({ ok: false, error: "empty" });
  });

  it("rejects labels over TAG_LABEL_MAX chars", () => {
    expect(validateTagLabel("x".repeat(TAG_LABEL_MAX + 1), [])).toEqual({
      ok: false,
      error: "too_long",
    });
  });

  it("rejects duplicates case-insensitively (pt-BR)", () => {
    expect(validateTagLabel("garantia", ["Garantia"])).toEqual({ ok: false, error: "duplicate" });
  });

  it("accepts a valid label and returns it normalized", () => {
    expect(validateTagLabel(" Pós-venda ", ["Garantia"])).toEqual({ ok: true, label: "Pós-venda" });
  });
});

describe("resolveConversationTags", () => {
  const catalog = [tag("a", "Garantia"), tag("b", "Revenda"), tag("c", "Pós-venda", { archived: true })];

  it("maps ids to catalog entries preserving the ids order", () => {
    const result = resolveConversationTags(["b", "a"], catalog);
    expect(result.map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("silently drops orphan ids", () => {
    expect(resolveConversationTags(["a", "gone"], catalog).map((t) => t.id)).toEqual(["a"]);
  });

  it("keeps archived tags (history must keep rendering)", () => {
    expect(resolveConversationTags(["c"], catalog)).toHaveLength(1);
  });
});

describe("splitVisibleTags", () => {
  it("returns all when under the cap and zero overflow", () => {
    const r = splitVisibleTags([1, 2], 3);
    expect(r.visible).toEqual([1, 2]);
    expect(r.overflowCount).toBe(0);
  });

  it("caps visible items and counts the rest", () => {
    const r = splitVisibleTags([1, 2, 3, 4, 5], 2);
    expect(r.visible).toEqual([1, 2]);
    expect(r.overflowCount).toBe(3);
    expect(r.overflow).toEqual([3, 4, 5]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd D:\claude\gallo-basediesel\.claude\worktrees\conversation-tags && bun run test -- tagCatalog`
Expected: FAIL — `Cannot find module './tagCatalog'`.

- [ ] **Step 4: Implement the engine**

Create `src/features/conversations/engine/tagCatalog.ts`:

```ts
import type { IConversationTag } from "@/shared/types";

/**
 * Curated identity palette for conversation tags. Follows the instanceAccent
 * rule: color encodes identity, never state — hues NEVER overlap the severity
 * tokens (pure success green / warning yellow / critical red) nor WhatsApp
 * green. Persist the `id`, resolve hex at render time.
 */
export interface ITagPaletteEntry {
  id: string;
  /** Human name shown in the swatch grid (pt-BR). */
  label: string;
  hex: string;
}

export const TAG_PALETTE: ITagPaletteEntry[] = [
  { id: "teal", label: "Verde-água", hex: "#2dd4bf" },
  { id: "violet", label: "Violeta", hex: "#a78bfa" },
  { id: "pink", label: "Rosa", hex: "#f472b6" },
  { id: "indigo", label: "Índigo", hex: "#818cf8" },
  { id: "orange", label: "Laranja", hex: "#fb923c" },
  { id: "sky", label: "Azul-céu", hex: "#38bdf8" },
  { id: "blue", label: "Azul", hex: "#60a5fa" },
  { id: "cyan", label: "Ciano", hex: "#22d3ee" },
  { id: "fuchsia", label: "Fúcsia", hex: "#e879f9" },
  { id: "slate", label: "Cinza-azulado", hex: "#94a3b8" },
];

/** Unknown color ids resolve to the last (neutral slate) entry. */
export function tagColorHex(colorId: string): string {
  const found = TAG_PALETTE.find((p) => p.id === colorId);
  return (found ?? TAG_PALETTE[TAG_PALETTE.length - 1]!).hex;
}

export const TAG_LABEL_MAX = 24;

export function normalizeTagLabel(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export type TagLabelValidation =
  | { ok: true; label: string }
  | { ok: false; error: "empty" | "too_long" | "duplicate" };

export function validateTagLabel(raw: string, existingLabels: string[]): TagLabelValidation {
  const label = normalizeTagLabel(raw);
  if (label.length === 0) return { ok: false, error: "empty" };
  if (label.length > TAG_LABEL_MAX) return { ok: false, error: "too_long" };
  const key = label.toLocaleLowerCase("pt-BR");
  const clash = existingLabels.some((l) => l.toLocaleLowerCase("pt-BR").trim() === key);
  if (clash) return { ok: false, error: "duplicate" };
  return { ok: true, label };
}

/**
 * Resolves the id array stored on a conversation to catalog entries, keeping
 * the array order and silently dropping orphans (deleted catalog rows).
 * Archived tags ARE returned — history keeps rendering them.
 */
export function resolveConversationTags(
  ids: string[],
  catalog: IConversationTag[],
): IConversationTag[] {
  const byId = new Map(catalog.map((t) => [t.id, t]));
  const out: IConversationTag[] = [];
  for (const id of ids) {
    const tag = byId.get(id);
    if (tag) out.push(tag);
  }
  return out;
}

/** Caps chip rows (header: 3, inbox row: 2) with a "+N" overflow. */
export function splitVisibleTags<T>(
  items: T[],
  max: number,
): { visible: T[]; overflowCount: number; overflow: T[] } {
  if (items.length <= max) return { visible: items, overflowCount: 0, overflow: [] };
  return { visible: items.slice(0, max), overflowCount: items.length - max, overflow: items.slice(max) };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test -- tagCatalog`
Expected: PASS (todos os describes).

**Nota sobre contraste:** a paleta segue a família tonal da `INSTANCE_PALETTE` já aceita em produção (dots de identidade sempre acompanhados de rótulo textual — cor nunca é o único sinal). A conferência visual acontece manualmente na rota `/design-system` durante o smoke; NÃO adicione teste automatizado de razão de contraste (o critério 3:1 contra ambos os fundos reprovaria também a paleta de instâncias existente).

- [ ] **Step 6: Type-check delta e commit**

Run: `bunx tsc --noEmit 2>&1 | grep -E "tagCatalog|conversation.ts|platform.ts|buildDefaultSettings" || echo "no new errors"`
Expected: `no new errors`.

```bash
git add src/shared/types/conversation.ts src/shared/types/platform.ts src/shared/types/index.ts src/providers/data/engine/buildDefaultSettings.ts src/features/conversations/engine/tagCatalog.ts src/features/conversations/engine/tagCatalog.test.ts
git commit -m "feat(conversations): conversation tag domain types + tagCatalog engine"
```

---

### Task 2: Migration `conversation_tags` (versionada, NÃO aplicada)

**Files:**
- Create: `supabase/migrations/20260703120000_conversation_tags_catalog.sql`

**Interfaces:**
- Produces: tabela `public.conversation_tags` com RLS select-authenticated / write-Owner-strict, consumida pela Task 4.

- [ ] **Step 1: Write the migration**

```sql
-- Conversation tags catalog (spec 2026-07-02-conversation-tags-design.md).
-- Association lives in the existing conversations.tags text[] (GIN-indexed
-- since 20260608151350) which now stores conversation_tags.id values.
-- Writes are Owner-STRICT (unlike message_templates' is_staff()) per the
-- owner decision; reads are store-scoped for any authenticated member.
create table public.conversation_tags (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  label text not null,
  -- Curated palette color id (e.g. 'teal'); resolved to hex in the app.
  color text not null default 'slate',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.conversation_tags is
  'Owner-managed catalog of conversation tags; conversations.tags stores these ids.';

create unique index conversation_tags_store_label_uq
  on public.conversation_tags (store_id, lower(label));
create index conversation_tags_store_idx on public.conversation_tags (store_id);

alter table public.conversation_tags enable row level security;

-- SELECT: any authenticated member of the store (pickers, chips, filter).
create policy conversation_tags_select
  on public.conversation_tags for select to authenticated
  using (store_id = (select public.current_store_id()));

-- Writes: Owner only (strict — fail-closed via IS DISTINCT FROM pattern).
create policy conversation_tags_insert
  on public.conversation_tags for insert to authenticated
  with check (
    (select public.current_app_role()) = 'owner'
    and store_id = (select public.current_store_id())
  );

create policy conversation_tags_update
  on public.conversation_tags for update to authenticated
  using (
    (select public.current_app_role()) = 'owner'
    and store_id = (select public.current_store_id())
  )
  with check (
    (select public.current_app_role()) = 'owner'
    and store_id = (select public.current_store_id())
  );

create policy conversation_tags_delete
  on public.conversation_tags for delete to authenticated
  using (
    (select public.current_app_role()) = 'owner'
    and store_id = (select public.current_store_id())
  );
```

- [ ] **Step 2: Sanity check + commit**

Verifique que o arquivo não contém `is_staff()` (write é Owner-strict) e que NENHUM comando de aplicação foi rodado (a migration só entra em prod no rollout, com OK do dono).

```bash
git add supabase/migrations/20260703120000_conversation_tags_catalog.sql
git commit -m "feat(db): conversation_tags catalog migration (owner-strict RLS, not applied)"
```

---

### Task 3: Contract + mock provider + registration (TDD)

**Files:**
- Create: `src/providers/data/contracts/conversationTags.ts`
- Create: `src/providers/data/impl/mock/conversationTags.ts`
- Create: `src/providers/data/hooks/useConversationTagsProvider.ts`
- Modify: `src/providers/data/contracts/index.ts`
- Modify: `src/providers/data/factory.ts`
- Modify: `src/providers/data/index.ts`
- Test: `src/providers/data/impl/mock/conversationTags.test.ts`

**Interfaces:**
- Consumes: `IConversationTag` (Task 1).
- Produces: `IConversationTagsProvider { list(params?): Promise<IConversationTag[]>; create(input): Promise<IConversationTag>; update(id, input): Promise<IConversationTag>; delete(id): Promise<void>; usageCount(storeId?): Promise<Record<ID, number>> }`; hook `useConversationTagsProvider()`; seeds mock com IDs estáveis `ctag-garantia`, `ctag-orcamento`, `ctag-aguardando-peca`, `ctag-revenda`, `ctag-pos-venda`, `ctag-negociacao`.

- [ ] **Step 1: Write the contract**

Create `src/providers/data/contracts/conversationTags.ts`:

```ts
import type { ID, IConversationTag } from "@/shared/types";

export interface IListConversationTagsParams {
  storeId?: ID;
  /** When true, filters out archived tags (pickers). Default: return all. */
  activeOnly?: boolean;
}

export interface ICreateConversationTagInput {
  storeId?: ID;
  label: string;
  /** Curated palette color id (see TAG_PALETTE). */
  color: string;
}

export interface IUpdateConversationTagInput {
  label?: string;
  color?: string;
  archived?: boolean;
}

/**
 * Owner-managed catalog of CONVERSATION tags. Reading is store-scoped (RLS);
 * writes are Owner-strict. `conversations.tags` stores these ids — see the
 * 2026-07-02 conversation-tags design spec.
 */
export interface IConversationTagsProvider {
  list(params?: IListConversationTagsParams): Promise<IConversationTag[]>;
  create(input: ICreateConversationTagInput): Promise<IConversationTag>;
  update(id: ID, input: IUpdateConversationTagInput): Promise<IConversationTag>;
  /** Hard delete — UI only allows it when usage is zero (v1). */
  delete(id: ID): Promise<void>;
  /** tagId → number of conversations currently carrying it (management screen). */
  usageCount(storeId?: ID): Promise<Record<ID, number>>;
}
```

- [ ] **Step 2: Write the failing mock tests**

Create `src/providers/data/impl/mock/conversationTags.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { mockConversationTagsProvider, __resetConversationTagsForTests } from "./conversationTags";

const STORE = "00000000-0000-0000-0000-000000000001";

beforeEach(() => {
  __resetConversationTagsForTests();
});

describe("mockConversationTagsProvider", () => {
  it("lists the deterministic seed catalog sorted by label", async () => {
    const tags = await mockConversationTagsProvider.list({ storeId: STORE });
    expect(tags.length).toBeGreaterThanOrEqual(6);
    const labels = tags.map((t) => t.label);
    expect([...labels].sort((a, b) => a.localeCompare(b, "pt-BR"))).toEqual(labels);
    expect(tags.some((t) => t.id === "ctag-garantia")).toBe(true);
  });

  it("activeOnly excludes archived tags", async () => {
    await mockConversationTagsProvider.update("ctag-garantia", { archived: true });
    const active = await mockConversationTagsProvider.list({ storeId: STORE, activeOnly: true });
    expect(active.some((t) => t.id === "ctag-garantia")).toBe(false);
    const all = await mockConversationTagsProvider.list({ storeId: STORE });
    expect(all.some((t) => t.id === "ctag-garantia")).toBe(true);
  });

  it("creates, renames, recolors and deletes", async () => {
    const created = await mockConversationTagsProvider.create({
      storeId: STORE,
      label: "Urgente",
      color: "orange",
    });
    expect(created.id).toMatch(/^ctag-/);
    const renamed = await mockConversationTagsProvider.update(created.id, {
      label: "Urgentíssimo",
      color: "pink",
    });
    expect(renamed.label).toBe("Urgentíssimo");
    expect(renamed.color).toBe("pink");
    await mockConversationTagsProvider.delete(created.id);
    const tags = await mockConversationTagsProvider.list({ storeId: STORE });
    expect(tags.some((t) => t.id === created.id)).toBe(false);
  });

  it("usageCount counts conversations in the mock store carrying each tag id", async () => {
    const usage = await mockConversationTagsProvider.usageCount(STORE);
    // Scripted conversations (Task 5) reference ctag-* ids; before Task 5 this
    // may be zero — the shape contract is what matters here.
    expect(typeof usage).toBe("object");
    for (const value of Object.values(usage)) expect(typeof value).toBe("number");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun run test -- conversationTags`
Expected: FAIL — `Cannot find module './conversationTags'`.

- [ ] **Step 4: Implement the mock provider**

Create `src/providers/data/impl/mock/conversationTags.ts`:

```ts
import type { ID, IConversationTag } from "@/shared/types";
import { getMockState } from "@/mocks/store/mockStore";
import type {
  IConversationTagsProvider,
  ICreateConversationTagInput,
  IListConversationTagsParams,
  IUpdateConversationTagInput,
} from "../../contracts/conversationTags";

/**
 * Mock implementation of {@link IConversationTagsProvider}. Self-contained
 * module-level catalog (same rationale as messageTemplates): the catalog is a
 * Fase-2 admin entity; conversations reference the ids below from the
 * scripted-conversation seeds. usageCount counts against the live mockStore.
 */

const SEED_STORE_ID = "00000000-0000-0000-0000-000000000001";
const MOCK_LATENCY_MS = 120;
const SEED_TS = "2026-06-01T12:00:00.000Z";

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
}

function seedTag(id: string, label: string, color: string): IConversationTag {
  return {
    id,
    storeId: SEED_STORE_ID,
    label,
    color,
    archived: false,
    createdAt: SEED_TS,
    updatedAt: SEED_TS,
  };
}

function buildSeeds(): IConversationTag[] {
  return [
    seedTag("ctag-garantia", "Garantia", "teal"),
    seedTag("ctag-orcamento", "Orçamento enviado", "violet"),
    seedTag("ctag-aguardando-peca", "Aguardando peça", "orange"),
    seedTag("ctag-revenda", "Revenda", "blue"),
    seedTag("ctag-pos-venda", "Pós-venda", "pink"),
    seedTag("ctag-negociacao", "Em negociação", "indigo"),
  ];
}

let catalog: IConversationTag[] = buildSeeds();

/** Test-only: restore the deterministic seed catalog. */
export function __resetConversationTagsForTests(): void {
  catalog = buildSeeds();
}

function sorted(tags: IConversationTag[]): IConversationTag[] {
  return [...tags].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export const mockConversationTagsProvider: IConversationTagsProvider = {
  async list(params?: IListConversationTagsParams): Promise<IConversationTag[]> {
    await delay();
    return sorted(
      catalog.filter((tag) => {
        if (params?.storeId && tag.storeId !== params.storeId) return false;
        if (params?.activeOnly && tag.archived) return false;
        return true;
      }),
    );
  },

  async create(input: ICreateConversationTagInput): Promise<IConversationTag> {
    await delay();
    const now = new Date().toISOString();
    const tag: IConversationTag = {
      id: `ctag-${crypto.randomUUID()}`,
      storeId: input.storeId ?? SEED_STORE_ID,
      label: input.label,
      color: input.color,
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
    catalog.push(tag);
    return tag;
  },

  async update(id: ID, input: IUpdateConversationTagInput): Promise<IConversationTag> {
    await delay();
    const found = catalog.find((tag) => tag.id === id);
    if (!found) throw new Error(`Tag não encontrada: ${id}`);
    if (input.label !== undefined) found.label = input.label;
    if (input.color !== undefined) found.color = input.color;
    if (input.archived !== undefined) found.archived = input.archived;
    found.updatedAt = new Date().toISOString();
    return { ...found };
  },

  async delete(id: ID): Promise<void> {
    await delay();
    catalog = catalog.filter((tag) => tag.id !== id);
  },

  async usageCount(storeId?: ID): Promise<Record<ID, number>> {
    await delay();
    const conversations = getMockState().conversations.filter(
      (c) => !storeId || c.storeId === storeId,
    );
    const usage: Record<ID, number> = {};
    for (const tag of catalog) usage[tag.id] = 0;
    for (const conversation of conversations) {
      for (const tagId of conversation.tags) {
        if (tagId in usage) usage[tagId] = (usage[tagId] ?? 0) + 1;
      }
    }
    return usage;
  },
};
```

- [ ] **Step 5: Register contract + factory + hook + barrel**

Em `src/providers/data/contracts/index.ts`:
1. Junto aos imports type-only: `import type { IConversationTagsProvider } from "./conversationTags";`
2. Bloco de re-export (junto ao de messageTemplates):

```ts
export type {
  IConversationTagsProvider,
  IListConversationTagsParams,
  ICreateConversationTagInput,
  IUpdateConversationTagInput,
} from "./conversationTags";
```

3. Em `IDataProviders`, após `whatsappGoServers: IWhatsAppGoServersProvider;`:

```ts
  conversationTags: IConversationTagsProvider;
```

Em `src/providers/data/factory.ts`:
1. Import mock (junto aos outros): `import { mockConversationTagsProvider } from "./impl/mock/conversationTags";`
2. Entrada no set mock: `conversationTags: mockConversationTagsProvider,`
3. **Placeholder supabase até a Task 4:** para o build compilar nesta task, registre TEMPORARIAMENTE o mock também no set supabase, com comentário na mesma linha: `conversationTags: mockConversationTagsProvider, // TODO(Task 4): replaced by supabaseConversationTagsProvider`. A Task 4 troca pela implementação real e o gate final (Task 14) verifica que nenhum `TODO(Task 4)` sobrou.

Create `src/providers/data/hooks/useConversationTagsProvider.ts`:

```ts
import type { IConversationTagsProvider } from "../contracts/conversationTags";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useConversationTagsProvider(): IConversationTagsProvider {
  return useDataProviderSlice("conversationTags", "useConversationTagsProvider");
}
```

Em `src/providers/data/index.ts` (superfície pública): junto aos hooks, `export { useConversationTagsProvider } from "./hooks/useConversationTagsProvider";` e junto aos types:

```ts
export type {
  IConversationTagsProvider,
  IListConversationTagsParams,
  ICreateConversationTagInput,
  IUpdateConversationTagInput,
} from "./contracts/conversationTags";
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun run test -- conversationTags`
Expected: PASS (4 its).

- [ ] **Step 7: Commit**

```bash
git add src/providers/data/contracts/conversationTags.ts src/providers/data/contracts/index.ts src/providers/data/impl/mock/conversationTags.ts src/providers/data/impl/mock/conversationTags.test.ts src/providers/data/hooks/useConversationTagsProvider.ts src/providers/data/factory.ts src/providers/data/index.ts
git commit -m "feat(providers): conversationTags contract + mock provider + registration"
```

---

### Task 4: Supabase provider

**Files:**
- Create: `src/providers/data/impl/supabase/conversationTags.ts`
- Modify: `src/providers/data/factory.ts` (trocar o placeholder)

**Interfaces:**
- Consumes: contrato da Task 3; tabela da Task 2.
- Produces: `supabaseConversationTagsProvider` registrado no set supabase.

- [ ] **Step 1: Implement**

Create `src/providers/data/impl/supabase/conversationTags.ts`:

```ts
import type { ID, IConversationTag } from "@/shared/types";
import { getSupabaseClient } from "@/shared/lib/supabase";
import type {
  IConversationTagsProvider,
  ICreateConversationTagInput,
  IListConversationTagsParams,
  IUpdateConversationTagInput,
} from "../../contracts/conversationTags";

/**
 * Supabase implementation of {@link IConversationTagsProvider}. RLS scopes
 * reads to the caller's store and restricts writes to the Owner — the
 * provider stays a thin mapper (same shape as messageTemplates).
 */

interface IRow {
  id: string;
  store_id: string;
  label: string;
  color: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

const COLUMNS = "id, store_id, label, color, archived, created_at, updated_at";

function rowToTag(row: IRow): IConversationTag {
  return {
    id: row.id,
    storeId: row.store_id,
    label: row.label,
    color: row.color,
    archived: row.archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const supabaseConversationTagsProvider: IConversationTagsProvider = {
  async list(params?: IListConversationTagsParams): Promise<IConversationTag[]> {
    let query = getSupabaseClient().from("conversation_tags").select(COLUMNS).order("label");
    if (params?.storeId) query = query.eq("store_id", params.storeId);
    if (params?.activeOnly) query = query.eq("archived", false);
    const { data, error } = await query;
    if (error) throw new Error(`conversationTags.list: ${error.message}`);
    return ((data ?? []) as IRow[]).map(rowToTag);
  },

  async create(input: ICreateConversationTagInput): Promise<IConversationTag> {
    const { data, error } = await getSupabaseClient()
      .from("conversation_tags")
      .insert({
        // store_id is NOT NULL — RLS also pins it to current_store_id().
        ...(input.storeId ? { store_id: input.storeId } : {}),
        label: input.label,
        color: input.color,
      })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`conversationTags.create: ${error.message}`);
    return rowToTag(data as IRow);
  },

  async update(id: ID, input: IUpdateConversationTagInput): Promise<IConversationTag> {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.label !== undefined) patch.label = input.label;
    if (input.color !== undefined) patch.color = input.color;
    if (input.archived !== undefined) patch.archived = input.archived;
    const { data, error } = await getSupabaseClient()
      .from("conversation_tags")
      .update(patch)
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`conversationTags.update: ${error.message}`);
    return rowToTag(data as IRow);
  },

  async delete(id: ID): Promise<void> {
    const { error } = await getSupabaseClient().from("conversation_tags").delete().eq("id", id);
    if (error) throw new Error(`conversationTags.delete: ${error.message}`);
  },

  async usageCount(storeId?: ID): Promise<Record<ID, number>> {
    const tags = await this.list(storeId ? { storeId } : undefined);
    const client = getSupabaseClient();
    const counts = await Promise.all(
      tags.map(async (tag) => {
        let query = client
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .overlaps("tags", [tag.id]);
        if (storeId) query = query.eq("store_id", storeId);
        const { count, error } = await query;
        if (error) throw new Error(`conversationTags.usageCount: ${error.message}`);
        return [tag.id, count ?? 0] as const;
      }),
    );
    return Object.fromEntries(counts);
  },
};
```

**Nota (store_id no create):** o input normalmente traz `storeId` (a tela passa `currentStoreId`). Como a coluna é NOT NULL, o caller da tela de gestão SEMPRE fornece `storeId` — o objeto `insert` acima omite `store_id` apenas se ausente, e nesse caso o banco rejeita (comportamento correto: catálogo é store-scoped).

- [ ] **Step 2: Swap the factory placeholder**

Em `src/providers/data/factory.ts`: adicionar `import { supabaseConversationTagsProvider } from "./impl/supabase/conversationTags";` e trocar a entrada do set supabase para `conversationTags: supabaseConversationTagsProvider,` (removendo o comentário `TODO(Task 4)`).

- [ ] **Step 3: Verify build + commit**

Run: `bun run test -- conversationTags && bun run build 2>&1 | tail -3`
Expected: testes PASS; build OK.

```bash
git add src/providers/data/impl/supabase/conversationTags.ts src/providers/data/factory.ts
git commit -m "feat(providers): supabase conversationTags provider"
```

---

### Task 5: Mock parity — scripted seeds usam IDs + `matchesTags` só conversa

**Files:**
- Modify: `src/mocks/generators/scriptedConversations.ts`
- Modify: `src/mocks/api/conversations.ts:92-101`

**Interfaces:**
- Consumes: IDs `ctag-*` (Task 3).
- Produces: conversas mock com `tags: ["ctag-..."]`; filtro mock com a MESMA semântica do supabase (`overlaps` na própria conversa).

- [ ] **Step 1: Update scripted scenario tags to catalog ids**

Em `src/mocks/generators/scriptedConversations.ts`, os cenários declaram `tags:` com labels de tag de CLIENTE (ex.: linha ~85 `tags: ["Volvo", "Frota pesada"]`, ~148 `tags: ["Cliente recorrente", "VIP", "Pagador em dia"]`). Substituir TODOS os valores `tags:` dos cenários por arrays de IDs do catálogo novo, variando 0–3 por cenário para dar diversidade visual. Mapeamento sugerido (aplicar por contexto do cenário — venda→orçamento/negociação, pós-venda→garantia/pós-venda, oficina→aguardando-peça):

```ts
// exemplos de substituição (um por cenário):
tags: ["ctag-garantia", "ctag-aguardando-peca"],
tags: ["ctag-orcamento", "ctag-negociacao"],
tags: ["ctag-revenda"],
tags: ["ctag-pos-venda"],
tags: [],
```

Atualizar também o comentário do campo (linha ~58):

```ts
  /** Conversation-tag IDs from the mock catalog (impl/mock/conversationTags.ts). */
  tags: string[];
```

- [ ] **Step 2: Align `matchesTags` with the supabase semantics**

Em `src/mocks/api/conversations.ts:92-101`, substituir:

```ts
function matchesTags(conversation: IConversation, tags: string[]): boolean {
  if (tags.length === 0) return true;
  const { customer, lead } = getCustomerOrLead(conversation);
  const owned = new Set<string>([
    ...conversation.tags,
    ...(customer?.tags ?? []),
    ...(lead?.tags ?? []),
  ]);
  return tags.some((t) => owned.has(t));
}
```

por:

```ts
// Mirrors the supabase provider's `.overlaps("tags", ...)`: conversation tags
// are CONVERSATION-tag ids only — customer/lead tags are filtered on the
// Clientes screen, not here (2026-07-02 conversation-tags spec, decision 4).
function matchesTags(conversation: IConversation, tags: string[]): boolean {
  if (tags.length === 0) return true;
  const owned = new Set<string>(conversation.tags);
  return tags.some((t) => owned.has(t));
}
```

Se `getCustomerOrLead` ficar sem uso após a mudança, remova a importação/função apenas se NENHUM outro ponto do arquivo a usa (verifique com grep antes).

- [ ] **Step 3: Run full test suite**

Run: `bun run test 2>&1 | tail -5`
Expected: PASS (nenhum teste existente depende da união customer/lead no filtro — o `useInboxFilters.test.ts` não cobre tags hoje).

- [ ] **Step 4: Commit**

```bash
git add src/mocks/generators/scriptedConversations.ts src/mocks/api/conversations.ts
git commit -m "feat(mocks): conversation tag ids in scripted seeds + conversation-only tag filter"
```

---

### Task 6: Feature hooks — `useConversationTags` + `useConversationTagsMutation`

**Files:**
- Create: `src/features/conversations/hooks/useConversationTags.ts`
- Create: `src/features/conversations/hooks/useConversationTagsMutation.ts`

**Interfaces:**
- Consumes: `useConversationTagsProvider` (Task 3), `resolveConversationTags` (Task 1), `recordAuditLog`/`useConversationsProvider` de `@/providers/data`, `useCurrentStore` de `@/features/multistore`.
- Produces:
  - `useConversationTags(): { tags: IConversationTag[]; activeTags: IConversationTag[]; byId: Map<ID, IConversationTag>; isLoading: boolean }` (query key `["conversation-tags", storeId]`, staleTime 30 min).
  - `useConversationTagsMutation(conversation: IConversation, opts?: { onDone?: () => void }): { setTags(next: ID[]): Promise<void>; toggleTag(id: ID): Promise<void>; saving: boolean }`.

- [ ] **Step 1: Implement the catalog hook**

Create `src/features/conversations/hooks/useConversationTags.ts`:

```ts
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IConversationTag } from "@/shared/types";
import { useConversationTagsProvider } from "@/providers/data";
import { useCurrentStore } from "@/features/multistore";

const STALE_MS = 30 * 60 * 1000; // catalog changes rarely — mirror platform-settings

export interface IUseConversationTagsResult {
  tags: IConversationTag[];
  /** Non-archived tags — what pickers and the create-flow offer. */
  activeTags: IConversationTag[];
  byId: Map<ID, IConversationTag>;
  isLoading: boolean;
}

export function useConversationTags(): IUseConversationTagsResult {
  const provider = useConversationTagsProvider();
  const { currentStoreId } = useCurrentStore();
  const query = useQuery({
    queryKey: ["conversation-tags", currentStoreId],
    queryFn: () => provider.list({ storeId: currentStoreId ?? undefined }),
    staleTime: STALE_MS,
  });

  const tags = useMemo(() => query.data ?? [], [query.data]);
  const activeTags = useMemo(() => tags.filter((t) => !t.archived), [tags]);
  const byId = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  return { tags, activeTags, byId, isLoading: query.isLoading };
}
```

- [ ] **Step 2: Implement the optimistic mutation hook**

Create `src/features/conversations/hooks/useConversationTagsMutation.ts`:

```ts
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, IConversation } from "@/shared/types";
import { recordAuditLog, useConversationsProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";

/**
 * Optimistic conversation-tag writes. ONLY touches the
 * `["conversation-detail", id]` cache (frozen-layer-safe); the inbox list
 * refreshes via the existing realtime `conversations` channel in supabase
 * mode, or on its next refetch in mock mode.
 */
export interface IUseConversationTagsMutationResult {
  setTags: (next: ID[]) => Promise<void>;
  toggleTag: (tagId: ID) => Promise<void>;
  saving: boolean;
}

interface IDetailCacheShape {
  conversation: IConversation | null;
}

export function useConversationTagsMutation(
  conversation: IConversation,
  opts?: { onDone?: () => void },
): IUseConversationTagsMutationResult {
  const conversationsProvider = useConversationsProvider();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const [saving, setSaving] = useState(false);

  const setTags = useCallback(
    async (next: ID[]) => {
      const key = ["conversation-detail", conversation.id] as const;
      const before = conversation.tags;
      const snapshot = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (old: IDetailCacheShape | undefined) =>
        old?.conversation
          ? { ...old, conversation: { ...old.conversation, tags: next } }
          : old,
      );
      setSaving(true);
      try {
        await conversationsProvider.update(conversation.id, { tags: next });
        opts?.onDone?.();
        if (currentUser) {
          void recordAuditLog({
            actorId: currentUser.id,
            storeId: conversation.storeId,
            action: "conversation.tags_update",
            resource: "conversation",
            resourceId: conversation.id,
            before: { tags: before },
            after: { tags: next },
          });
        }
      } catch {
        queryClient.setQueryData(key, snapshot);
        toast.error(CONVERSATION_STRINGS.tags.updateFailed);
      } finally {
        setSaving(false);
      }
    },
    [conversation.id, conversation.storeId, conversation.tags, conversationsProvider, currentUser, opts, queryClient],
  );

  const toggleTag = useCallback(
    async (tagId: ID) => {
      const has = conversation.tags.includes(tagId);
      const next = has ? conversation.tags.filter((t) => t !== tagId) : [...conversation.tags, tagId];
      await setTags(next);
    },
    [conversation.tags, setTags],
  );

  return { setTags, toggleTag, saving };
}
```

- [ ] **Step 3: Verify types + commit**

Run: `bunx tsc --noEmit 2>&1 | grep -E "useConversationTags" || echo "no new errors"`
Expected: `no new errors`. (A string `CONVERSATION_STRINGS.tags.updateFailed` chega na Task 7 — se rodar o tsc antes dela, o erro esperado é apenas esse; nesse caso troque a ordem: rode este check ao final da Task 7. Alternativa adotada: commit conjunto com a Task 7.)

**Commit é feito junto com a Task 7** (as strings i18n fecham a compilação).

---

### Task 7: `ConversationTagChip` + `ConversationTagPicker` + i18n

**Files:**
- Create: `src/features/conversations/components/tags/ConversationTagChip.tsx`
- Create: `src/features/conversations/components/tags/ConversationTagPicker.tsx`
- Modify: `src/features/conversations/i18n/pt-BR.ts` (sub-grupo `tags` em `CONVERSATION_STRINGS`)

**Interfaces:**
- Consumes: `tagColorHex`, `splitVisibleTags` (Task 1); `useConversationTags` + `useConversationTagsMutation` (Task 6); `Popover*`, `Command*`, `Tooltip*`, `Button`, `Icon` de `@/components`.
- Produces:
  - `ConversationTagChip({ tag, size?: "sm" | "xs", onRemove?, className? })`
  - `TagOverflowChip({ tags, size? })` (chip "+N" com Tooltip)
  - `ConversationTagPicker({ conversation, onChanged?, trigger?, align? })` — Popover+cmdk multi-select; criação inline Owner-only.

- [ ] **Step 1: Add the i18n strings**

Em `src/features/conversations/i18n/pt-BR.ts`, dentro de `CONVERSATION_STRINGS` (após o sub-grupo `menu:`), adicionar:

```ts
  tags: {
    sectionLabel: "Tags da conversa",
    add: "Adicionar",
    addShort: "+ Tag",
    searchPlaceholder: "Buscar tag…",
    empty: "Nenhuma tag encontrada",
    createInline: (query: string) => `Criar tag "${query}"`,
    updateFailed: "Não foi possível atualizar as tags.",
    createFailed: "Não foi possível criar a tag.",
    archivedSuffix: "(arquivada)",
    removeAria: (label: string) => `Remover ${label}`,
    overflowAria: (n: number) => `Mais ${n} tag(s)`,
    pickerAria: "Gerenciar tags da conversa",
  },
```

- [ ] **Step 2: Implement the chip**

Create `src/features/conversations/components/tags/ConversationTagChip.tsx`:

```tsx
import type { IConversationTag } from "@/shared/types";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { tagColorHex } from "../../engine/tagCatalog";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";

const COPY = CONVERSATION_STRINGS.tags;

export interface IConversationTagChipProps {
  tag: IConversationTag;
  /** "sm" = header/fiche (11px); "xs" = inbox row (10px). */
  size?: "sm" | "xs";
  /** When provided, renders a keyboard-accessible remove button. */
  onRemove?: () => void;
  className?: string;
}

/**
 * Identity pill for a conversation tag: neutral chip + colored dot. Follows
 * the visual grammar — tags are rounded-full with a dot (identity), while
 * status badges stay rounded-md with semantic tones (state).
 */
export function ConversationTagChip({ tag, size = "sm", onRemove, className }: IConversationTagChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-muted text-foreground",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-1.5 py-px text-[10px]",
        tag.archived && "opacity-60",
        className,
      )}
      title={tag.archived ? `${tag.label} ${COPY.archivedSuffix}` : tag.label}
    >
      <span
        aria-hidden
        className={cn("shrink-0 rounded-full", size === "sm" ? "size-2" : "size-1.5")}
        style={{ backgroundColor: tagColorHex(tag.color) }}
      />
      <span className={cn("truncate", size === "sm" ? "max-w-[7rem]" : "max-w-[5.5rem]")}>{tag.label}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={COPY.removeAria(tag.label)}
          className="-mr-0.5 rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring motion-reduce:transition-none"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <Icon icon="mdi:close" size={size === "sm" ? 11 : 10} />
        </button>
      )}
    </span>
  );
}

/** "+N" overflow chip with a tooltip listing the hidden tags. */
export function TagOverflowChip({ tags, size = "sm" }: { tags: IConversationTag[]; size?: "sm" | "xs" }) {
  if (tags.length === 0) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={COPY.overflowAria(tags.length)}
          className={cn(
            "inline-flex items-center rounded-full border border-border bg-muted text-muted-foreground",
            size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-1.5 py-px text-[10px]",
          )}
        >
          +{tags.length}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{tags.map((t) => t.label).join(" · ")}</TooltipContent>
    </Tooltip>
  );
}
```

- [ ] **Step 3: Implement the picker**

Create `src/features/conversations/components/tags/ConversationTagPicker.tsx`:

```tsx
import { useState } from "react";
import { toast } from "sonner";
import type { IConversation } from "@/shared/types";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/useAuth";
import { useConversationTagsProvider } from "@/providers/data";
import { useCurrentStore } from "@/features/multistore";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { tagColorHex, validateTagLabel } from "../../engine/tagCatalog";
import { useConversationTags } from "../../hooks/useConversationTags";
import { useConversationTagsMutation } from "../../hooks/useConversationTagsMutation";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";

const COPY = CONVERSATION_STRINGS.tags;

export interface IConversationTagPickerProps {
  conversation: IConversation;
  /** Bubbled after a successful write so callers can refresh their own caches. */
  onChanged?: () => void;
  /** Custom trigger; defaults to a ghost "+ Tag" button. */
  trigger?: React.ReactNode;
  align?: "start" | "end";
}

/**
 * Popover + cmdk multi-select of conversation tags. Selection toggles in
 * place (the popover stays open); Escape closes. Inline creation is
 * Owner-only — the catalog is curated.
 */
export function ConversationTagPicker({
  conversation,
  onChanged,
  trigger,
  align = "end",
}: IConversationTagPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { activeTags, tags: allTags } = useConversationTags();
  const { toggleTag, saving } = useConversationTagsMutation(conversation, { onDone: onChanged });
  const { hasRole, currentUser } = useAuth();
  const provider = useConversationTagsProvider();
  const { currentStoreId } = useCurrentStore();
  const queryClient = useQueryClient();
  const isOwner = hasRole("Owner");

  // Archived tags still associated to THIS conversation stay listed so they
  // can be removed; other archived tags are hidden from the picker.
  const selectable = [
    ...activeTags,
    ...allTags.filter((t) => t.archived && conversation.tags.includes(t.id)),
  ];

  const trimmed = search.trim();
  const canCreateInline =
    isOwner && trimmed.length > 0 && validateTagLabel(trimmed, allTags.map((t) => t.label)).ok;

  async function handleCreateInline() {
    if (!currentStoreId || !canCreateInline) return;
    try {
      const created = await provider.create({ storeId: currentStoreId, label: trimmed, color: "slate" });
      await queryClient.invalidateQueries({ queryKey: ["conversation-tags"] });
      await toggleTag(created.id);
      setSearch("");
    } catch {
      toast.error(COPY.createFailed);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
            aria-label={COPY.pickerAria}
          >
            <Icon icon="mdi:tag-plus-outline" size={14} />
            {COPY.add}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-64 p-0">
        <Command>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={COPY.searchPlaceholder}
          />
          <CommandList className="max-h-64">
            <CommandEmpty>
              {canCreateInline ? (
                <button
                  type="button"
                  className="w-full px-2 py-1.5 text-left text-sm text-primary hover:underline"
                  onClick={() => void handleCreateInline()}
                >
                  {COPY.createInline(trimmed)}
                </button>
              ) : (
                COPY.empty
              )}
            </CommandEmpty>
            <CommandGroup>
              {selectable.map((tag) => {
                const checked = conversation.tags.includes(tag.id);
                return (
                  <CommandItem
                    key={tag.id}
                    value={tag.label}
                    disabled={saving}
                    onSelect={() => void toggleTag(tag.id)}
                    className="gap-2"
                  >
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: tagColorHex(tag.color) }}
                    />
                    <span className="flex-1 truncate">
                      {tag.label}
                      {tag.archived && (
                        <span className="ml-1 text-muted-foreground">{COPY.archivedSuffix}</span>
                      )}
                    </span>
                    {checked && <Icon icon="mdi:check" size={14} className="text-primary" />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 4: Build + full type-check delta + commit (fecha Tasks 6+7)**

Run: `bun run test 2>&1 | tail -3 && bun run build 2>&1 | tail -3`
Expected: testes PASS; build OK.
Run: `bunx tsc --noEmit 2>&1 | grep -E "tags/Conversation|useConversationTags" || echo "no new errors"`
Expected: `no new errors`.

```bash
git add src/features/conversations/hooks/useConversationTags.ts src/features/conversations/hooks/useConversationTagsMutation.ts src/features/conversations/components/tags/ src/features/conversations/i18n/pt-BR.ts
git commit -m "feat(conversations): tag chips, cmdk picker and optimistic tag mutation"
```

---

### Task 8: Seção "Tags da conversa" na aba Atendimento da ficha

**Files:**
- Modify: `src/features/customers/components/tabs/AtendimentoTab.tsx`
- Modify: `src/features/customers/i18n/pt-BR.ts` (`CUSTOMER_STRINGS.atendimento.tags`)

**Interfaces:**
- Consumes: `ConversationTagChip`/`ConversationTagPicker` (Task 7), `useConversationTags` (Task 6), `resolveConversationTags` (Task 1), `usePermission` de `@/features/rbac/hooks/usePermission`.
- Produces: bloco "Tags" na aba Atendimento; edição gated por `usePermission("conversation", "edit", "own")`.

- [ ] **Step 1: Add the fiche copy**

Em `src/features/customers/i18n/pt-BR.ts`, dentro do grupo `atendimento` de `CUSTOMER_STRINGS` (que já tem `status`, `assignee`, `origin`, `empty`), adicionar:

```ts
    tags: "Tags da conversa",
    tagsEmpty: "Nenhuma tag aplicada",
```

- [ ] **Step 2: Add the tags block to the tab**

Em `src/features/customers/components/tabs/AtendimentoTab.tsx`:

1. Imports novos no topo:

```tsx
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { ConversationTagChip } from "@/features/conversations/components/tags/ConversationTagChip";
import { ConversationTagPicker } from "@/features/conversations/components/tags/ConversationTagPicker";
import { useConversationTags } from "@/features/conversations/hooks/useConversationTags";
import { resolveConversationTags } from "@/features/conversations/engine/tagCatalog";
```

2. Dentro do componente `AtendimentoTab`, após a linha `const showBanner = ...`:

```tsx
  const canEditTags = usePermission("conversation", "edit", "own");
  const { tags: catalog } = useConversationTags();
  const conversationTags = conversation ? resolveConversationTags(conversation.tags, catalog) : [];
```

3. Dentro do `<section>` dos `ContextRow`s, após o bloco `{whatsappAccount && (...)}`, adicionar o bloco de tags (layout próprio porque os chips quebram linha):

```tsx
          {conversation && (
            <div className="py-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{COPY.tags}</span>
                {canEditTags && (
                  <ConversationTagPicker
                    conversation={conversation}
                    onChanged={onConversationChanged}
                  />
                )}
              </div>
              <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label={COPY.tags}>
                {conversationTags.length === 0 && (
                  <li className="text-muted-foreground">{COPY.tagsEmpty}</li>
                )}
                {conversationTags.map((tag) => (
                  <li key={tag.id}>
                    <ConversationTagChip tag={tag} />
                  </li>
                ))}
              </ul>
            </div>
          )}
```

**Atenção:** a mutação otimista escreve em `["conversation-detail", id]`, mas a prop `conversation` da aba vem do `ConversationPage` via esse mesmo cache — o re-render é automático. O `onConversationChanged` (= `detail.refresh` upstream) garante consistência final.

- [ ] **Step 3: Build + commit**

Run: `bun run build 2>&1 | tail -3`
Expected: OK.

```bash
git add src/features/customers/components/tabs/AtendimentoTab.tsx src/features/customers/i18n/pt-BR.ts
git commit -m "feat(customers): conversation tags block in the Atendimento fiche tab"
```

---

### Task 9: Header — 3 modos parametrizáveis (`readonly` / `quick-add` / `band`)

**Files:**
- Create: `src/features/conversations/hooks/useConversationTagsHeaderMode.ts`
- Create: `src/features/conversations/components/tags/ConversationHeaderTags.tsx`
- Modify: `src/features/conversations/components/ConversationHeader.tsx`

**Interfaces:**
- Consumes: `ConversationTagsHeaderMode` (Task 1), `useSettingsProvider` de `@/providers/data`, chips/picker (Task 7).
- Produces: `useConversationTagsHeaderMode(): ConversationTagsHeaderMode`; `ConversationHeaderTags({ conversation, area: "title" | "band", onChanged? })` — null quando o modo não usa a área.

- [ ] **Step 1: Implement the header-mode hook**

Create `src/features/conversations/hooks/useConversationTagsHeaderMode.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import type { ConversationTagsHeaderMode } from "@/shared/types";
import { useSettingsProvider } from "@/providers/data";
import { useCurrentStore } from "@/features/multistore";

const STALE_MS = 30 * 60 * 1000;

/**
 * Reads the Owner-configured header layout for conversation tags. Shares the
 * ["platform-settings", storeId] cache with TagsCard (same key + staleTime).
 */
export function useConversationTagsHeaderMode(): ConversationTagsHeaderMode {
  const settingsProvider = useSettingsProvider();
  const { currentStoreId } = useCurrentStore();
  const { data } = useQuery({
    queryKey: ["platform-settings", currentStoreId],
    queryFn: () => settingsProvider.get(currentStoreId!),
    enabled: !!currentStoreId,
    staleTime: STALE_MS,
  });
  return data?.conversationTags?.headerMode ?? "readonly";
}
```

(Confirme na implementação a assinatura real de `ISettingsProvider.get` — o `TagsCard.tsx:41-45` já monta exatamente esta query; copie de lá o `queryFn` literal.)

- [ ] **Step 2: Implement the header tags area component**

Create `src/features/conversations/components/tags/ConversationHeaderTags.tsx`:

```tsx
import type { IConversation } from "@/shared/types";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { splitVisibleTags, resolveConversationTags } from "../../engine/tagCatalog";
import { useConversationTags } from "../../hooks/useConversationTags";
import { useConversationTagsHeaderMode } from "../../hooks/useConversationTagsHeaderMode";
import { useConversationTagsMutation } from "../../hooks/useConversationTagsMutation";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";
import { ConversationTagChip, TagOverflowChip } from "./ConversationTagChip";
import { ConversationTagPicker } from "./ConversationTagPicker";

const COPY = CONVERSATION_STRINGS.tags;
const TITLE_MAX_CHIPS = 3;

export interface IConversationHeaderTagsProps {
  conversation: IConversation;
  /** "title" = chip row beside the name; "band" = dedicated strip below the header. */
  area: "title" | "band";
  onChanged?: () => void;
}

/**
 * Renders the conversation tags in the header according to the Owner's
 * headerMode parameter:
 *  - readonly  → chips (read-only) in the title row; no band.
 *  - quick-add → chips + a "+" picker trigger in the title row; no band.
 *  - band      → nothing in the title row; a full strip with removable chips.
 */
export function ConversationHeaderTags({ conversation, area, onChanged }: IConversationHeaderTagsProps) {
  const mode = useConversationTagsHeaderMode();
  const { tags: catalog } = useConversationTags();
  const canEdit = usePermission("conversation", "edit", "own");
  const { toggleTag } = useConversationTagsMutation(conversation, { onDone: onChanged });

  const tags = resolveConversationTags(conversation.tags, catalog);

  if (area === "title") {
    if (mode === "band") return null;
    const { visible, overflow } = splitVisibleTags(tags, TITLE_MAX_CHIPS);
    return (
      <>
        {visible.map((tag) => (
          <ConversationTagChip key={tag.id} tag={tag} />
        ))}
        <TagOverflowChip tags={overflow} />
        {mode === "quick-add" && canEdit && (
          <ConversationTagPicker conversation={conversation} onChanged={onChanged} />
        )}
      </>
    );
  }

  // area === "band"
  if (mode !== "band") return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 bg-muted/40 px-4 py-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {COPY.sectionLabel}
      </span>
      {tags.map((tag) => (
        <ConversationTagChip
          key={tag.id}
          tag={tag}
          onRemove={canEdit ? () => void toggleTag(tag.id) : undefined}
        />
      ))}
      {canEdit && (
        <ConversationTagPicker
          conversation={conversation}
          onChanged={onChanged}
          trigger={
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-primary transition-colors hover:bg-muted focus-visible:ring-1 focus-visible:ring-ring motion-reduce:transition-none"
              aria-label={COPY.pickerAria}
            >
              {COPY.addShort}
            </button>
          }
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Mount both areas in `ConversationHeader`**

Em `src/features/conversations/components/ConversationHeader.tsx`:

1. Import: `import { ConversationHeaderTags } from "./tags/ConversationHeaderTags";`
2. Na linha de chips do título (dentro do `<div className="flex items-center gap-2">` que contém `<h2>` e `TemperatureChip` — após o bloco `{display.temperature && ...}`), adicionar:

```tsx
            <ConversationHeaderTags
              conversation={conversation}
              area="title"
              onChanged={onConversationUpdated}
            />
```

3. Após o bloco das faixas (`{conversation.linkedOrderId && (...)}`, linha ~258), adicionar:

```tsx
      <ConversationHeaderTags
        conversation={conversation}
        area="band"
        onChanged={onConversationUpdated}
      />
```

(`onConversationUpdated` já existe nas props do header e o `ConversationPage` já o liga a `detail.refresh`.)

- [ ] **Step 4: Build + commit**

Run: `bun run build 2>&1 | tail -3`
Expected: OK.

```bash
git add src/features/conversations/components/tags/ConversationHeaderTags.tsx src/features/conversations/hooks/useConversationTagsHeaderMode.ts src/features/conversations/components/ConversationHeader.tsx
git commit -m "feat(conversations): parametrized header tag display (readonly/quick-add/band)"
```

---

### Task 10: Mini-chips na linha da Inbox

**Files:**
- Modify: `src/features/conversations/components/ConversationListItem.tsx`

**Interfaces:**
- Consumes: `useConversationTags` (Task 6), `resolveConversationTags`/`splitVisibleTags` (Task 1), `ConversationTagChip`/`TagOverflowChip` (Task 7).

- [ ] **Step 1: Render up to 2 mini-chips in the badge row**

Em `src/features/conversations/components/ConversationListItem.tsx`:

1. Imports:

```tsx
import { resolveConversationTags, splitVisibleTags } from "../engine/tagCatalog";
import { useConversationTags } from "../hooks/useConversationTags";
import { ConversationTagChip, TagOverflowChip } from "./tags/ConversationTagChip";
```

2. No corpo do componente (antes do `return`):

```tsx
  const { tags: tagCatalog } = useConversationTags();
  const rowTags = splitVisibleTags(resolveConversationTags(conversation.tags, tagCatalog), 2);
```

3. Na linha de badges (bloco `<div className="mt-1.5 flex items-center gap-1.5">`), logo APÓS o bloco `{temperature && (...)}` e ANTES de `{fresh && (...)}`:

```tsx
          {rowTags.visible.map((tag) => (
            <ConversationTagChip key={tag.id} tag={tag} size="xs" />
          ))}
          <TagOverflowChip tags={rowTags.overflow} size="xs" />
```

**Nota de performance:** o item é memoizado; `useConversationTags` compartilha um único cache TanStack (staleTime 30 min) — sem N+1. Se o profiler acusar re-render em massa, mova a resolução para o pai (`InboxPage`) e passe `rowTags` como prop — NÃO otimize preventivamente.

- [ ] **Step 2: Build + commit**

Run: `bun run build 2>&1 | tail -3`
Expected: OK.

```bash
git add src/features/conversations/components/ConversationListItem.tsx
git commit -m "feat(conversations): conversation tag mini-chips on inbox rows"
```

---

### Task 11: Filtro "Tags" da Inbox — catálogo + IDs + fix do menu (TDD nos params)

**Files:**
- Modify: `src/features/conversations/components/InboxFilters.tsx`
- Modify: `src/features/conversations/pages/InboxPage.tsx` (remove `useAvailableTags`)
- Test: `src/features/conversations/hooks/useInboxFilters.test.ts` (novos casos)

**Interfaces:**
- Consumes: `useConversationTags` (Task 6), `tagColorHex` (Task 1).
- Produces: `IInboxFiltersProps.availableTags: IConversationTag[]` (BREAKING interno — o único caller é `InboxPage`); `state.tags` passa a carregar IDs (o shape `string[]` não muda).

- [ ] **Step 1: Write the failing filter-params tests**

Em `src/features/conversations/hooks/useInboxFilters.test.ts`, adicionar (imports já existentes servem — `filtersToListParams` já é importado; caso não, adicione):

```ts
describe("filtersToListParams — tags", () => {
  it("omits tags when none are selected", () => {
    const params = filtersToListParams(baseState({ tags: [] }), { currentSellerId: null });
    expect(params.tags).toBeUndefined();
  });

  it("passes selected tag ids straight through (OR semantics downstream)", () => {
    const params = filtersToListParams(baseState({ tags: ["ctag-a", "ctag-b"] }), {
      currentSellerId: null,
    });
    expect(params.tags).toEqual(["ctag-a", "ctag-b"]);
  });
});
```

(Use o builder `baseState` existente no arquivo — ele já inicializa `tags: []`; se o builder tiver outro nome, adapte mantendo os asserts.)

- [ ] **Step 2: Run tests to verify the new cases fail/pass**

Run: `bun run test -- useInboxFilters`
Expected: os 2 casos novos devem PASSAR já (a lógica `params.tags` existe) — eles são o CONTRATO de regressão. Se falharem, a assinatura mudou: corrija o teste, não a lógica.

- [ ] **Step 3: Switch the filter to the catalog**

Em `src/features/conversations/components/InboxFilters.tsx`:

1. Imports: `import type { IConversationTag } from "@/shared/types";` e `import { tagColorHex } from "../engine/tagCatalog";` e `INBOX_STRINGS` já importado.
2. Na interface `IInboxFiltersProps` (linha ~31): trocar `availableTags: string[];` por `availableTags: IConversationTag[];`.
3. Substituir o bloco do filtro Tags (linhas ~370-404) por:

```tsx
          {/* Tags (conversation tags — catalog ids; OR semantics) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <span>
                <TriggerButton
                  label={INBOX_STRINGS.tagsLabel}
                  value={INBOX_STRINGS.tagsCounter(state.tags.length)}
                  active={state.tags.length > 0}
                />
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
              <DropdownMenuLabel>{INBOX_STRINGS.tagsLabel}</DropdownMenuLabel>
              {availableTags.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  {INBOX_STRINGS.tagsEmpty}
                </p>
              )}
              {availableTags.map((tag) => {
                const checked = state.tags.includes(tag.id);
                return (
                  <DropdownMenuCheckboxItem
                    key={tag.id}
                    checked={checked}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(next) => {
                      if (next) onTags([...state.tags, tag.id]);
                      else onTags(state.tags.filter((t) => t !== tag.id));
                    }}
                    className="gap-2"
                  >
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: tagColorHex(tag.color) }}
                    />
                    <span className="truncate">
                      {tag.label}
                      {tag.archived && (
                        <span className="ml-1 text-muted-foreground">
                          {INBOX_STRINGS.tagsArchivedSuffix}
                        </span>
                      )}
                    </span>
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
```

4. Em `src/features/conversations/i18n/pt-BR.ts`, junto de `tagsCounter` em `INBOX_STRINGS`, adicionar: `tagsArchivedSuffix: "(arquivada)",`

- [ ] **Step 4: Replace `useAvailableTags` in `InboxPage`**

Em `src/features/conversations/pages/InboxPage.tsx`:

1. DELETAR a função `useAvailableTags` (linhas 35-56) e o import `useCustomersProvider` se ficar órfão (verifique outros usos no arquivo antes).
2. Import novo: `import { useConversationTags } from "../hooks/useConversationTags";`
3. Trocar `const availableTags = useAvailableTags();` (linha ~188) por:

```tsx
  const { tags: tagCatalog } = useConversationTags();
  // Active tags + archived ones still selected in the URL (so saved links keep
  // rendering a removable filter). Spec simplification v1: archived tags with
  // remaining usage are NOT offered unless already selected.
  const availableTags = useMemo(() => {
    const selected = new Set(filters.tags);
    return tagCatalog.filter((t) => !t.archived || selected.has(t.id));
  }, [tagCatalog, filters.tags]);
```

- [ ] **Step 5: Run tests + build + commit**

Run: `bun run test 2>&1 | tail -3 && bun run build 2>&1 | tail -3`
Expected: PASS/OK.

```bash
git add src/features/conversations/components/InboxFilters.tsx src/features/conversations/pages/InboxPage.tsx src/features/conversations/hooks/useInboxFilters.test.ts src/features/conversations/i18n/pt-BR.ts
git commit -m "feat(conversations): inbox Tags filter driven by the conversation-tag catalog"
```

---

### Task 12: Aba de gestão Owner-only (`ConversationTagsSettingsTab`)

**Files:**
- Create: `src/features/admin-settings/pages/ConversationTagsSettingsTab.tsx`

**Interfaces:**
- Consumes: `useConversationTagsProvider`, `recordAuditLog` (via `@/providers/data`), `usePlatformSettings` (`../hooks/usePlatformSettings`), `TAG_PALETTE`/`validateTagLabel`/`tagColorHex` (engine Task 1), `ConversationTagChip` (Task 7), `SectionHeader` (`../components/SectionHeader`), shadcn `Input/Button/AlertDialog/DropdownMenu/Dialog/Popover/Skeleton`.
- Produces: componente `ConversationTagsSettingsTab` (sem props) consumido pela Task 13.

- [ ] **Step 1: Implement the management tab**

Create `src/features/admin-settings/pages/ConversationTagsSettingsTab.tsx`:

```tsx
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ConversationTagsHeaderMode, ID, IConversationTag } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { recordAuditLog, useConversationTagsProvider } from "@/providers/data";
import {
  TAG_PALETTE,
  TAG_LABEL_MAX,
  tagColorHex,
  validateTagLabel,
} from "@/features/conversations/engine/tagCatalog";
import { ConversationTagChip } from "@/features/conversations/components/tags/ConversationTagChip";
import { usePlatformSettings } from "../hooks/usePlatformSettings";
import { SectionHeader } from "../components/SectionHeader";

const HEADER_MODES: { value: ConversationTagsHeaderMode; label: string; description: string }[] = [
  {
    value: "readonly",
    label: "Somente leitura no cabeçalho",
    description: "Chips aparecem no cabeçalho da conversa; a associação fica na aba Atendimento da ficha.",
  },
  {
    value: "quick-add",
    label: "Cabeçalho com adição rápida",
    description: "Chips + botão “+” no cabeçalho abrem o seletor sem abrir a ficha.",
  },
  {
    value: "band",
    label: "Faixa dedicada",
    description: "Uma linha própria abaixo do cabeçalho, sempre visível, com todas as tags.",
  },
];

function SwatchGrid({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor da tag">
      {TAG_PALETTE.map((entry) => (
        <button
          key={entry.id}
          type="button"
          role="radio"
          aria-checked={value === entry.id}
          aria-label={entry.label}
          title={entry.label}
          className={cn(
            "size-8 rounded-full border border-border transition-shadow motion-reduce:transition-none",
            value === entry.id && "ring-2 ring-ring ring-offset-2 ring-offset-background",
          )}
          style={{ backgroundColor: entry.hex }}
          onClick={() => onChange(entry.id)}
        />
      ))}
    </div>
  );
}

export function ConversationTagsSettingsTab() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const { hasRole, currentUser } = useAuth();
  const canManage = hasRole("Owner");
  const provider = useConversationTagsProvider();
  const queryClient = useQueryClient();
  const { settings, saving: savingSettings, update: updateSettings } = usePlatformSettings(storeId);

  const tagsQuery = useQuery({
    queryKey: ["conversation-tags", storeId],
    queryFn: () => provider.list({ storeId }),
    staleTime: 30 * 60 * 1000,
  });
  const usageQuery = useQuery({
    queryKey: ["conversation-tags-usage", storeId],
    queryFn: () => provider.usageCount(storeId),
  });

  const tags = useMemo(() => tagsQuery.data ?? [], [tagsQuery.data]);
  const usage = usageQuery.data ?? {};

  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(TAG_PALETTE[0]!.id);
  const [renaming, setRenaming] = useState<IConversationTag | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<IConversationTag | null>(null);
  const [busy, setBusy] = useState(false);

  const headerMode = settings?.conversationTags?.headerMode ?? "readonly";

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["conversation-tags"] }),
      queryClient.invalidateQueries({ queryKey: ["conversation-tags-usage", storeId] }),
    ]);
  }

  function audit(action: string, resourceId: ID, before: unknown, after: unknown) {
    if (!currentUser) return;
    void recordAuditLog({
      actorId: currentUser.id,
      storeId,
      action,
      resource: "settings",
      resourceId,
      before: before as Record<string, unknown>,
      after: after as Record<string, unknown>,
    });
  }

  async function handleCreate() {
    const validation = validateTagLabel(newLabel, tags.map((t) => t.label));
    if (!validation.ok) {
      toast.error(
        validation.error === "duplicate"
          ? "Já existe uma tag com esse nome."
          : validation.error === "too_long"
            ? `O nome deve ter no máximo ${TAG_LABEL_MAX} caracteres.`
            : "Informe um nome para a tag.",
      );
      return;
    }
    setBusy(true);
    try {
      const created = await provider.create({ storeId, label: validation.label, color: newColor });
      audit("settings.conversation_tag.create", created.id, {}, { label: created.label, color: created.color });
      setNewLabel("");
      await refresh();
      toast.success("Tag criada.");
    } catch {
      toast.error("Não foi possível criar a tag.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRename() {
    if (!renaming) return;
    const others = tags.filter((t) => t.id !== renaming.id).map((t) => t.label);
    const validation = validateTagLabel(renameValue, others);
    if (!validation.ok) {
      toast.error(validation.error === "duplicate" ? "Já existe uma tag com esse nome." : "Nome inválido.");
      return;
    }
    setBusy(true);
    try {
      await provider.update(renaming.id, { label: validation.label });
      audit("settings.conversation_tag.rename", renaming.id, { label: renaming.label }, { label: validation.label });
      setRenaming(null);
      await refresh();
    } catch {
      toast.error("Não foi possível renomear a tag.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRecolor(tag: IConversationTag, color: string) {
    try {
      await provider.update(tag.id, { color });
      audit("settings.conversation_tag.recolor", tag.id, { color: tag.color }, { color });
      await refresh();
    } catch {
      toast.error("Não foi possível trocar a cor.");
    }
  }

  async function handleArchiveToggle(tag: IConversationTag) {
    try {
      await provider.update(tag.id, { archived: !tag.archived });
      audit(
        tag.archived ? "settings.conversation_tag.unarchive" : "settings.conversation_tag.archive",
        tag.id,
        { archived: tag.archived },
        { archived: !tag.archived },
      );
      await refresh();
    } catch {
      toast.error("Não foi possível atualizar a tag.");
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await provider.delete(confirmDelete.id);
      audit("settings.conversation_tag.delete", confirmDelete.id, { label: confirmDelete.label }, {});
      setConfirmDelete(null);
      await refresh();
      toast.success("Tag excluída.");
    } catch {
      toast.error("Não foi possível excluir a tag.");
    } finally {
      setBusy(false);
    }
  }

  async function handleHeaderMode(mode: ConversationTagsHeaderMode) {
    await updateSettings({ conversationTags: { headerMode: mode } }, "settings.conversation_tags.header_mode");
    await queryClient.invalidateQueries({ queryKey: ["platform-settings", storeId] });
  }

  if (tagsQuery.isLoading || !settings) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Tags de conversa"
        description="Etiquetas aplicadas às conversas do Atendimento. Somente o proprietário gerencia o catálogo; atendentes aplicam nas conversas."
      />

      {!canManage && (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Apenas o proprietário pode criar, editar ou excluir tags de conversa.
        </p>
      )}

      {/* Create */}
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="mb-3 text-sm font-medium">Criar tag</p>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Ex.: Aguardando peça"
              maxLength={TAG_LABEL_MAX}
              disabled={busy || !canManage}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
              className="min-w-[12rem] flex-1"
            />
            <Button disabled={busy || !canManage || !newLabel.trim()} onClick={() => void handleCreate()}>
              <Icon icon="mdi:plus" size={16} />
              Criar
            </Button>
          </div>
          {canManage && <SwatchGrid value={newColor} onChange={setNewColor} />}
          {newLabel.trim() && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              Prévia:
              <ConversationTagChip
                tag={{
                  id: "preview",
                  storeId,
                  label: newLabel.trim(),
                  color: newColor,
                  archived: false,
                  createdAt: "",
                  updatedAt: "",
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Catalog list */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Catálogo</p>
          <p className="text-xs text-muted-foreground">{tags.length} tag(s)</p>
        </div>
        {tags.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <Icon icon="mdi:tag-plus-outline" size={28} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhuma tag criada ainda.</p>
          </div>
        )}
        <ul className="divide-y divide-border">
          {tags.map((tag) => {
            const used = usage[tag.id] ?? 0;
            return (
              <li key={tag.id} className="flex items-center gap-3 px-4 py-2.5">
                <ConversationTagChip tag={tag} />
                <span className="text-xs text-muted-foreground">
                  usada em {used} conversa(s)
                </span>
                {canManage && (
                  <span className="ml-auto">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label={`Ações da tag ${tag.label}`}>
                          <Icon icon="mdi:dots-vertical" size={16} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          onSelect={() => {
                            setRenaming(tag);
                            setRenameValue(tag.label);
                          }}
                        >
                          Renomear
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {TAG_PALETTE.map((entry) => (
                          <DropdownMenuItem
                            key={entry.id}
                            onSelect={() => void handleRecolor(tag, entry.id)}
                            className="gap-2"
                          >
                            <span
                              aria-hidden
                              className="size-2.5 rounded-full"
                              style={{ backgroundColor: entry.hex }}
                            />
                            {entry.label}
                            {tag.color === entry.id && <Icon icon="mdi:check" size={13} className="ml-auto" />}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => void handleArchiveToggle(tag)}>
                          {tag.archived ? "Reativar" : "Arquivar"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => setConfirmDelete(tag)}
                        >
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Header layout parameter */}
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="mb-1 text-sm font-medium">Exibição no cabeçalho da conversa</p>
        <p className="mb-3 text-xs text-muted-foreground">
          A associação de tags fica sempre na aba Atendimento da ficha; este parâmetro controla o cabeçalho.
        </p>
        <div className="space-y-2" role="radiogroup" aria-label="Exibição no cabeçalho">
          {HEADER_MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              role="radio"
              aria-checked={headerMode === mode.value}
              disabled={!canManage || savingSettings}
              onClick={() => void handleHeaderMode(mode.value)}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors motion-reduce:transition-none",
                headerMode === mode.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/40",
                (!canManage || savingSettings) && "cursor-not-allowed opacity-60",
              )}
            >
              <Icon
                icon={headerMode === mode.value ? "mdi:radiobox-marked" : "mdi:radiobox-blank"}
                size={18}
                className={headerMode === mode.value ? "text-primary" : "text-muted-foreground"}
              />
              <span>
                <span className="block text-sm font-medium">{mode.label}</span>
                <span className="block text-xs text-muted-foreground">{mode.description}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Rename dialog */}
      <Dialog open={!!renaming} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Renomear tag</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            maxLength={TAG_LABEL_MAX}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleRename();
              }
            }}
          />
          <p className="text-xs text-muted-foreground">
            O novo nome aparece imediatamente em todas as conversas que usam esta tag.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>
              Cancelar
            </Button>
            <Button disabled={busy || !renameValue.trim()} onClick={() => void handleRename()}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tag?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && (
                <>
                  {(usage[confirmDelete.id] ?? 0) > 0 ? (
                    <>
                      A tag <strong>{confirmDelete.label}</strong> está aplicada em{" "}
                      <strong>{usage[confirmDelete.id]} conversa(s)</strong>. Excluir não é permitido
                      enquanto houver uso — prefira <strong>Arquivar</strong>: ela some do seletor e
                      continua visível no histórico.
                    </>
                  ) : (
                    <>
                      A tag <strong>{confirmDelete.label}</strong> não está aplicada em nenhuma
                      conversa e será excluída definitivamente.
                    </>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {confirmDelete && (usage[confirmDelete.id] ?? 0) > 0 ? (
              <AlertDialogAction
                onClick={() => {
                  void handleArchiveToggle(confirmDelete);
                  setConfirmDelete(null);
                }}
              >
                Arquivar
              </AlertDialogAction>
            ) : (
              <AlertDialogAction
                onClick={() => void handleDelete()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

**Notas de implementação:**
- `usePlatformSettings` grava o jsonb inteiro e já audita via `auditLog` interno — o `handleHeaderMode` só passa o `auditAction` custom.
- Confirme os exports reais de `src/components/ui/dialog.tsx` e `dropdown-menu.tsx` antes de importar (nomes acima seguem o padrão shadcn do repo).
- `recordAuditLog`'s `ICreateAuditInput`: confira os campos exatos em `src/providers/data/contracts/audits.ts` — se `before/after` forem tipados como `Record<string, unknown>`, remova os casts.

- [ ] **Step 2: Build + commit**

Run: `bun run build 2>&1 | tail -3`
Expected: OK.

```bash
git add src/features/admin-settings/pages/ConversationTagsSettingsTab.tsx
git commit -m "feat(admin-settings): owner-only conversation tag catalog management tab"
```

---

### Task 13: Hub de 2 abas + rota + menu

**Files:**
- Create: `src/features/admin-settings/pages/TagsHubPage.tsx`
- Modify: `src/features/admin-settings/index.ts` (barrel — verifique o caminho real do barrel da feature; se os exports vivem em outro arquivo índice, ajuste lá)
- Modify: `src/routes/app.configuracoes.atendimento.tags.tsx`
- Modify: `src/features/shell/layouts/SettingsLayout.tsx:124` (label)

**Interfaces:**
- Consumes: `ConversationTagsSettingsTab` (Task 12), `TagsSettingsPage` existente (componente sem props).
- Produces: `TagsHubPage` na rota `/app/configuracoes/atendimento/tags`.

- [ ] **Step 1: Implement the hub**

Create `src/features/admin-settings/pages/TagsHubPage.tsx`:

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConversationTagsSettingsTab } from "./ConversationTagsSettingsTab";
import { TagsSettingsPage } from "./TagsSettingsPage";

/**
 * Two-tab tags hub: conversation tags (new, Owner-only writes) and the
 * pre-existing customer tag catalog page mounted untouched as the second tab
 * (its own Owner+Gestor gate stays as-is).
 */
export function TagsHubPage() {
  return (
    <Tabs defaultValue="conversas" className="space-y-4">
      <TabsList>
        <TabsTrigger value="conversas">Tags de conversa</TabsTrigger>
        <TabsTrigger value="clientes">Tags de cliente</TabsTrigger>
      </TabsList>
      <TabsContent value="conversas" className="focus-visible:outline-none">
        <ConversationTagsSettingsTab />
      </TabsContent>
      <TabsContent value="clientes" className="focus-visible:outline-none">
        <TagsSettingsPage />
      </TabsContent>
    </Tabs>
  );
}
```

- [ ] **Step 2: Export + route + menu label**

1. No barrel `src/features/admin-settings/index.ts` (ou onde `TagsSettingsPage` é exportado — grep `export.*TagsSettingsPage`): adicionar `export { TagsHubPage } from "./pages/TagsHubPage";`
2. Em `src/routes/app.configuracoes.atendimento.tags.tsx`, trocar o import e o componente:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { TagsHubPage } from "@/features/admin-settings";

export const Route = createFileRoute("/app/configuracoes/atendimento/tags")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, { resource: "settings", action: "view" }),
  component: () => (
    <SettingsLayout>
      <TagsHubPage />
    </SettingsLayout>
  ),
});
```

3. Em `src/features/shell/layouts/SettingsLayout.tsx:124`, trocar `label: "Tags do catálogo",` por `label: "Tags",`.

- [ ] **Step 3: Build + commit**

Run: `bun run build 2>&1 | tail -3`
Expected: OK (o plugin do router regenera `routeTree.gen.ts` — NÃO editar manualmente; incluir no commit se regenerado).

```bash
git add src/features/admin-settings/pages/TagsHubPage.tsx src/features/admin-settings/index.ts src/routes/app.configuracoes.atendimento.tags.tsx src/features/shell/layouts/SettingsLayout.tsx src/routeTree.gen.ts
git commit -m "feat(admin-settings): unified tags hub (conversation + customer tabs)"
```

---

### Task 14: Gates finais

**Files:** nenhum novo — verificação.

- [ ] **Step 1: Full quality gates**

```bash
bun run test 2>&1 | tail -5        # esperado: todos verdes (1391+ novos)
bun run lint 2>&1 | tail -5        # esperado: sem novos erros (fronteiras ESLint intactas)
bun run build 2>&1 | tail -3       # esperado: build OK
bunx tsc --noEmit 2>&1 | wc -l     # comparar com a baseline da main (~315 erros): delta deve ser 0
grep -rn "TODO(Task 4)" src/ && echo "FAIL: placeholder left" || echo "OK"
```

- [ ] **Step 2: Frozen-zone audit**

```bash
git diff main...HEAD --name-only | grep -E "useMessages\.ts|useRealtime|useSeedSignedMediaUrls" && echo "FAIL: frozen file touched" || echo "OK: frozen zone untouched"
```

- [ ] **Step 3: Final commit (if any stragglers) + push**

```bash
git status --short   # deve estar limpo
git push -u origin feat/conversation-tags
```

**Não abrir PR nem aplicar migration sem OK do dono** (regra do projeto). Rollout documentado no spec §9: migration → smoke do dono (criar tags, associar nos 3 modos de header, filtro, arquivar/excluir, aba cliente intacta) → PR → merge → bump MINOR + codinome.
