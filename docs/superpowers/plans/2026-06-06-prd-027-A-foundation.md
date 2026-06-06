# PRD-027 — Plano A — Fundação (tipos, engines, providers, mocks, RBAC)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the entire non-UI foundation of PRD-027 (Envio Rápido & Biblioteca de Ativos) so that Plans B and C can build React surfaces on top without inventing anything. This plan OWNS: the new domain types (`src/shared/types/quickSend.ts` + barrel), the 10 pure engines with TDD tests, the 4 provider slices (contracts + factory wiring + `useXProvider` hooks + 4 supabase stubs + 4 mock impls), all mock data (config volumes + deterministic generator + bootstrap + store mutations/selectors + api), the RBAC resources + matrix entries (spec D-12, **no `send` action**), the i18n bundle skeleton (`QUICK_SEND_STRINGS`) and the feature index barrel. NO React UI is built here.

**Architecture:** Mirrors the PRD-026 media feature **exactly** (the gold reference). Provider Pattern (`src/providers/data/`): each of the 4 slices is one `IXProvider` interface (co-located in `quickSend.ts`), re-exported by a `contracts/<slice>.ts` file, registered in `factory.ts` (mock + supabase), exposed by a `useXProvider()` hook via `useDataProviderSlice`. Mock impls call `*Api` (in `src/mocks/api/`) which read seeded data from the Zustand store via selectors and write via `upsert`/`patchById`/`removeById`. Deterministic seed generation via `createSeededContext`. Pure engines live under `src/features/quick-send/engine/` with zero React imports and co-located `*.test.ts` (Vitest node).

**Tech Stack:** React 19 + TS strict + Vite + TanStack Router/Query + Tailwind v4 + shadcn/ui + bun. Tests: Vitest (node env, co-located `*.test.ts`). Pagination type `IPaginatedResult<T>` uses `.data` (NEVER `.items`). RBAC action vocabulary is `view`/`create`/`edit`/`delete`/`approve` ONLY.

---

## Conventions for every task in this plan

- **Test gate** = `bun run build` (vite) GREEN **and** `vitest run` GREEN. `tsc --noEmit` has ~315 PRE-EXISTING errors — judge new code by DELTA only; never claim to fix the baseline.
- **TDD for engines:** write the failing test → run `vitest run <path>` (expect FAIL) → **commit the RED** → write the minimal impl → run `vitest run <path>` (expect PASS) → **commit the GREEN**. Two separate commits per engine.
- **Commits:** Conventional Commits, atomic. End EVERY commit body with exactly:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```
- UI strings pt-BR with correct accents; identifiers English (camelCase fns, PascalCase types, kebab-case files where applicable, `I`-prefixed domain interfaces).
- CRLF warnings on `git add` are a known false positive — do NOT run prettier to "fix" them.
- IGNORE any path containing `worktrees` or `.superpowers` for source reasoning.
- Run commands from repo root `D:\claude\gallo-basediesel`. Use `bun` for everything.
- Requirement IDs referenced inline (RF-xxx / D-xx) map to `docs/prds/PRD-027-envio-rapido-biblioteca-ativos.md` and the design spec.

---

## TASK 1 — New domain types (`quickSend.ts`) + barrel export

**Files:**
- Create: `src/shared/types/quickSend.ts`
- Modify: `src/shared/types/index.ts` (append at end, currently line ~401)

**Steps:**

- [ ] 1.1 Create `src/shared/types/quickSend.ts` with this EXACT content (verbatim from the CONTRACT §A):

```ts
import type { ID, ISO8601, IPaginatedResult } from "./common";

// Categoria e tipo do ativo
export type AssetCategory =
  | "catalogo"
  | "ficha_tecnica"
  | "tabela_preco"
  | "garantia"
  | "video"
  | "link";
export type AssetKind = "document" | "image" | "video" | "link";
export type AssetStatus = "published" | "draft" | "archived";
export type AssetSensitivity = "normal" | "sensitive";

export interface IAssetVersionSnapshot {
  version: number;
  storageRef?: string; // arquivo via PRD-026
  url?: string; // links
  updatedAt: ISO8601;
}

export interface IAssetLibraryItem {
  id: ID;
  storeId: ID;
  division: "parts" | "service" | "industrial"; // default "parts"
  title: string;
  category: AssetCategory;
  brand?: string; // Volvo | Scania | Mercedes-Benz | Ford Cargo | Iveco
  productLine?: string;
  kind: AssetKind;
  storageRef?: string; // arquivos (PRD-026); obfuscado, nunca URL real
  mediaAssetId?: ID; // referência ao IMediaAsset arquivado (quando upload)
  url?: string; // links
  version: number; // corrente
  previousVersion?: IAssetVersionSnapshot; // histórico mínimo (atual + anterior)
  status: AssetStatus;
  sensitivity: AssetSensitivity; // tabela_preco default "sensitive"
  allowedRoleIds?: ID[]; // RBAC por ativo (vazio = regra padrão por papel)
  createdBy: ID;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

export interface IQuickReply {
  id: ID;
  storeId: ID;
  shortcut: string; // ex.: "/garantia"
  title: string;
  body: string; // texto com placeholders {{...}}
  scope: "private" | "shared";
  ownerId: ID;
  allowedRoleIds?: ID[];
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

export interface ITrackableLink {
  id: ID;
  storeId: ID;
  assetId?: ID; // IAssetLibraryItem (quando origem é ativo "link")
  conversationId?: ID;
  leadId?: ID; // alvo da elevação de temperatura
  targetUrl: string;
  shortRef: string; // simulado
  utm?: { source: string; medium: string; campaign: string };
  createdBy: ID;
  opens: number; // simulado na Fase 1
  lastOpenedAt?: ISO8601;
  createdAt: ISO8601;
}

export interface IAssetCombo {
  id: ID;
  storeId: ID;
  title: string;
  assetIds: ID[]; // ordem preservada
  ownerId: ID;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

export type ScheduledSendStatus = "pending" | "sent" | "cancelled" | "failed";
export interface IScheduledSend {
  id: ID;
  storeId: ID;
  conversationId: ID;
  scheduledFor: ISO8601;
  payload: {
    type: "asset" | "snippet" | "combo" | "product";
    assetIds?: ID[];
    quickReplyId?: ID;
    productId?: ID;
    contextMessage?: string;
  };
  status: ScheduledSendStatus;
  failureReason?: string;
  createdBy: ID;
  createdAt: ISO8601;
}

// ---- Provider contracts (co-located here so contracts/* re-export them) ----

export interface IAssetLibraryListParams {
  storeId?: ID;
  category?: AssetCategory;
  brand?: string;
  productLine?: string;
  status?: AssetStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}
export interface IAssetLibraryProvider {
  list(filter: IAssetLibraryListParams): Promise<IPaginatedResult<IAssetLibraryItem>>;
  get(id: ID): Promise<IAssetLibraryItem | null>;
  search(query: string): Promise<IAssetLibraryItem[]>;
  getRecent(sellerId: ID): Promise<IAssetLibraryItem[]>;
  getFavorites(sellerId: ID): Promise<IAssetLibraryItem[]>;
  toggleFavorite(sellerId: ID, id: ID): Promise<boolean>; // novo estado
  create(
    input: Omit<IAssetLibraryItem, "id" | "storeId" | "createdAt" | "updatedAt">,
  ): Promise<IAssetLibraryItem>;
  update(id: ID, patch: Partial<IAssetLibraryItem>): Promise<IAssetLibraryItem>;
  publish(id: ID): Promise<IAssetLibraryItem>;
  unpublish(id: ID): Promise<IAssetLibraryItem>;
  bumpVersion(
    id: ID,
    patch: Pick<IAssetLibraryItem, "storageRef" | "url">,
  ): Promise<IAssetLibraryItem>;
  delete(id: ID): Promise<IAssetLibraryItem>;
  // combos
  listCombos(storeId?: ID): Promise<IAssetCombo[]>;
  saveCombo(
    input: Omit<IAssetCombo, "id" | "storeId" | "createdAt" | "updatedAt">,
  ): Promise<IAssetCombo>;
  deleteCombo(id: ID): Promise<IAssetCombo>;
  recordSend(sellerId: ID, assetId: ID): Promise<void>; // alimenta recentes + estatística
  // Management usage stats (D-13, RF-025). The feature hook consumes this via
  // the provider (the only layer allowed to bridge `@/mocks` — ESLint boundary).
  // Fase 1 aggregates ALL recorded sends; from/to are forward-compat (unused).
  getUsageStats(params?: { from?: ISO8601; to?: ISO8601 }): Promise<{
    topAssets: { assetId: ID; title: string; count: number }[];
    bySeller: { sellerId: ID; count: number }[];
  }>;
}

export interface IQuickReplyProvider {
  list(params: {
    storeId?: ID;
    sellerId?: ID;
    scope?: "private" | "shared";
  }): Promise<IQuickReply[]>;
  get(id: ID): Promise<IQuickReply | null>;
  findByShortcut(shortcut: string, sellerId: ID): Promise<IQuickReply | null>;
  create(input: Omit<IQuickReply, "id" | "storeId" | "createdAt" | "updatedAt">): Promise<IQuickReply>;
  update(id: ID, patch: Partial<IQuickReply>): Promise<IQuickReply>;
  delete(id: ID): Promise<IQuickReply>;
}

export interface ITrackableLinkProvider {
  create(input: Omit<ITrackableLink, "id" | "storeId" | "createdAt" | "opens">): Promise<ITrackableLink>;
  get(id: ID): Promise<ITrackableLink | null>;
  listByConversation(conversationId: ID): Promise<ITrackableLink[]>;
  registerOpen(id: ID): Promise<ITrackableLink>; // incrementa opens/lastOpenedAt
}

export interface IScheduledSendProvider {
  list(conversationId: ID): Promise<IScheduledSend[]>;
  listDue(now: ISO8601): Promise<IScheduledSend[]>;
  create(input: Omit<IScheduledSend, "id" | "storeId" | "status" | "createdAt">): Promise<IScheduledSend>;
  update(id: ID, patch: Partial<IScheduledSend>): Promise<IScheduledSend>;
  cancel(id: ID): Promise<IScheduledSend>;
  markSent(id: ID): Promise<IScheduledSend>;
  markFailed(id: ID, reason: string): Promise<IScheduledSend>;
}
```

- [ ] 1.2 Append to the END of `src/shared/types/index.ts` (after line 401, the `} from "./media";` line):

```ts

// Quick Send & Asset Library (PRD-027)
export type {
  AssetCategory,
  AssetKind,
  AssetStatus,
  AssetSensitivity,
  IAssetVersionSnapshot,
  IAssetLibraryItem,
  IQuickReply,
  ITrackableLink,
  IAssetCombo,
  ScheduledSendStatus,
  IScheduledSend,
  IAssetLibraryListParams,
  IAssetLibraryProvider,
  IQuickReplyProvider,
  ITrackableLinkProvider,
  IScheduledSendProvider,
} from "./quickSend";
```

- [ ] 1.3 Run `bun run build` — expect GREEN (types compile; no consumer yet).
- [ ] 1.4 Commit:
  ```
  git add src/shared/types/quickSend.ts src/shared/types/index.ts
  git commit -m "feat(types): add PRD-027 quick-send domain types + provider contracts"
  ```
  (Body must end with the Co-Authored-By line.)

---

## TASK 2 — Engine `placeholderResolver` (RF-012, D-6) — TDD

**Files:**
- Create: `src/features/quick-send/engine/placeholderResolver.ts`
- Test: `src/features/quick-send/engine/placeholderResolver.test.ts`

**Steps:**

- [ ] 2.1 (RED) Create `src/features/quick-send/engine/placeholderResolver.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolvePlaceholders, hasUnresolved } from "./placeholderResolver";

describe("resolvePlaceholders", () => {
  it("substitutes known placeholders from context", () => {
    const r = resolvePlaceholders("Olá {{nome}}, sobre a {{peca}}", {
      nome: "Carlos",
      peca: "pastilha",
    });
    expect(r.resolved).toBe("Olá Carlos, sobre a pastilha");
    expect(r.gaps).toEqual([]);
  });

  it("lists unresolved placeholders as gaps and renders them as [gap] pills", () => {
    const r = resolvePlaceholders("Prazo {{prazo}} para {{nome}}", { nome: "Ana" });
    expect(r.gaps).toEqual(["prazo"]);
    expect(r.resolved).toBe("Prazo [prazo] para Ana");
  });

  it("treats everything as a gap when context is empty", () => {
    const r = resolvePlaceholders("{{nome}} {{peca}} {{prazo}}", {});
    expect(r.gaps).toEqual(["nome", "peca", "prazo"]);
  });

  it("hasUnresolved is true while raw {{...}} remains", () => {
    expect(hasUnresolved("Olá {{nome}}")).toBe(true);
  });

  it("hasUnresolved is true while a [gap] pill remains", () => {
    expect(hasUnresolved("Prazo [prazo]")).toBe(true);
  });

  it("hasUnresolved is false for fully resolved text", () => {
    expect(hasUnresolved("Olá Carlos, tudo certo")).toBe(false);
  });

  it("ignores empty/whitespace-only braces (not a placeholder)", () => {
    expect(hasUnresolved("custa R$ 10")).toBe(false);
  });
});
```

- [ ] 2.2 Run `bun run vitest run src/features/quick-send/engine/placeholderResolver.test.ts` — expect FAIL (module not found).
- [ ] 2.3 Commit RED:
  ```
  git add src/features/quick-send/engine/placeholderResolver.test.ts
  git commit -m "test(quick-send): RED placeholderResolver engine (RF-012)"
  ```
- [ ] 2.4 (GREEN) Create `src/features/quick-send/engine/placeholderResolver.ts`:

```ts
/**
 * Snippet placeholder resolution (PRD-027 RF-012, D-6).
 *
 * Resolves `{{nome}}/{{peca}}/{{prazo}}` (and any extra key) from a flat
 * context. Unresolved placeholders are listed in `gaps` and rendered as
 * `[gap]` pills so the UI can paint amber, editable fields. `hasUnresolved`
 * is the double send-lock: it regex-rejects ANY remaining `{{...}}` or `[...]`
 * marker so a raw placeholder can never reach the wire.
 */

export interface IPlaceholderContext {
  nome?: string;
  peca?: string;
  prazo?: string;
  [k: string]: string | undefined;
}

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
// Any leftover {{...}} OR a [pill] (non-empty) signals an unresolved gap.
const UNRESOLVED_RE = /\{\{\s*[a-zA-Z0-9_]+\s*\}\}|\[[a-zA-Z0-9_]+\]/;

export function resolvePlaceholders(
  text: string,
  ctx: IPlaceholderContext,
): { resolved: string; gaps: string[] } {
  const gaps: string[] = [];
  const resolved = text.replace(PLACEHOLDER_RE, (_match, key: string) => {
    const value = ctx[key];
    if (value !== undefined && value !== "") return value;
    if (!gaps.includes(key)) gaps.push(key);
    return `[${key}]`;
  });
  return { resolved, gaps };
}

export function hasUnresolved(text: string): boolean {
  return UNRESOLVED_RE.test(text);
}
```

- [ ] 2.5 Run `bun run vitest run src/features/quick-send/engine/placeholderResolver.test.ts` — expect PASS (7 tests).
- [ ] 2.6 Commit GREEN:
  ```
  git add src/features/quick-send/engine/placeholderResolver.ts
  git commit -m "feat(quick-send): placeholderResolver engine (RF-012, D-6)"
  ```

---

## TASK 3 — Engine `slashParser` (RF-007, D-5) — TDD

**Files:**
- Create: `src/features/quick-send/engine/slashParser.ts`
- Test: `src/features/quick-send/engine/slashParser.test.ts`

**Steps:**

- [ ] 3.1 (RED) Create `src/features/quick-send/engine/slashParser.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseSlash } from "./slashParser";

describe("parseSlash", () => {
  it("fires when '/' starts the message", () => {
    const s = parseSlash("/catalogo", 9);
    expect(s.active).toBe(true);
    expect(s.command).toBe("catalogo");
    expect(s.query).toBe("");
  });

  it("captures the query after the command", () => {
    const value = "/catalogo freio";
    const s = parseSlash(value, value.length);
    expect(s.active).toBe(true);
    expect(s.command).toBe("catalogo");
    expect(s.query).toBe("freio");
  });

  it("fires when '/' follows a space", () => {
    const value = "veja isso /tabela";
    const s = parseSlash(value, value.length);
    expect(s.active).toBe(true);
    expect(s.command).toBe("tabela");
  });

  it("does NOT fire inside a URL (http://)", () => {
    const value = "veja http://site.com";
    expect(parseSlash(value, value.length).active).toBe(false);
  });

  it("does NOT fire on a date (12/05)", () => {
    const value = "dia 12/05";
    expect(parseSlash(value, value.length).active).toBe(false);
  });

  it("does NOT fire on a fraction (3/4)", () => {
    const value = "3/4 polegada";
    expect(parseSlash(value, value.length).active).toBe(false);
  });

  it("does NOT fire on a double slash escape (//)", () => {
    const value = "//garantia";
    expect(parseSlash(value, value.length).active).toBe(false);
  });

  it("is inactive when caret is before the slash token", () => {
    const value = "/catalogo freio";
    // caret at position 0 — nothing typed yet at caret
    expect(parseSlash(value, 0).active).toBe(false);
  });
});
```

- [ ] 3.2 Run `bun run vitest run src/features/quick-send/engine/slashParser.test.ts` — expect FAIL.
- [ ] 3.3 Commit RED:
  ```
  git add src/features/quick-send/engine/slashParser.test.ts
  git commit -m "test(quick-send): RED slashParser engine (RF-007)"
  ```
- [ ] 3.4 (GREEN) Create `src/features/quick-send/engine/slashParser.ts`:

```ts
/**
 * Read-only slash-command parser (PRD-027 RF-007, D-5).
 *
 * Inspects the textarea `value` + `caret` and decides whether a slash menu
 * should be active. Fires only when `/` opens a token at the START of the
 * message or immediately AFTER whitespace — never inside a URL, a date
 * (`12/05`), a fraction (`3/4`) or a `//` escape (literal slash).
 *
 * Pure: no React, no side effects. The composer's `handleKey` only changes
 * behavior while `active === true` (conditional gate).
 */

export interface ISlashState {
  active: boolean;
  command: string;
  query: string;
}

const INACTIVE: ISlashState = { active: false, command: "", query: "" };

export function parseSlash(value: string, caret: number): ISlashState {
  if (caret <= 0) return INACTIVE;
  // Consider only the text up to the caret.
  const head = value.slice(0, caret);
  // Find the last slash before the caret.
  const slashIndex = head.lastIndexOf("/");
  if (slashIndex < 0) return INACTIVE;

  // The char immediately before the slash must be start-of-string or whitespace.
  const prev = slashIndex === 0 ? "" : head[slashIndex - 1];
  if (prev !== "" && !/\s/.test(prev)) return INACTIVE;

  // `//` escape → literal slash, never a command.
  if (head[slashIndex + 1] === "/") return INACTIVE;

  const token = head.slice(slashIndex + 1);
  // A bare "/" with nothing typed yet is still an active (empty) command.
  // The token must not contain whitespace before the command word; the first
  // run of word chars is the command, the remainder (after one space) is query.
  const match = /^([a-zA-Z0-9_]*)(?:\s+(.*))?$/.exec(token);
  if (!match) return INACTIVE;

  return {
    active: true,
    command: match[1] ?? "",
    query: (match[2] ?? "").trim(),
  };
}
```

- [ ] 3.5 Run `bun run vitest run src/features/quick-send/engine/slashParser.test.ts` — expect PASS (8 tests).
- [ ] 3.6 Commit GREEN:
  ```
  git add src/features/quick-send/engine/slashParser.ts
  git commit -m "feat(quick-send): slashParser engine (RF-007, D-5)"
  ```

---

## TASK 4 — Engine `assetSensitivity` (D-12) — TDD

**Files:**
- Create: `src/features/quick-send/engine/assetSensitivity.ts`
- Test: `src/features/quick-send/engine/assetSensitivity.test.ts`

**Steps:**

- [ ] 4.1 (RED) Create `src/features/quick-send/engine/assetSensitivity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { IAssetLibraryItem } from "@/shared/types";
import { isSensitiveAsset, canSendSensitiveAsset } from "./assetSensitivity";

function asset(over: Partial<IAssetLibraryItem>): IAssetLibraryItem {
  return {
    id: "a1",
    storeId: "store-matriz",
    division: "parts",
    title: "Catálogo Volvo",
    category: "catalogo",
    kind: "document",
    version: 1,
    status: "published",
    sensitivity: "normal",
    createdBy: "seller-1",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

describe("isSensitiveAsset", () => {
  it("treats tabela_preco as sensitive even when flagged normal", () => {
    expect(isSensitiveAsset(asset({ category: "tabela_preco", sensitivity: "normal" }))).toBe(true);
  });
  it("treats sensitivity:sensitive as sensitive regardless of category", () => {
    expect(isSensitiveAsset(asset({ category: "catalogo", sensitivity: "sensitive" }))).toBe(true);
  });
  it("treats a normal catalogo as not sensitive", () => {
    expect(isSensitiveAsset(asset({ category: "catalogo", sensitivity: "normal" }))).toBe(false);
  });
});

describe("canSendSensitiveAsset", () => {
  it("allows Owner", () => {
    expect(canSendSensitiveAsset({ role: "Owner" })).toBe(true);
  });
  it("allows Gestor", () => {
    expect(canSendSensitiveAsset({ role: "Gestor" })).toBe(true);
  });
  it("blocks Vendedor", () => {
    expect(canSendSensitiveAsset({ role: "Vendedor" })).toBe(false);
  });
  it("blocks SDR", () => {
    expect(canSendSensitiveAsset({ role: "SDR" })).toBe(false);
  });
  it("blocks anonymous (null/undefined)", () => {
    expect(canSendSensitiveAsset(null)).toBe(false);
    expect(canSendSensitiveAsset(undefined)).toBe(false);
  });
});
```

- [ ] 4.2 Run `bun run vitest run src/features/quick-send/engine/assetSensitivity.test.ts` — expect FAIL.
- [ ] 4.3 Commit RED:
  ```
  git add src/features/quick-send/engine/assetSensitivity.test.ts
  git commit -m "test(quick-send): RED assetSensitivity engine (D-12)"
  ```
- [ ] 4.4 (GREEN) Create `src/features/quick-send/engine/assetSensitivity.ts`:

```ts
import type { IAssetLibraryItem, RoleName } from "@/shared/types";

/**
 * Asset sensitivity gates (PRD-027 D-12). Mirrors the media
 * `canViewSensitive` role policy: only Owner/Gestor may send sensitive assets.
 * `tabela_preco` is ALWAYS sensitive (single source of truth), independent of
 * the stored `sensitivity` flag, so a mis-seeded item still gates correctly.
 */

const SENSITIVE_ROLES: readonly RoleName[] = ["Owner", "Gestor"];

export function isSensitiveAsset(item: IAssetLibraryItem): boolean {
  return item.category === "tabela_preco" || item.sensitivity === "sensitive";
}

export function canSendSensitiveAsset(
  viewer: { role: RoleName } | null | undefined,
): boolean {
  if (!viewer) return false;
  return SENSITIVE_ROLES.includes(viewer.role);
}
```

- [ ] 4.5 Run `bun run vitest run src/features/quick-send/engine/assetSensitivity.test.ts` — expect PASS.
- [ ] 4.6 Commit GREEN:
  ```
  git add src/features/quick-send/engine/assetSensitivity.ts
  git commit -m "feat(quick-send): assetSensitivity engine (D-12)"
  ```

---

## TASK 5 — Engine `assetVersioning` (RF-020) — TDD

**Files:**
- Create: `src/features/quick-send/engine/assetVersioning.ts`
- Test: `src/features/quick-send/engine/assetVersioning.test.ts`

**Steps:**

- [ ] 5.1 (RED) Create `src/features/quick-send/engine/assetVersioning.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { IAssetLibraryItem } from "@/shared/types";
import { pickSendableVersion, bumpVersion } from "./assetVersioning";

function asset(over: Partial<IAssetLibraryItem>): IAssetLibraryItem {
  return {
    id: "a1",
    storeId: "store-matriz",
    division: "parts",
    title: "Catálogo Volvo",
    category: "catalogo",
    kind: "document",
    storageRef: "ref-v1",
    version: 1,
    status: "published",
    sensitivity: "normal",
    createdBy: "seller-1",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

describe("pickSendableVersion", () => {
  it("returns the item when published", () => {
    const a = asset({ status: "published" });
    expect(pickSendableVersion(a)).toBe(a);
  });
  it("returns null for draft", () => {
    expect(pickSendableVersion(asset({ status: "draft" }))).toBeNull();
  });
  it("returns null for archived", () => {
    expect(pickSendableVersion(asset({ status: "archived" }))).toBeNull();
  });
});

describe("bumpVersion", () => {
  it("moves current to previousVersion and increments version", () => {
    const a = asset({ version: 1, storageRef: "ref-v1" });
    const next = bumpVersion(a, { storageRef: "ref-v2", url: undefined });
    expect(next.version).toBe(2);
    expect(next.storageRef).toBe("ref-v2");
    expect(next.previousVersion).toEqual({
      version: 1,
      storageRef: "ref-v1",
      url: undefined,
      updatedAt: a.updatedAt,
    });
  });
  it("does not mutate the input item", () => {
    const a = asset({ version: 1 });
    bumpVersion(a, { storageRef: "ref-v2" });
    expect(a.version).toBe(1);
    expect(a.previousVersion).toBeUndefined();
  });
});
```

- [ ] 5.2 Run `bun run vitest run src/features/quick-send/engine/assetVersioning.test.ts` — expect FAIL.
- [ ] 5.3 Commit RED:
  ```
  git add src/features/quick-send/engine/assetVersioning.test.ts
  git commit -m "test(quick-send): RED assetVersioning engine (RF-020)"
  ```
- [ ] 5.4 (GREEN) Create `src/features/quick-send/engine/assetVersioning.ts`:

```ts
import type { IAssetLibraryItem } from "@/shared/types";

/**
 * Asset version selection + bump (PRD-027 RF-020). Only a `published` asset is
 * sendable. `bumpVersion` snapshots the current version into `previousVersion`
 * (history of one), increments `version`, and applies the new ref/url — pure,
 * returns a fresh object (never mutates the input).
 */

export function pickSendableVersion(item: IAssetLibraryItem): IAssetLibraryItem | null {
  return item.status === "published" ? item : null;
}

export function bumpVersion(
  item: IAssetLibraryItem,
  patch: Pick<IAssetLibraryItem, "storageRef" | "url">,
): IAssetLibraryItem {
  return {
    ...item,
    version: item.version + 1,
    storageRef: patch.storageRef,
    url: patch.url,
    previousVersion: {
      version: item.version,
      storageRef: item.storageRef,
      url: item.url,
      updatedAt: item.updatedAt,
    },
  };
}
```

- [ ] 5.5 Run `bun run vitest run src/features/quick-send/engine/assetVersioning.test.ts` — expect PASS.
- [ ] 5.6 Commit GREEN:
  ```
  git add src/features/quick-send/engine/assetVersioning.ts
  git commit -m "feat(quick-send): assetVersioning engine (RF-020)"
  ```

---

## TASK 6 — Engine `assetFiltering` (RF-006/RF-009) — TDD

**Files:**
- Create: `src/features/quick-send/engine/assetFiltering.ts`
- Test: `src/features/quick-send/engine/assetFiltering.test.ts`

**Steps:**

- [ ] 6.1 (RED) Create `src/features/quick-send/engine/assetFiltering.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { IAssetLibraryItem } from "@/shared/types";
import { filterAssets } from "./assetFiltering";

function asset(over: Partial<IAssetLibraryItem>): IAssetLibraryItem {
  return {
    id: "a1",
    storeId: "store-matriz",
    division: "parts",
    title: "Catálogo Freios Volvo",
    category: "catalogo",
    brand: "Volvo",
    productLine: "Freios",
    kind: "document",
    version: 1,
    status: "published",
    sensitivity: "normal",
    createdBy: "seller-1",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

const items: IAssetLibraryItem[] = [
  asset({ id: "a1", title: "Catálogo Freios Volvo", brand: "Volvo", category: "catalogo", productLine: "Freios" }),
  asset({ id: "a2", title: "Tabela de Preços Scania", brand: "Scania", category: "tabela_preco", productLine: "Motor" }),
  asset({ id: "a3", title: "Ficha Técnica Embreagem", brand: "Volvo", category: "ficha_tecnica", productLine: "Embreagem" }),
];

describe("filterAssets", () => {
  it("returns all when filter is empty", () => {
    expect(filterAssets(items, {})).toHaveLength(3);
  });
  it("filters by category", () => {
    const r = filterAssets(items, { category: "tabela_preco" });
    expect(r.map((a) => a.id)).toEqual(["a2"]);
  });
  it("filters by brand", () => {
    const r = filterAssets(items, { brand: "Volvo" });
    expect(r.map((a) => a.id)).toEqual(["a1", "a3"]);
  });
  it("filters by productLine", () => {
    const r = filterAssets(items, { productLine: "Freios" });
    expect(r.map((a) => a.id)).toEqual(["a1"]);
  });
  it("does case-insensitive title match on query", () => {
    const r = filterAssets(items, { query: "freios" });
    expect(r.map((a) => a.id)).toEqual(["a1"]);
  });
  it("applies a composite filter (brand + query)", () => {
    const r = filterAssets(items, { brand: "Volvo", query: "ficha" });
    expect(r.map((a) => a.id)).toEqual(["a3"]);
  });
  it("returns empty when nothing matches", () => {
    expect(filterAssets(items, { query: "zzz" })).toEqual([]);
  });
});
```

- [ ] 6.2 Run `bun run vitest run src/features/quick-send/engine/assetFiltering.test.ts` — expect FAIL.
- [ ] 6.3 Commit RED:
  ```
  git add src/features/quick-send/engine/assetFiltering.test.ts
  git commit -m "test(quick-send): RED assetFiltering engine (RF-006/RF-009)"
  ```
- [ ] 6.4 (GREEN) Create `src/features/quick-send/engine/assetFiltering.ts`:

```ts
import type { AssetCategory, IAssetLibraryItem } from "@/shared/types";

/**
 * Composite asset filter (PRD-027 RF-006/RF-009 base). Filters by
 * category/brand/productLine (exact) and a case-insensitive title query. An
 * empty filter returns the input untouched (order preserved). Pure.
 */

export interface IAssetFilter {
  category?: AssetCategory;
  brand?: string;
  productLine?: string;
  query?: string;
}

export function filterAssets(
  items: IAssetLibraryItem[],
  filter: IAssetFilter,
): IAssetLibraryItem[] {
  const query = filter.query?.trim().toLowerCase() ?? "";
  return items.filter((item) => {
    if (filter.category && item.category !== filter.category) return false;
    if (filter.brand && item.brand !== filter.brand) return false;
    if (filter.productLine && item.productLine !== filter.productLine) return false;
    if (query.length > 0 && !item.title.toLowerCase().includes(query)) return false;
    return true;
  });
}
```

- [ ] 6.5 Run `bun run vitest run src/features/quick-send/engine/assetFiltering.test.ts` — expect PASS.
- [ ] 6.6 Commit GREEN:
  ```
  git add src/features/quick-send/engine/assetFiltering.ts
  git commit -m "feat(quick-send): assetFiltering engine (RF-006/RF-009)"
  ```

---

## TASK 7 — Engine `temperatureEscalation` (RF-017, D-9) — TDD

**Files:**
- Create: `src/features/quick-send/engine/temperatureEscalation.ts`
- Test: `src/features/quick-send/engine/temperatureEscalation.test.ts`

**Steps:**

- [ ] 7.1 (RED) Create `src/features/quick-send/engine/temperatureEscalation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextTemperature } from "./temperatureEscalation";

describe("nextTemperature", () => {
  it("escalates frio → morno", () => {
    expect(nextTemperature("frio")).toBe("morno");
  });
  it("escalates morno → quente", () => {
    expect(nextTemperature("morno")).toBe("quente");
  });
  it("keeps quente stable (never overflows)", () => {
    expect(nextTemperature("quente")).toBe("quente");
  });
});
```

- [ ] 7.2 Run `bun run vitest run src/features/quick-send/engine/temperatureEscalation.test.ts` — expect FAIL.
- [ ] 7.3 Commit RED:
  ```
  git add src/features/quick-send/engine/temperatureEscalation.test.ts
  git commit -m "test(quick-send): RED temperatureEscalation engine (RF-017)"
  ```
- [ ] 7.4 (GREEN) Create `src/features/quick-send/engine/temperatureEscalation.ts`:

```ts
import type { LeadTemperature } from "@/shared/types";

/**
 * Monotonic lead temperature escalation (PRD-027 D-9, RF-017).
 * `frio → morno → quente`; `quente` is the ceiling. NEVER downgrades.
 */

const LADDER: Record<LeadTemperature, LeadTemperature> = {
  frio: "morno",
  morno: "quente",
  quente: "quente",
};

export function nextTemperature(current: LeadTemperature): LeadTemperature {
  return LADDER[current];
}
```

- [ ] 7.5 Run `bun run vitest run src/features/quick-send/engine/temperatureEscalation.test.ts` — expect PASS.
- [ ] 7.6 Commit GREEN:
  ```
  git add src/features/quick-send/engine/temperatureEscalation.ts
  git commit -m "feat(quick-send): temperatureEscalation engine (RF-017, D-9)"
  ```

---

## TASK 8 — Engine `trackableLink` (RF-016, D-8) — TDD

**Files:**
- Create: `src/features/quick-send/engine/trackableLink.ts`
- Test: `src/features/quick-send/engine/trackableLink.test.ts`

> NOTE: This file ALSO exports `export const TRACKABLE_LINK_MARKER = "[link]"` (CONTRACT §H.1) so `MessageBubble` (Plan C) can import it. It ALSO exports the pure PRODUCER `encodeLinkMarker(payload: ILinkPayload): string` and the `ILinkPayload` type (CONTRACT §B, §H.1) — the counterpart to `LinkBubble.decodeLinkMarker` (Plan C, which imports `ILinkPayload` from here). Plan A builds ONLY the pure encoder + type; the send-flow wiring stays Plan C.

**Steps:**

- [ ] 8.1 (RED) Create `src/features/quick-send/engine/trackableLink.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildShortRef,
  buildUtm,
  encodeLinkMarker,
  TRACKABLE_LINK_MARKER,
  type ILinkPayload,
} from "./trackableLink";

describe("buildShortRef", () => {
  it("is deterministic for the same seed", () => {
    expect(buildShortRef("asset-001")).toBe(buildShortRef("asset-001"));
  });
  it("differs for different seeds", () => {
    expect(buildShortRef("asset-001")).not.toBe(buildShortRef("asset-002"));
  });
  it("produces a glo.bz short ref shape", () => {
    expect(buildShortRef("asset-001")).toMatch(/^glo\.bz\/[a-z0-9]+$/);
  });
});

describe("buildUtm", () => {
  it("returns a well-formed utm record", () => {
    const utm = buildUtm({ source: "whatsapp", medium: "chat", campaign: "catalogo" });
    expect(utm).toEqual({ source: "whatsapp", medium: "chat", campaign: "catalogo" });
  });
});

describe("TRACKABLE_LINK_MARKER", () => {
  it("is the [link] prefix", () => {
    expect(TRACKABLE_LINK_MARKER).toBe("[link]");
  });
});

describe("encodeLinkMarker", () => {
  const payload: ILinkPayload = {
    linkId: "tl-001",
    label: "Catálogo Freios Volvo",
    shortRef: "glo.bz/a1b2c3",
  };

  it("prefixes the encoded payload with the [link] marker", () => {
    expect(encodeLinkMarker(payload)).toMatch(/^\[link\]\{/);
  });

  it("serializes exactly linkId/label/shortRef as JSON", () => {
    expect(encodeLinkMarker(payload)).toBe(
      `[link]${JSON.stringify({ linkId: "tl-001", label: "Catálogo Freios Volvo", shortRef: "glo.bz/a1b2c3" })}`,
    );
  });

  it("round-trips with a JSON.parse of the body (decoder counterpart)", () => {
    const encoded = encodeLinkMarker(payload);
    const body = encoded.slice(TRACKABLE_LINK_MARKER.length);
    expect(JSON.parse(body)).toEqual(payload);
  });
});
```

- [ ] 8.2 Run `bun run vitest run src/features/quick-send/engine/trackableLink.test.ts` — expect FAIL.
- [ ] 8.3 Commit RED:
  ```
  git add src/features/quick-send/engine/trackableLink.test.ts
  git commit -m "test(quick-send): RED trackableLink engine + encodeLinkMarker (RF-016)"
  ```
- [ ] 8.4 (GREEN) Create `src/features/quick-send/engine/trackableLink.ts`:

```ts
import type { ID } from "@/shared/types";

/**
 * Trackable link helpers (PRD-027 RF-016, D-8). Builds a deterministic
 * `glo.bz/<ref>` short ref from a seed (simulated; Fase 2 swaps in a real
 * short-link service) and a well-formed UTM record. Also exports the `[link]`
 * message marker and the PRODUCER `encodeLinkMarker` consumed by MessageBubble /
 * LinkBubble (CONTRACT §H.1). The DECODER (`decodeLinkMarker`) is owned by
 * `LinkBubble.tsx` (Plan C) and imports `ILinkPayload` from here.
 */

export const TRACKABLE_LINK_MARKER = "[link]";

/**
 * Snapshot serialized into a `[link]<json>` outbound message (CONTRACT §H.1).
 * Single source of truth for both the encoder (here) and the decoder (LinkBubble).
 */
export interface ILinkPayload {
  linkId: ID;
  label: string;
  shortRef: string;
}

/** Deterministic FNV-1a → base36 short ref (mirrors media contentHash). */
export function buildShortRef(seed: string): string {
  let hash = 0x811c9dc5; // FNV offset basis (32-bit)
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime, 32-bit via imul
  }
  return `glo.bz/${(hash >>> 0).toString(36)}`;
}

export function buildUtm(input: {
  source: string;
  medium: string;
  campaign: string;
}): { source: string; medium: string; campaign: string } {
  return {
    source: input.source,
    medium: input.medium,
    campaign: input.campaign,
  };
}

/**
 * Encode a trackable-link snapshot as a `[link]<json>` outbound message marker.
 * Pure producer; the inverse `decodeLinkMarker` lives in `LinkBubble.tsx`
 * (Plan C) and round-trips this output. The IMessage schema does NOT change.
 */
export function encodeLinkMarker(payload: ILinkPayload): string {
  return `${TRACKABLE_LINK_MARKER}${JSON.stringify(payload)}`;
}
```

- [ ] 8.5 Run `bun run vitest run src/features/quick-send/engine/trackableLink.test.ts` — expect PASS (8 tests: 3 buildShortRef, 1 buildUtm, 1 marker, 3 encodeLinkMarker).
- [ ] 8.6 Commit GREEN:
  ```
  git add src/features/quick-send/engine/trackableLink.ts
  git commit -m "feat(quick-send): trackableLink engine + [link] marker + encodeLinkMarker (RF-016, D-8)"
  ```

---

## TASK 9 — Engine `scheduledSend` (RF-023, D-11) — TDD

**Files:**
- Create: `src/features/quick-send/engine/scheduledSend.ts`
- Test: `src/features/quick-send/engine/scheduledSend.test.ts`

**Steps:**

- [ ] 9.1 (RED) Create `src/features/quick-send/engine/scheduledSend.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isDue, validateFuture } from "./scheduledSend";

const NOW = "2026-06-06T12:00:00.000Z";

describe("isDue", () => {
  it("is true when scheduledFor equals now", () => {
    expect(isDue(NOW, NOW)).toBe(true);
  });
  it("is true when scheduledFor is in the past", () => {
    expect(isDue("2026-06-06T11:00:00.000Z", NOW)).toBe(true);
  });
  it("is false when scheduledFor is in the future", () => {
    expect(isDue("2026-06-06T13:00:00.000Z", NOW)).toBe(false);
  });
});

describe("validateFuture", () => {
  it("rejects a past datetime", () => {
    const r = validateFuture("2026-06-06T11:00:00.000Z", NOW);
    expect(r.ok).toBe(false);
    expect(r.reason).toBeTruthy();
  });
  it("rejects now exactly (must be strictly future)", () => {
    expect(validateFuture(NOW, NOW).ok).toBe(false);
  });
  it("accepts a future datetime", () => {
    expect(validateFuture("2026-06-06T18:00:00.000Z", NOW)).toEqual({ ok: true });
  });
});
```

- [ ] 9.2 Run `bun run vitest run src/features/quick-send/engine/scheduledSend.test.ts` — expect FAIL.
- [ ] 9.3 Commit RED:
  ```
  git add src/features/quick-send/engine/scheduledSend.test.ts
  git commit -m "test(quick-send): RED scheduledSend engine (RF-023)"
  ```
- [ ] 9.4 (GREEN) Create `src/features/quick-send/engine/scheduledSend.ts`:

```ts
import type { ISO8601 } from "@/shared/types";

/**
 * Scheduled-send timing helpers (PRD-027 RF-023, D-11). `isDue` decides when a
 * pending send fires (scheduledFor <= now); `validateFuture` rejects past or
 * present datetimes at creation. Pure; compares ISO 8601 via Date.parse so it
 * is timezone-safe.
 */

export function isDue(scheduledFor: ISO8601, now: ISO8601): boolean {
  return Date.parse(scheduledFor) <= Date.parse(now);
}

export function validateFuture(
  scheduledFor: ISO8601,
  now: ISO8601,
): { ok: boolean; reason?: string } {
  const at = Date.parse(scheduledFor);
  if (Number.isNaN(at)) {
    return { ok: false, reason: "Data inválida." };
  }
  if (at <= Date.parse(now)) {
    return { ok: false, reason: "O horário do agendamento deve estar no futuro." };
  }
  return { ok: true };
}
```

- [ ] 9.5 Run `bun run vitest run src/features/quick-send/engine/scheduledSend.test.ts` — expect PASS.
- [ ] 9.6 Commit GREEN:
  ```
  git add src/features/quick-send/engine/scheduledSend.ts
  git commit -m "feat(quick-send): scheduledSend engine (RF-023, D-11)"
  ```

---

## TASK 10 — Engine `comboSend` (RF-022, D-10) — TDD

**Files:**
- Create: `src/features/quick-send/engine/comboSend.ts`
- Test: `src/features/quick-send/engine/comboSend.test.ts`

**Steps:**

- [ ] 10.1 (RED) Create `src/features/quick-send/engine/comboSend.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { IAssetLibraryItem } from "@/shared/types";
import { planComboSend } from "./comboSend";

function asset(over: Partial<IAssetLibraryItem>): IAssetLibraryItem {
  return {
    id: "a1",
    storeId: "store-matriz",
    division: "parts",
    title: "Catálogo Volvo",
    category: "catalogo",
    kind: "document",
    version: 1,
    status: "published",
    sensitivity: "normal",
    createdBy: "seller-1",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

describe("planComboSend", () => {
  it("preserves order of sendable items", () => {
    const items = [asset({ id: "a1" }), asset({ id: "a2" }), asset({ id: "a3" })];
    const plan = planComboSend(items, { role: "Vendedor" });
    expect(plan.sendable).toEqual(["a1", "a2", "a3"]);
    expect(plan.skipped).toEqual([]);
  });

  it("skips unpublished items with a reason (does not abort the combo)", () => {
    const items = [asset({ id: "a1" }), asset({ id: "a2", status: "draft" }), asset({ id: "a3" })];
    const plan = planComboSend(items, { role: "Vendedor" });
    expect(plan.sendable).toEqual(["a1", "a3"]);
    expect(plan.skipped).toEqual([{ assetId: "a2", ok: false, reason: "unpublished" }]);
  });

  it("skips a sensitive item for a Vendedor (no permission)", () => {
    const items = [asset({ id: "a1" }), asset({ id: "a2", category: "tabela_preco" })];
    const plan = planComboSend(items, { role: "Vendedor" });
    expect(plan.sendable).toEqual(["a1"]);
    expect(plan.skipped).toEqual([{ assetId: "a2", ok: false, reason: "sensitive_no_permission" }]);
  });

  it("allows a sensitive item for an Owner", () => {
    const items = [asset({ id: "a2", category: "tabela_preco" })];
    const plan = planComboSend(items, { role: "Owner" });
    expect(plan.sendable).toEqual(["a2"]);
    expect(plan.skipped).toEqual([]);
  });

  it("skips everything gracefully for an empty list", () => {
    expect(planComboSend([], { role: "Owner" })).toEqual({ sendable: [], skipped: [] });
  });
});
```

- [ ] 10.2 Run `bun run vitest run src/features/quick-send/engine/comboSend.test.ts` — expect FAIL.
- [ ] 10.3 Commit RED:
  ```
  git add src/features/quick-send/engine/comboSend.test.ts
  git commit -m "test(quick-send): RED comboSend engine (RF-022)"
  ```
- [ ] 10.4 (GREEN) Create `src/features/quick-send/engine/comboSend.ts`:

```ts
import type { ID, IAssetLibraryItem, RoleName } from "@/shared/types";
import { isSensitiveAsset, canSendSensitiveAsset } from "./assetSensitivity";
import { pickSendableVersion } from "./assetVersioning";

/**
 * Combo fan-out planner (PRD-027 RF-022, D-10). Walks the combo in order and
 * classifies each item as sendable or skipped (with a reason). A skipped item
 * NEVER aborts the rest of the combo — partial success is the contract. Pure.
 */

export interface IComboPlanItem {
  assetId: ID;
  ok: boolean;
  reason?: string;
}
export interface IComboPlan {
  sendable: ID[];
  skipped: IComboPlanItem[];
}

export function planComboSend(
  items: IAssetLibraryItem[],
  viewer: { role: RoleName } | null | undefined,
): IComboPlan {
  const sendable: ID[] = [];
  const skipped: IComboPlanItem[] = [];

  for (const item of items) {
    if (!pickSendableVersion(item)) {
      skipped.push({ assetId: item.id, ok: false, reason: "unpublished" });
      continue;
    }
    if (isSensitiveAsset(item) && !canSendSensitiveAsset(viewer)) {
      skipped.push({ assetId: item.id, ok: false, reason: "sensitive_no_permission" });
      continue;
    }
    sendable.push(item.id);
  }

  return { sendable, skipped };
}
```

- [ ] 10.5 Run `bun run vitest run src/features/quick-send/engine/comboSend.test.ts` — expect PASS.
- [ ] 10.6 Commit GREEN:
  ```
  git add src/features/quick-send/engine/comboSend.ts
  git commit -m "feat(quick-send): comboSend engine (RF-022, D-10)"
  ```

---

## TASK 11 — Engine `productCardPayload` (RF-015, D-7) — TDD

**Files:**
- Create: `src/features/quick-send/engine/productCardPayload.ts`
- Test: `src/features/quick-send/engine/productCardPayload.test.ts`

> NOTE: This file ALSO exports `export const PRODUCT_CARD_MARKER = "[produto]"` (CONTRACT §H.1) consumed by `MessageBubble` (Plan B).

**Steps:**

- [ ] 11.1 (RED) Create `src/features/quick-send/engine/productCardPayload.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  encodeProductCard,
  decodeProductCard,
  priceLabel,
  hasImage,
  PRODUCT_CARD_MARKER,
  type IProductCardSnapshot,
} from "./productCardPayload";

function snap(over: Partial<IProductCardSnapshot>): IProductCardSnapshot {
  return {
    id: "part-001",
    name: "Pastilha de Freio FH",
    oem: "20758807",
    equivalence: "Bosch 0986",
    stockLabel: "Em estoque",
    stockSeverity: "ok",
    price: 189.9,
    imageRef: "ref-abc",
    ...over,
  };
}

describe("encode/decode round-trip", () => {
  it("encodes with the [produto] marker", () => {
    expect(encodeProductCard(snap({}))).toMatch(/^\[produto\]\{/);
  });
  it("round-trips a snapshot", () => {
    const s = snap({});
    expect(decodeProductCard(encodeProductCard(s))).toEqual(s);
  });
  it("returns null for non-marker text (degrade)", () => {
    expect(decodeProductCard("apenas um texto")).toBeNull();
  });
  it("returns null for malformed json after the marker (degrade)", () => {
    expect(decodeProductCard("[produto]{not json")).toBeNull();
  });
});

describe("priceLabel", () => {
  it("formats a price in BRL", () => {
    expect(priceLabel(snap({ price: 189.9 }))).toContain("189,90");
  });
  it("returns 'Consultar valor' when no price (never R$ 0,00)", () => {
    expect(priceLabel(snap({ price: undefined }))).toBe("Consultar valor");
  });
});

describe("hasImage", () => {
  it("is true with an imageRef", () => {
    expect(hasImage(snap({ imageRef: "ref-abc" }))).toBe(true);
  });
  it("is false without an imageRef (tile fallback)", () => {
    expect(hasImage(snap({ imageRef: undefined }))).toBe(false);
  });
});

describe("PRODUCT_CARD_MARKER", () => {
  it("is the [produto] prefix", () => {
    expect(PRODUCT_CARD_MARKER).toBe("[produto]");
  });
});
```

- [ ] 11.2 Run `bun run vitest run src/features/quick-send/engine/productCardPayload.test.ts` — expect FAIL.
- [ ] 11.3 Commit RED:
  ```
  git add src/features/quick-send/engine/productCardPayload.test.ts
  git commit -m "test(quick-send): RED productCardPayload engine (RF-015)"
  ```
- [ ] 11.4 (GREEN) Create `src/features/quick-send/engine/productCardPayload.ts`:

```ts
import type { ID } from "@/shared/types";

/**
 * Product card payload codec (PRD-027 RF-015, D-7). The card is persisted as an
 * IMessage whose `text` is `[produto]<json>` (mirrors the `[template]` marker);
 * the IMessage schema does NOT change. `decode` round-trips and returns null on
 * any parse failure so MessageBubble can degrade to a plain TextBubble.
 */

export const PRODUCT_CARD_MARKER = "[produto]";

export interface IProductCardSnapshot {
  id: ID;
  name: string;
  oem?: string;
  equivalence?: string;
  stockLabel: string;
  stockSeverity: "ok" | "warning" | "critical";
  price?: number;
  imageRef?: string;
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function encodeProductCard(s: IProductCardSnapshot): string {
  return `${PRODUCT_CARD_MARKER}${JSON.stringify(s)}`;
}

export function decodeProductCard(text: string): IProductCardSnapshot | null {
  if (!text.startsWith(PRODUCT_CARD_MARKER)) return null;
  const json = text.slice(PRODUCT_CARD_MARKER.length);
  try {
    const parsed = JSON.parse(json) as IProductCardSnapshot;
    if (!parsed || typeof parsed.id !== "string" || typeof parsed.name !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Price text — never "R$ 0,00"; missing price degrades to a consult label. */
export function priceLabel(s: IProductCardSnapshot): string {
  if (s.price === undefined || s.price === null) return "Consultar valor";
  return BRL.format(s.price);
}

export function hasImage(s: IProductCardSnapshot): boolean {
  return typeof s.imageRef === "string" && s.imageRef.length > 0;
}
```

- [ ] 11.5 Run `bun run vitest run src/features/quick-send/engine/productCardPayload.test.ts` — expect PASS.
- [ ] 11.6 Commit GREEN:
  ```
  git add src/features/quick-send/engine/productCardPayload.ts
  git commit -m "feat(quick-send): productCardPayload engine + [produto] marker (RF-015, D-7)"
  ```

---

## TASK 12 — RBAC resources + matrix (D-12)

**Files:**
- Modify: `src/features/rbac/permissions/resources.ts`
- Modify: `src/features/rbac/permissions/matrix.ts`

**Steps:**

- [ ] 12.1 In `src/features/rbac/permissions/resources.ts`, add four literals to the `RESOURCES` array, immediately AFTER the `"ecommerce_integration",` line and BEFORE `] as const;`:

```ts
  "asset_library",
  "quick_reply",
  "trackable_link",
  "scheduled_send",
```

- [ ] 12.2 In `src/features/rbac/permissions/matrix.ts`, append to `OWNER_ENTRIES` (after the `p("ecommerce_integration", ["view", "edit"], "all"),` line, before the closing `];`):

```ts
  // Quick Send & Asset Library (PRD-027 D-12)
  p("asset_library", CRUD, "all"),
  p("quick_reply", CRUD, "all"),
  p("trackable_link", CRUD, "all"),
  p("scheduled_send", CRUD, "all"),
```

- [ ] 12.3 Append to `GESTOR_ENTRIES` (after `p("storefront_admin", ["view"], "store"),`, before the closing `];`):

```ts
  // Quick Send & Asset Library (PRD-027 D-12) — manage at store scope.
  p("asset_library", CRUD, "store"),
  p("quick_reply", CRUD, "store"),
  p("trackable_link", CRUD, "store"),
  p("scheduled_send", CRUD, "store"),
```

- [ ] 12.4 Append to `VENDEDOR_ENTRIES` (after `p("settings", ["view"], "own"),`, before the closing `];`):

```ts
  // Quick Send & Asset Library (PRD-027 D-12) — read library, create own links/sends.
  p("asset_library", ["view"], "own"),
  p("quick_reply", ["view"], "own"),
  p("trackable_link", ["create"], "own"),
  p("scheduled_send", ["create"], "own"),
```

- [ ] 12.5 Append to `SDR_ENTRIES` (after `p("seller", ["view"], "store"),`, before the closing `];`):

```ts
  // Quick Send & Asset Library (PRD-027 D-12) — same as Vendedor.
  p("asset_library", ["view"], "own"),
  p("quick_reply", ["view"], "own"),
  p("trackable_link", ["create"], "own"),
  p("scheduled_send", ["create"], "own"),
```

- [ ] 12.6 Run `bun run build` — expect GREEN.
- [ ] 12.7 Commit:
  ```
  git add src/features/rbac/permissions/resources.ts src/features/rbac/permissions/matrix.ts
  git commit -m "feat(rbac): add PRD-027 asset_library/quick_reply/trackable_link/scheduled_send resources + matrix (D-12)"
  ```

---

## TASK 13 — Mock config: volumes + entity names (DELTA PRD-004)

**Files:**
- Modify: `src/mocks/config.ts`

**Steps:**

- [ ] 13.1 In `src/mocks/config.ts`, append to the `MockEntityName` union, replacing the final `| "mediaAssets";` line with:

```ts
  | "mediaAssets"
  | "assetLibraryItems"
  | "quickReplies"
  | "trackableLinks"
  | "assetCombos"
  | "scheduledSends";
```

- [ ] 13.2 In the `VOLUMES` record, replace the final `  mediaAssets: 90,\n};` block with:

```ts
  mediaAssets: 90,
  assetLibraryItems: 30,
  quickReplies: 20,
  trackableLinks: 10,
  assetCombos: 5,
  scheduledSends: 0,
};
```

- [ ] 13.3 Run `bun run build` — expect GREEN (the `Record<MockEntityName, number>` now requires the 5 new keys, which are present).
- [ ] 13.4 Commit:
  ```
  git add src/mocks/config.ts
  git commit -m "feat(mocks): add PRD-027 entity volumes (assetLibrary/quickReplies/links/combos/scheduled)"
  ```

---

## TASK 14 — Mock generator `quickSend.ts` (DELTA PRD-004) — TDD

**Files:**
- Create: `src/mocks/generators/quickSend.ts`
- Test: `src/mocks/generators/__tests__/quickSend.test.ts`

> The repo keeps generator tests under `src/mocks/generators/__tests__/` (see `mediaAsset.test.ts`); follow that convention here.

**Steps:**

- [ ] 14.1 (RED) Create `src/mocks/generators/__tests__/quickSend.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createSeededContext } from "../utils";
import {
  generateAssetLibrary,
  generateQuickReplies,
  generateTrackableLinks,
  generateAssetCombos,
} from "../quickSend";

const NOW = new Date("2026-06-06T12:00:00.000Z");
const STORE = "store-matriz";
const OWNER = "seller-joao-gallo";
const SELLERS = ["seller-carlos-santos", "seller-rafael-lima"];

function buildAssets(seed: number) {
  return generateAssetLibrary(createSeededContext(seed), {
    count: 30,
    storeId: STORE,
    createdBy: OWNER,
    now: NOW,
  });
}

describe("generateAssetLibrary", () => {
  it("is deterministic for the same seed", () => {
    expect(buildAssets(42)).toEqual(buildAssets(42));
  });
  it("differs across seeds", () => {
    expect(buildAssets(42)).not.toEqual(buildAssets(7));
  });
  it("honors the requested count", () => {
    expect(buildAssets(42)).toHaveLength(30);
  });
  it("assigns unique ids and obfuscated storageRefs (never a real URL on files)", () => {
    const assets = buildAssets(42);
    expect(new Set(assets.map((a) => a.id)).size).toBe(assets.length);
    for (const a of assets) {
      if (a.kind !== "link") {
        expect(a.storageRef).toMatch(/^ref-/);
        expect(a.storageRef ?? "").not.toContain("http");
      }
    }
  });
  it("marks every tabela_preco as sensitive", () => {
    const tabelas = buildAssets(42).filter((a) => a.category === "tabela_preco");
    expect(tabelas.length).toBeGreaterThan(0);
    for (const t of tabelas) expect(t.sensitivity).toBe("sensitive");
  });
  it("covers all five brands", () => {
    const brands = new Set(buildAssets(42).map((a) => a.brand).filter(Boolean));
    for (const b of ["Volvo", "Scania", "Mercedes-Benz", "Ford Cargo", "Iveco"]) {
      expect(brands.has(b)).toBe(true);
    }
  });
  it("includes at least one of every category", () => {
    const cats = new Set(buildAssets(42).map((a) => a.category));
    for (const c of ["catalogo", "ficha_tecnica", "tabela_preco", "garantia", "video", "link"]) {
      expect(cats.has(c as never)).toBe(true);
    }
  });
  it("has only published or draft statuses with a published majority", () => {
    const assets = buildAssets(42);
    const published = assets.filter((a) => a.status === "published");
    expect(published.length).toBeGreaterThan(assets.length / 2);
  });
});

describe("generateQuickReplies", () => {
  function build(seed: number) {
    return generateQuickReplies(createSeededContext(seed), {
      count: 20,
      storeId: STORE,
      sellerIds: SELLERS,
      now: NOW,
    });
  }
  it("is deterministic for the same seed", () => {
    expect(build(42)).toEqual(build(42));
  });
  it("honors the requested count", () => {
    expect(build(42)).toHaveLength(20);
  });
  it("includes the four shared snippets (garantia/frete/prazo/faturamento)", () => {
    const shortcuts = build(42).filter((r) => r.scope === "shared").map((r) => r.shortcut);
    for (const sc of ["/garantia", "/frete", "/prazo", "/faturamento"]) {
      expect(shortcuts).toContain(sc);
    }
  });
  it("emits some bodies carrying {{...}} placeholders", () => {
    expect(build(42).some((r) => /\{\{[a-z]+\}\}/.test(r.body))).toBe(true);
  });
});

describe("generateTrackableLinks", () => {
  function build(seed: number) {
    const assets = buildAssets(seed).filter((a) => a.category === "link");
    return generateTrackableLinks(createSeededContext(seed), {
      count: 10,
      storeId: STORE,
      assets,
      conversationIds: ["conv-1", "conv-2", "conv-3"],
      leadIdByConversation: { "conv-1": "lead-1", "conv-2": undefined, "conv-3": "lead-3" },
      createdBy: OWNER,
      now: NOW,
    });
  }
  it("is deterministic for the same seed", () => {
    expect(build(42)).toEqual(build(42));
  });
  it("honors the requested count", () => {
    expect(build(42)).toHaveLength(10);
  });
  it("seeds simulated opens (some links already opened)", () => {
    expect(build(42).some((l) => l.opens > 0)).toBe(true);
  });
  it("produces glo.bz short refs", () => {
    for (const l of build(42)) expect(l.shortRef).toMatch(/^glo\.bz\//);
  });
});

describe("generateAssetCombos", () => {
  function build(seed: number) {
    return generateAssetCombos(createSeededContext(seed), {
      count: 5,
      storeId: STORE,
      assets: buildAssets(seed),
      ownerId: OWNER,
      now: NOW,
    });
  }
  it("is deterministic for the same seed", () => {
    expect(build(42)).toEqual(build(42));
  });
  it("honors the requested count and references real asset ids", () => {
    const combos = build(42);
    expect(combos).toHaveLength(5);
    const assetIds = new Set(buildAssets(42).map((a) => a.id));
    for (const c of combos) {
      expect(c.assetIds.length).toBeGreaterThan(0);
      for (const id of c.assetIds) expect(assetIds.has(id)).toBe(true);
    }
  });
});
```

- [ ] 14.2 Run `bun run vitest run src/mocks/generators/__tests__/quickSend.test.ts` — expect FAIL.
- [ ] 14.3 Commit RED:
  ```
  git add src/mocks/generators/__tests__/quickSend.test.ts
  git commit -m "test(mocks): RED quickSend generator (PRD-027 DELTA PRD-004)"
  ```
- [ ] 14.4 (GREEN) Create `src/mocks/generators/quickSend.ts`:

```ts
import type {
  AssetCategory,
  AssetKind,
  AssetStatus,
  ID,
  IAssetCombo,
  IAssetLibraryItem,
  IQuickReply,
  ITrackableLink,
} from "@/shared/types";
import { contentHash } from "@/features/media/engine/contentHash";
import { buildShortRef, buildUtm } from "@/features/quick-send/engine/trackableLink";
import { pickWeighted, type ISeededContext } from "./utils";

const DAY_MS = 24 * 60 * 60 * 1000;

const BRANDS = ["Volvo", "Scania", "Mercedes-Benz", "Ford Cargo", "Iveco"] as const;

/** Product lines per category — realistic per the heavy-diesel domain. */
const PRODUCT_LINES = ["Freios", "Motor", "Embreagem", "Suspensão", "Filtros", "Elétrica"];

/** Title fragments per category, used to build readable, varied asset titles. */
const CATEGORY_TITLES: Record<AssetCategory, string> = {
  catalogo: "Catálogo",
  ficha_tecnica: "Ficha Técnica",
  tabela_preco: "Tabela de Preços",
  garantia: "Termo de Garantia",
  video: "Vídeo Demonstrativo",
  link: "Link",
};

/** A representative kind for each category. */
const CATEGORY_KIND: Record<AssetCategory, AssetKind> = {
  catalogo: "document",
  ficha_tecnica: "document",
  tabela_preco: "document",
  garantia: "document",
  video: "video",
  link: "link",
};

const CATEGORIES: AssetCategory[] = [
  "catalogo",
  "ficha_tecnica",
  "tabela_preco",
  "garantia",
  "video",
  "link",
];

export interface IGenerateAssetLibraryInput {
  count: number;
  storeId: ID;
  createdBy: ID;
  now: Date;
}

/**
 * Deterministic asset library across the five heavy-diesel brands and all six
 * categories. The first `CATEGORIES.length` items guarantee at least one of
 * every category; the rest are weighted toward catalogs/fichas. tabela_preco is
 * always `sensitivity: "sensitive"` (D-12). Files carry an obfuscated
 * `storageRef` (`ref-<hash>`); links carry a real-ish `url`. Most assets are
 * `published`; a minority `draft` so the picker exercises both states.
 */
export function generateAssetLibrary(
  ctx: ISeededContext,
  input: IGenerateAssetLibraryInput,
): IAssetLibraryItem[] {
  const out: IAssetLibraryItem[] = [];
  const nowMs = input.now.getTime();

  for (let i = 0; i < input.count; i += 1) {
    // Guarantee one of every category for the first N items, then weight.
    const category: AssetCategory =
      i < CATEGORIES.length
        ? CATEGORIES[i]
        : pickWeighted<AssetCategory>(ctx, [
            { value: "catalogo", weight: 5 },
            { value: "ficha_tecnica", weight: 4 },
            { value: "garantia", weight: 2 },
            { value: "tabela_preco", weight: 2 },
            { value: "video", weight: 2 },
            { value: "link", weight: 3 },
          ]);

    const brand = ctx.pick(BRANDS);
    const productLine = ctx.pick(PRODUCT_LINES);
    const kind = CATEGORY_KIND[category];
    const title = `${CATEGORY_TITLES[category]} ${productLine} ${brand}`;

    const status: AssetStatus = ctx.bool(0.8) ? "published" : "draft";
    const sensitivity = category === "tabela_preco" ? "sensitive" : "normal";

    const ageDays = ctx.int(0, 200);
    const createdAt = new Date(nowMs - ageDays * DAY_MS).toISOString();
    const updatedAt = new Date(nowMs - ctx.int(0, ageDays) * DAY_MS).toISOString();

    const isLink = category === "link";
    const hash = contentHash(`${input.storeId}|${title}|${i}`);

    out.push({
      id: `asset-${String(i + 1).padStart(4, "0")}`,
      storeId: input.storeId,
      division: "parts",
      title,
      category,
      brand,
      productLine,
      kind,
      storageRef: isLink ? undefined : `ref-${hash}`,
      url: isLink ? `https://gallobasediesel.com.br/${category}/${hash}` : undefined,
      version: 1,
      status,
      sensitivity,
      createdBy: input.createdBy,
      createdAt,
      updatedAt,
    });
  }

  return out;
}

export interface IGenerateQuickRepliesInput {
  count: number;
  storeId: ID;
  sellerIds: ID[];
  now: Date;
}

/** Canonical shared snippets every seller sees (D-12 / RF-010). */
const SHARED_SNIPPETS: { shortcut: string; title: string; body: string }[] = [
  {
    shortcut: "/garantia",
    title: "Política de garantia",
    body: "Olá {{nome}}, a peça {{peca}} possui garantia de 6 meses contra defeitos de fabricação.",
  },
  {
    shortcut: "/frete",
    title: "Prazo de frete",
    body: "O frete para sua região sai hoje e chega em {{prazo}} dias úteis.",
  },
  {
    shortcut: "/prazo",
    title: "Prazo de entrega",
    body: "Confirmando: o prazo de entrega da {{peca}} é de {{prazo}} dias úteis.",
  },
  {
    shortcut: "/faturamento",
    title: "Dados de faturamento",
    body: "Para faturar, preciso confirmar a razão social e o CNPJ de {{nome}}.",
  },
];

const PRIVATE_SNIPPET_SEEDS: { shortcut: string; title: string; body: string }[] = [
  { shortcut: "/ola", title: "Saudação", body: "Bom dia, {{nome}}! Como posso ajudar hoje?" },
  { shortcut: "/pix", title: "Chave Pix", body: "Segue a chave Pix CNPJ para o pagamento." },
  { shortcut: "/obrigado", title: "Agradecimento", body: "Obrigado pela preferência, {{nome}}!" },
];

/**
 * Deterministic snippets. The four canonical `shared` snippets come first; the
 * rest are `private` per seller, cycling through realistic seeds. Determinism
 * holds for a given seed (RF-013).
 */
export function generateQuickReplies(
  ctx: ISeededContext,
  input: IGenerateQuickRepliesInput,
): IQuickReply[] {
  const out: IQuickReply[] = [];
  const nowMs = input.now.getTime();
  const owner = input.sellerIds[0] ?? "seller-joao-gallo";

  for (const s of SHARED_SNIPPETS) {
    const createdAt = new Date(nowMs - ctx.int(10, 200) * DAY_MS).toISOString();
    out.push({
      id: `qr-${String(out.length + 1).padStart(4, "0")}`,
      storeId: input.storeId,
      shortcut: s.shortcut,
      title: s.title,
      body: s.body,
      scope: "shared",
      ownerId: owner,
      createdAt,
      updatedAt: createdAt,
    });
  }

  let p = 0;
  while (out.length < input.count) {
    const seed = PRIVATE_SNIPPET_SEEDS[p % PRIVATE_SNIPPET_SEEDS.length];
    const sellerId =
      input.sellerIds.length > 0 ? input.sellerIds[p % input.sellerIds.length] : owner;
    const suffix = Math.floor(p / PRIVATE_SNIPPET_SEEDS.length);
    const createdAt = new Date(nowMs - ctx.int(1, 120) * DAY_MS).toISOString();
    out.push({
      id: `qr-${String(out.length + 1).padStart(4, "0")}`,
      storeId: input.storeId,
      shortcut: suffix > 0 ? `${seed.shortcut}${suffix}` : seed.shortcut,
      title: seed.title,
      body: seed.body,
      scope: "private",
      ownerId: sellerId,
      createdAt,
      updatedAt: createdAt,
    });
    p += 1;
  }

  return out;
}

export interface IGenerateTrackableLinksInput {
  count: number;
  storeId: ID;
  assets: IAssetLibraryItem[];
  conversationIds: ID[];
  leadIdByConversation: Record<ID, ID | undefined>;
  createdBy: ID;
  now: Date;
}

/**
 * Deterministic trackable links bound to `link`-category assets and real
 * conversations. ~60% already have simulated `opens` (and a `lastOpenedAt`) so
 * the temperature/feedback surfaces have data on first load (D-8).
 */
export function generateTrackableLinks(
  ctx: ISeededContext,
  input: IGenerateTrackableLinksInput,
): ITrackableLink[] {
  const out: ITrackableLink[] = [];
  if (input.conversationIds.length === 0) return out;
  const nowMs = input.now.getTime();

  for (let i = 0; i < input.count; i += 1) {
    const conversationId = input.conversationIds[i % input.conversationIds.length];
    const leadId = input.leadIdByConversation[conversationId];
    const asset = input.assets.length > 0 ? input.assets[i % input.assets.length] : undefined;
    const targetUrl =
      asset?.url ?? `https://gallobasediesel.com.br/catalogo/${contentHash(`link-${i}`)}`;

    const ageDays = ctx.int(0, 60);
    const createdAt = new Date(nowMs - ageDays * DAY_MS).toISOString();
    const opened = ctx.bool(0.6);
    const opens = opened ? ctx.int(1, 8) : 0;
    const lastOpenedAt = opened
      ? new Date(nowMs - ctx.int(0, ageDays) * DAY_MS).toISOString()
      : undefined;

    out.push({
      id: `tl-${String(i + 1).padStart(4, "0")}`,
      storeId: input.storeId,
      assetId: asset?.id,
      conversationId,
      leadId,
      targetUrl,
      shortRef: buildShortRef(`tl-${i}-${input.storeId}`),
      utm: buildUtm({ source: "whatsapp", medium: "chat", campaign: asset?.category ?? "catalogo" }),
      createdBy: input.createdBy,
      opens,
      lastOpenedAt,
      createdAt,
    });
  }

  return out;
}

export interface IGenerateAssetCombosInput {
  count: number;
  storeId: ID;
  assets: IAssetLibraryItem[];
  ownerId: ID;
  now: Date;
}

const COMBO_TITLES = [
  "Kit Apresentação Volvo",
  "Pacote Pós-Venda",
  "Combo Garantia + Ficha",
  "Onboarding Cliente Novo",
  "Campanha Freios",
];

/**
 * Deterministic saved combos, each referencing 2–4 real published assets in a
 * preserved order (D-10).
 */
export function generateAssetCombos(
  ctx: ISeededContext,
  input: IGenerateAssetCombosInput,
): IAssetCombo[] {
  const out: IAssetCombo[] = [];
  const nowMs = input.now.getTime();
  const pool = input.assets.filter((a) => a.status === "published");
  const usable = pool.length > 0 ? pool : input.assets;
  if (usable.length === 0) return out;

  for (let i = 0; i < input.count; i += 1) {
    const size = Math.min(ctx.int(2, 4), usable.length);
    const assetIds: ID[] = [];
    for (let j = 0; j < size; j += 1) {
      const candidate = usable[(i + j * 3) % usable.length].id;
      if (!assetIds.includes(candidate)) assetIds.push(candidate);
    }
    const createdAt = new Date(nowMs - ctx.int(1, 90) * DAY_MS).toISOString();
    out.push({
      id: `combo-${String(i + 1).padStart(4, "0")}`,
      storeId: input.storeId,
      title: COMBO_TITLES[i % COMBO_TITLES.length],
      assetIds,
      ownerId: input.ownerId,
      createdAt,
      updatedAt: createdAt,
    });
  }

  return out;
}
```

- [ ] 14.5 Run `bun run vitest run src/mocks/generators/__tests__/quickSend.test.ts` — expect PASS (all describe blocks).
- [ ] 14.6 Run `bun run build` — expect GREEN.
- [ ] 14.7 Commit GREEN:
  ```
  git add src/mocks/generators/quickSend.ts
  git commit -m "feat(mocks): quickSend generator — per-brand library, shared snippets, links, combos (DELTA PRD-004)"
  ```

---

## TASK 15 — Bootstrap wiring (DELTA PRD-004)

**Files:**
- Modify: `src/mocks/generators/bootstrap.ts`

**Steps:**

- [ ] 15.1 Add the type imports to the existing `@/shared/types` import block at the top of `bootstrap.ts` (insert alphabetically among the existing `I*` names):

```ts
  IAssetCombo,
  IAssetLibraryItem,
  IQuickReply,
  IScheduledSend,
  ITrackableLink,
```

- [ ] 15.2 Add the generator import after the `import { generateMediaAssets } from "./mediaAsset";` line:

```ts
import {
  generateAssetCombos,
  generateAssetLibrary,
  generateQuickReplies,
  generateTrackableLinks,
} from "./quickSend";
```

- [ ] 15.3 Add five fields to `interface IBootstrappedDataset`, immediately after the `mediaAssets: IMediaAsset[];` line:

```ts
  assetLibraryItems: IAssetLibraryItem[];
  quickReplies: IQuickReply[];
  trackableLinks: ITrackableLink[];
  assetCombos: IAssetCombo[];
  scheduledSends: IScheduledSend[];
```

- [ ] 15.4 In `bootstrap()`, immediately AFTER the `// 11.6. Media assets` block (after the `const mediaAssets = generateMediaAssets(...)` call ends), insert:

```ts
  // 11.7. Quick Send & Asset Library (PRD-027) — curated library + snippets +
  // trackable links + saved combos. Links are bound to existing conversations
  // (and their leads, when present) so temperature escalation has real targets.
  // Scheduled sends start EMPTY (created at runtime by the composer, D-11).
  const assetLibraryItems = generateAssetLibrary(ctx, {
    count: VOLUMES.assetLibraryItems,
    storeId: stores[0].id,
    createdBy: SEED_OWNER_ID,
    now,
  });
  const quickReplies = generateQuickReplies(ctx, {
    count: VOLUMES.quickReplies,
    storeId: stores[0].id,
    sellerIds: SEED_VENDEDOR_SELLER_IDS,
    now,
  });
  const leadIdByConversation: Record<string, string | undefined> = {};
  for (const conv of conversations) leadIdByConversation[conv.id] = conv.leadId;
  const trackableLinks = generateTrackableLinks(ctx, {
    count: VOLUMES.trackableLinks,
    storeId: stores[0].id,
    assets: assetLibraryItems.filter((a) => a.category === "link"),
    conversationIds: conversations.map((c) => c.id),
    leadIdByConversation,
    createdBy: SEED_OWNER_ID,
    now,
  });
  const assetCombos = generateAssetCombos(ctx, {
    count: VOLUMES.assetCombos,
    storeId: stores[0].id,
    assets: assetLibraryItems,
    ownerId: SEED_OWNER_ID,
    now,
  });
  const scheduledSends: IScheduledSend[] = [];
```

- [ ] 15.5 Add the five collections to the returned `dataset` object literal, immediately after the `mediaAssets,` line:

```ts
    assetLibraryItems,
    quickReplies,
    trackableLinks,
    assetCombos,
    scheduledSends,
```

- [ ] 15.6 Run `bun run build` — expect GREEN.
- [ ] 15.7 Commit:
  ```
  git add src/mocks/generators/bootstrap.ts
  git commit -m "feat(mocks): wire PRD-027 collections into bootstrap dataset"
  ```

---

## TASK 16 — Store mutations + selectors (DELTA PRD-004)

**Files:**
- Modify: `src/mocks/store/mutations.ts`
- Modify: `src/mocks/store/selectors.ts`

> The Zustand store spreads `...initialDataset` (see `mockStore.ts`), so the five new collections flow into state automatically once `bootstrap` returns them — no `mockStore.ts` edit is required beyond bootstrap (Task 15). Only the typed `CollectionKey`/`CollectionMap` and selectors need additions.

**Steps:**

- [ ] 16.1 In `src/mocks/store/mutations.ts`, add the type imports to the `@/shared/types` import block (insert among existing `I*` names):

```ts
  IAssetCombo,
  IAssetLibraryItem,
  IQuickReply,
  IScheduledSend,
  ITrackableLink,
```

- [ ] 16.2 Append to the `CollectionKey` union (replace `  | "mediaAssets";` with):

```ts
  | "mediaAssets"
  | "assetLibraryItems"
  | "quickReplies"
  | "trackableLinks"
  | "assetCombos"
  | "scheduledSends";
```

- [ ] 16.3 Append to the `CollectionMap` type (after `  mediaAssets: IMediaAsset;`):

```ts
  assetLibraryItems: IAssetLibraryItem;
  quickReplies: IQuickReply;
  trackableLinks: ITrackableLink;
  assetCombos: IAssetCombo;
  scheduledSends: IScheduledSend;
```

- [ ] 16.4 In `src/mocks/store/selectors.ts`, add the type imports to the `@/shared/types` import block (line 1):

```ts
import type {
  ID,
  IAssetCombo,
  IAssetLibraryItem,
  IMediaAsset,
  INotification,
  IQuickReply,
  IScheduledSend,
  ITrackableLink,
} from "@/shared/types";
```

(Replace the existing `import type { ID, IMediaAsset, INotification } from "@/shared/types";` line.)

- [ ] 16.5 Append the new selectors to the END of `src/mocks/store/selectors.ts`:

```ts

// --- Quick Send & Asset Library (PRD-027) ---

export function selectAllAssetLibraryItems(): IAssetLibraryItem[] {
  return getMockState().assetLibraryItems;
}

export function selectAssetLibraryItemById(id: ID): IAssetLibraryItem | null {
  return getMockState().assetLibraryItems.find((a) => a.id === id) ?? null;
}

export function selectAllQuickReplies(): IQuickReply[] {
  return getMockState().quickReplies;
}

export function selectQuickReplyById(id: ID): IQuickReply | null {
  return getMockState().quickReplies.find((q) => q.id === id) ?? null;
}

export function selectAllTrackableLinks(): ITrackableLink[] {
  return getMockState().trackableLinks;
}

export function selectTrackableLinkById(id: ID): ITrackableLink | null {
  return getMockState().trackableLinks.find((l) => l.id === id) ?? null;
}

export function selectTrackableLinksByConversation(conversationId: ID): ITrackableLink[] {
  return getMockState().trackableLinks.filter((l) => l.conversationId === conversationId);
}

export function selectAllAssetCombos(): IAssetCombo[] {
  return getMockState().assetCombos;
}

export function selectAllScheduledSends(): IScheduledSend[] {
  return getMockState().scheduledSends;
}

export function selectScheduledSendsByConversation(conversationId: ID): IScheduledSend[] {
  return getMockState().scheduledSends.filter((s) => s.conversationId === conversationId);
}
```

- [ ] 16.6 Run `bun run build` — expect GREEN.
- [ ] 16.7 Commit:
  ```
  git add src/mocks/store/mutations.ts src/mocks/store/selectors.ts
  git commit -m "feat(mocks): PRD-027 collection keys + selectors in mock store"
  ```

---

## TASK 17 — Mock API files (DELTA PRD-004)

**Files:**
- Create: `src/mocks/api/assetLibrary.ts`
- Create: `src/mocks/api/quickReply.ts`
- Create: `src/mocks/api/trackableLink.ts`
- Create: `src/mocks/api/scheduledSend.ts`
- Modify: `src/mocks/api/index.ts`

> Recents/favorites/usage are tracked in module-level maps inside `assetLibrary.ts` (Fase 1 simulation; Fase 2 moves these to dedicated tables). They are NOT in the bootstrapped store because they are seller-relative runtime state.

**Steps:**

- [ ] 17.1 Create `src/mocks/api/assetLibrary.ts`:

```ts
import type {
  ID,
  IAssetCombo,
  IAssetLibraryItem,
  IAssetLibraryListParams,
} from "@/shared/types";
import {
  selectAllAssetCombos,
  selectAllAssetLibraryItems,
  selectAssetLibraryItemById,
} from "../store/selectors";
import { patchById, removeById, upsert } from "../store/mutations";
import { filterAssets } from "@/features/quick-send/engine/assetFiltering";
import { bumpVersion as bumpVersionEngine } from "@/features/quick-send/engine/assetVersioning";
import {
  MockNotFoundError,
  paginate,
  runApi,
  type IPaginatedResult,
  type IPaginationParams,
} from "./utils";

export type IListAssetLibraryApiParams = IAssetLibraryListParams &
  IPaginationParams & { storeId?: ID };

/** Per-seller recents (most-recent-first asset ids) — Fase 1 runtime state. */
const recentsBySeller = new Map<ID, ID[]>();
/** Per-seller favorite asset ids. */
const favoritesBySeller = new Map<ID, Set<ID>>();
/** Usage counters: assetId → count, and `${sellerId}|${assetId}` → count. */
const usageByAsset = new Map<ID, number>();
const usageBySellerAsset = new Map<string, number>();

function matches(item: IAssetLibraryItem, params: IListAssetLibraryApiParams): boolean {
  if (params.storeId && item.storeId !== params.storeId) return false;
  if (params.status && item.status !== params.status) return false;
  // category/brand/productLine/search handled by the shared engine.
  const filtered = filterAssets([item], {
    category: params.category,
    brand: params.brand,
    productLine: params.productLine,
    query: params.search,
  });
  return filtered.length > 0;
}

export const assetLibraryApi = {
  list(params: IListAssetLibraryApiParams = {}): Promise<IPaginatedResult<IAssetLibraryItem>> {
    return runApi(
      "assetLibraryApi",
      "list",
      () => {
        const all = selectAllAssetLibraryItems().filter((a) => matches(a, params));
        const sorted = [...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return paginate(sorted, params);
      },
      { payload: params },
    );
  },

  get(id: ID): Promise<IAssetLibraryItem | null> {
    return runApi("assetLibraryApi", "get", () => selectAssetLibraryItemById(id), {
      payload: { id },
    });
  },

  search(query: string): Promise<IAssetLibraryItem[]> {
    return runApi(
      "assetLibraryApi",
      "search",
      () => filterAssets(selectAllAssetLibraryItems(), { query }),
      { payload: { query } },
    );
  },

  getRecent(sellerId: ID): Promise<IAssetLibraryItem[]> {
    return runApi(
      "assetLibraryApi",
      "getRecent",
      () => {
        const ids = recentsBySeller.get(sellerId) ?? [];
        return ids
          .map((id) => selectAssetLibraryItemById(id))
          .filter((a): a is IAssetLibraryItem => a !== null);
      },
      { payload: { sellerId } },
    );
  },

  getFavorites(sellerId: ID): Promise<IAssetLibraryItem[]> {
    return runApi(
      "assetLibraryApi",
      "getFavorites",
      () => {
        const set = favoritesBySeller.get(sellerId) ?? new Set<ID>();
        return [...set]
          .map((id) => selectAssetLibraryItemById(id))
          .filter((a): a is IAssetLibraryItem => a !== null);
      },
      { payload: { sellerId } },
    );
  },

  toggleFavorite(sellerId: ID, id: ID): Promise<boolean> {
    return runApi(
      "assetLibraryApi",
      "toggleFavorite",
      () => {
        const set = favoritesBySeller.get(sellerId) ?? new Set<ID>();
        let now: boolean;
        if (set.has(id)) {
          set.delete(id);
          now = false;
        } else {
          set.add(id);
          now = true;
        }
        favoritesBySeller.set(sellerId, set);
        return now;
      },
      { payload: { sellerId, id } },
    );
  },

  create(input: Omit<IAssetLibraryItem, "id" | "createdAt" | "updatedAt">): Promise<IAssetLibraryItem> {
    return runApi(
      "assetLibraryApi",
      "create",
      () => {
        const nowIso = new Date().toISOString();
        const item: IAssetLibraryItem = {
          ...input,
          id: `asset-${crypto.randomUUID()}`,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        upsert("assetLibraryItems", item);
        return item;
      },
      { payload: input },
    );
  },

  update(id: ID, patch: Partial<IAssetLibraryItem>): Promise<IAssetLibraryItem> {
    return runApi(
      "assetLibraryApi",
      "update",
      () => {
        const updated = patchById("assetLibraryItems", id, {
          ...patch,
          updatedAt: new Date().toISOString(),
        });
        if (!updated) throw new MockNotFoundError("assetLibraryItem", id);
        return updated;
      },
      { payload: { id, patch } },
    );
  },

  publish(id: ID): Promise<IAssetLibraryItem> {
    return runApi(
      "assetLibraryApi",
      "publish",
      () => {
        const updated = patchById("assetLibraryItems", id, {
          status: "published",
          updatedAt: new Date().toISOString(),
        });
        if (!updated) throw new MockNotFoundError("assetLibraryItem", id);
        return updated;
      },
      { payload: { id } },
    );
  },

  unpublish(id: ID): Promise<IAssetLibraryItem> {
    return runApi(
      "assetLibraryApi",
      "unpublish",
      () => {
        const updated = patchById("assetLibraryItems", id, {
          status: "draft",
          updatedAt: new Date().toISOString(),
        });
        if (!updated) throw new MockNotFoundError("assetLibraryItem", id);
        return updated;
      },
      { payload: { id } },
    );
  },

  bumpVersion(
    id: ID,
    patch: Pick<IAssetLibraryItem, "storageRef" | "url">,
  ): Promise<IAssetLibraryItem> {
    return runApi(
      "assetLibraryApi",
      "bumpVersion",
      () => {
        const current = selectAssetLibraryItemById(id);
        if (!current) throw new MockNotFoundError("assetLibraryItem", id);
        const next = bumpVersionEngine(current, patch);
        const updated = patchById("assetLibraryItems", id, {
          version: next.version,
          storageRef: next.storageRef,
          url: next.url,
          previousVersion: next.previousVersion,
          updatedAt: new Date().toISOString(),
        });
        if (!updated) throw new MockNotFoundError("assetLibraryItem", id);
        return updated;
      },
      { payload: { id, patch } },
    );
  },

  delete(id: ID): Promise<IAssetLibraryItem> {
    return runApi(
      "assetLibraryApi",
      "delete",
      () => {
        const before = selectAssetLibraryItemById(id);
        if (!before) throw new MockNotFoundError("assetLibraryItem", id);
        removeById("assetLibraryItems", id);
        return before;
      },
      { payload: { id } },
    );
  },

  listCombos(storeId?: ID): Promise<IAssetCombo[]> {
    return runApi(
      "assetLibraryApi",
      "listCombos",
      () => {
        const all = selectAllAssetCombos();
        return storeId ? all.filter((c) => c.storeId === storeId) : all;
      },
      { payload: { storeId } },
    );
  },

  saveCombo(input: Omit<IAssetCombo, "id" | "createdAt" | "updatedAt">): Promise<IAssetCombo> {
    return runApi(
      "assetLibraryApi",
      "saveCombo",
      () => {
        const nowIso = new Date().toISOString();
        const combo: IAssetCombo = {
          ...input,
          id: `combo-${crypto.randomUUID()}`,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        upsert("assetCombos", combo);
        return combo;
      },
      { payload: input },
    );
  },

  deleteCombo(id: ID): Promise<IAssetCombo> {
    return runApi(
      "assetLibraryApi",
      "deleteCombo",
      () => {
        const before = selectAllAssetCombos().find((c) => c.id === id) ?? null;
        if (!before) throw new MockNotFoundError("assetCombo", id);
        removeById("assetCombos", id);
        return before;
      },
      { payload: { id } },
    );
  },

  recordSend(sellerId: ID, assetId: ID): Promise<void> {
    return runApi(
      "assetLibraryApi",
      "recordSend",
      () => {
        // Recents: move-to-front, cap at 12.
        const recents = recentsBySeller.get(sellerId) ?? [];
        const next = [assetId, ...recents.filter((id) => id !== assetId)].slice(0, 12);
        recentsBySeller.set(sellerId, next);
        // Usage counters.
        usageByAsset.set(assetId, (usageByAsset.get(assetId) ?? 0) + 1);
        const key = `${sellerId}|${assetId}`;
        usageBySellerAsset.set(key, (usageBySellerAsset.get(key) ?? 0) + 1);
      },
      { payload: { sellerId, assetId } },
    );
  },

  /** Aggregate usage stats for the management dashboard (D-13). */
  getUsageStats(): Promise<{
    topAssets: { assetId: ID; title: string; count: number }[];
    bySeller: { sellerId: ID; count: number }[];
  }> {
    return runApi(
      "assetLibraryApi",
      "getUsageStats",
      () => {
        const topAssets = [...usageByAsset.entries()]
          .map(([assetId, count]) => ({
            assetId,
            title: selectAssetLibraryItemById(assetId)?.title ?? assetId,
            count,
          }))
          .sort((a, b) => b.count - a.count);
        const perSeller = new Map<ID, number>();
        for (const [key, count] of usageBySellerAsset.entries()) {
          const sellerId = key.split("|")[0];
          perSeller.set(sellerId, (perSeller.get(sellerId) ?? 0) + count);
        }
        const bySeller = [...perSeller.entries()]
          .map(([sellerId, count]) => ({ sellerId, count }))
          .sort((a, b) => b.count - a.count);
        return { topAssets, bySeller };
      },
      {},
    );
  },
};
```

- [ ] 17.2 Create `src/mocks/api/quickReply.ts`:

```ts
import type { ID, IQuickReply } from "@/shared/types";
import {
  selectAllQuickReplies,
  selectQuickReplyById,
} from "../store/selectors";
import { patchById, removeById, upsert } from "../store/mutations";
import { MockNotFoundError, runApi } from "./utils";

export const quickReplyApi = {
  list(params: {
    storeId?: ID;
    sellerId?: ID;
    scope?: "private" | "shared";
  } = {}): Promise<IQuickReply[]> {
    return runApi(
      "quickReplyApi",
      "list",
      () => {
        return selectAllQuickReplies().filter((q) => {
          if (params.storeId && q.storeId !== params.storeId) return false;
          if (params.scope && q.scope !== params.scope) return false;
          // A seller sees all `shared` + their own `private` snippets.
          if (params.sellerId) {
            if (q.scope === "shared") return true;
            return q.ownerId === params.sellerId;
          }
          return true;
        });
      },
      { payload: params },
    );
  },

  get(id: ID): Promise<IQuickReply | null> {
    return runApi("quickReplyApi", "get", () => selectQuickReplyById(id), { payload: { id } });
  },

  findByShortcut(shortcut: string, sellerId: ID): Promise<IQuickReply | null> {
    return runApi(
      "quickReplyApi",
      "findByShortcut",
      () => {
        const candidates = selectAllQuickReplies().filter((q) => q.shortcut === shortcut);
        // Prefer the seller's own private snippet, then any shared one.
        const own = candidates.find((q) => q.scope === "private" && q.ownerId === sellerId);
        if (own) return own;
        return candidates.find((q) => q.scope === "shared") ?? null;
      },
      { payload: { shortcut, sellerId } },
    );
  },

  create(input: Omit<IQuickReply, "id" | "createdAt" | "updatedAt">): Promise<IQuickReply> {
    return runApi(
      "quickReplyApi",
      "create",
      () => {
        const nowIso = new Date().toISOString();
        const reply: IQuickReply = {
          ...input,
          id: `qr-${crypto.randomUUID()}`,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        upsert("quickReplies", reply);
        return reply;
      },
      { payload: input },
    );
  },

  update(id: ID, patch: Partial<IQuickReply>): Promise<IQuickReply> {
    return runApi(
      "quickReplyApi",
      "update",
      () => {
        const updated = patchById("quickReplies", id, {
          ...patch,
          updatedAt: new Date().toISOString(),
        });
        if (!updated) throw new MockNotFoundError("quickReply", id);
        return updated;
      },
      { payload: { id, patch } },
    );
  },

  delete(id: ID): Promise<IQuickReply> {
    return runApi(
      "quickReplyApi",
      "delete",
      () => {
        const before = selectQuickReplyById(id);
        if (!before) throw new MockNotFoundError("quickReply", id);
        removeById("quickReplies", id);
        return before;
      },
      { payload: { id } },
    );
  },
};
```

- [ ] 17.3 Create `src/mocks/api/trackableLink.ts`:

```ts
import type { ID, ITrackableLink } from "@/shared/types";
import {
  selectTrackableLinkById,
  selectTrackableLinksByConversation,
} from "../store/selectors";
import { patchById, upsert } from "../store/mutations";
import { buildShortRef, buildUtm } from "@/features/quick-send/engine/trackableLink";
import { MockNotFoundError, runApi } from "./utils";

export const trackableLinkApi = {
  create(
    input: Omit<ITrackableLink, "id" | "createdAt" | "opens">,
  ): Promise<ITrackableLink> {
    return runApi(
      "trackableLinkApi",
      "create",
      () => {
        const id = `tl-${crypto.randomUUID()}`;
        const link: ITrackableLink = {
          ...input,
          id,
          shortRef: input.shortRef || buildShortRef(id),
          utm: input.utm ?? buildUtm({ source: "whatsapp", medium: "chat", campaign: "manual" }),
          opens: 0,
          createdAt: new Date().toISOString(),
        };
        upsert("trackableLinks", link);
        return link;
      },
      { payload: input },
    );
  },

  get(id: ID): Promise<ITrackableLink | null> {
    return runApi("trackableLinkApi", "get", () => selectTrackableLinkById(id), {
      payload: { id },
    });
  },

  listByConversation(conversationId: ID): Promise<ITrackableLink[]> {
    return runApi(
      "trackableLinkApi",
      "listByConversation",
      () => selectTrackableLinksByConversation(conversationId),
      { payload: { conversationId } },
    );
  },

  registerOpen(id: ID): Promise<ITrackableLink> {
    return runApi(
      "trackableLinkApi",
      "registerOpen",
      () => {
        const current = selectTrackableLinkById(id);
        if (!current) throw new MockNotFoundError("trackableLink", id);
        const updated = patchById("trackableLinks", id, {
          opens: current.opens + 1,
          lastOpenedAt: new Date().toISOString(),
        });
        if (!updated) throw new MockNotFoundError("trackableLink", id);
        return updated;
      },
      { payload: { id } },
    );
  },
};
```

- [ ] 17.4 Create `src/mocks/api/scheduledSend.ts`:

```ts
import type { ID, ISO8601, IScheduledSend } from "@/shared/types";
import {
  selectAllScheduledSends,
  selectScheduledSendsByConversation,
} from "../store/selectors";
import { patchById, upsert } from "../store/mutations";
import { isDue } from "@/features/quick-send/engine/scheduledSend";
import { MockNotFoundError, runApi } from "./utils";

function getById(id: ID): IScheduledSend | null {
  return selectAllScheduledSends().find((s) => s.id === id) ?? null;
}

export const scheduledSendApi = {
  list(conversationId: ID): Promise<IScheduledSend[]> {
    return runApi(
      "scheduledSendApi",
      "list",
      () => selectScheduledSendsByConversation(conversationId),
      { payload: { conversationId } },
    );
  },

  listDue(now: ISO8601): Promise<IScheduledSend[]> {
    return runApi(
      "scheduledSendApi",
      "listDue",
      () =>
        selectAllScheduledSends().filter(
          (s) => s.status === "pending" && isDue(s.scheduledFor, now),
        ),
      { payload: { now } },
    );
  },

  create(input: Omit<IScheduledSend, "id" | "status" | "createdAt">): Promise<IScheduledSend> {
    return runApi(
      "scheduledSendApi",
      "create",
      () => {
        const send: IScheduledSend = {
          ...input,
          id: `sched-${crypto.randomUUID()}`,
          status: "pending",
          createdAt: new Date().toISOString(),
        };
        upsert("scheduledSends", send);
        return send;
      },
      { payload: input },
    );
  },

  update(id: ID, patch: Partial<IScheduledSend>): Promise<IScheduledSend> {
    return runApi(
      "scheduledSendApi",
      "update",
      () => {
        const updated = patchById("scheduledSends", id, patch);
        if (!updated) throw new MockNotFoundError("scheduledSend", id);
        return updated;
      },
      { payload: { id, patch } },
    );
  },

  cancel(id: ID): Promise<IScheduledSend> {
    return runApi(
      "scheduledSendApi",
      "cancel",
      () => {
        const updated = patchById("scheduledSends", id, { status: "cancelled" });
        if (!updated) throw new MockNotFoundError("scheduledSend", id);
        return updated;
      },
      { payload: { id } },
    );
  },

  markSent(id: ID): Promise<IScheduledSend> {
    return runApi(
      "scheduledSendApi",
      "markSent",
      () => {
        const updated = patchById("scheduledSends", id, { status: "sent" });
        if (!updated) throw new MockNotFoundError("scheduledSend", id);
        return updated;
      },
      { payload: { id } },
    );
  },

  markFailed(id: ID, reason: string): Promise<IScheduledSend> {
    return runApi(
      "scheduledSendApi",
      "markFailed",
      () => {
        const updated = patchById("scheduledSends", id, {
          status: "failed",
          failureReason: reason,
        });
        if (!updated) throw new MockNotFoundError("scheduledSend", id);
        return updated;
      },
      { payload: { id, reason } },
    );
  },

  /** Test/maintenance aid — not part of the provider contract. */
  _getById: getById,
};
```

- [ ] 17.5 In `src/mocks/api/index.ts`, append after the `export { mediaApi, type IListMediaApiParams } from "./media";` line:

```ts
export { assetLibraryApi, type IListAssetLibraryApiParams } from "./assetLibrary";
export { quickReplyApi } from "./quickReply";
export { trackableLinkApi } from "./trackableLink";
export { scheduledSendApi } from "./scheduledSend";
```

- [ ] 17.6 Run `bun run build` — expect GREEN.
- [ ] 17.7 Commit:
  ```
  git add src/mocks/api/assetLibrary.ts src/mocks/api/quickReply.ts src/mocks/api/trackableLink.ts src/mocks/api/scheduledSend.ts src/mocks/api/index.ts
  git commit -m "feat(mocks): PRD-027 mock api (assetLibrary/quickReply/trackableLink/scheduledSend)"
  ```

---

## TASK 18 — Provider contracts (4 files) + contracts barrel

**Files:**
- Create: `src/providers/data/contracts/assetLibrary.ts`
- Create: `src/providers/data/contracts/quickReply.ts`
- Create: `src/providers/data/contracts/trackableLink.ts`
- Create: `src/providers/data/contracts/scheduledSend.ts`
- Modify: `src/providers/data/contracts/index.ts`

**Steps:**

- [ ] 18.1 Create `src/providers/data/contracts/assetLibrary.ts`:

```ts
/**
 * Data-layer entry point for the asset library provider (PRD-027 D-15). The
 * interface lives in `@/shared/types/quickSend`; this file re-exports it so the
 * contracts barrel and factory can register the `assetLibrary` slice.
 */
export type { IAssetLibraryProvider, IAssetLibraryListParams } from "@/shared/types";
```

- [ ] 18.2 Create `src/providers/data/contracts/quickReply.ts`:

```ts
/** Data-layer entry point for the quick reply provider (PRD-027 D-15). */
export type { IQuickReplyProvider } from "@/shared/types";
```

- [ ] 18.3 Create `src/providers/data/contracts/trackableLink.ts`:

```ts
/** Data-layer entry point for the trackable link provider (PRD-027 D-15). */
export type { ITrackableLinkProvider } from "@/shared/types";
```

- [ ] 18.4 Create `src/providers/data/contracts/scheduledSend.ts`:

```ts
/** Data-layer entry point for the scheduled send provider (PRD-027 D-15). */
export type { IScheduledSendProvider } from "@/shared/types";
```

- [ ] 18.5 In `src/providers/data/contracts/index.ts`, add four type-only imports immediately after the `import type { IMediaStorageProvider } from "./mediaStorage";` line:

```ts
import type { IAssetLibraryProvider } from "./assetLibrary";
import type { IQuickReplyProvider } from "./quickReply";
import type { ITrackableLinkProvider } from "./trackableLink";
import type { IScheduledSendProvider } from "./scheduledSend";
```

- [ ] 18.6 In the same file, add re-exports immediately after the `export type { IMediaStorageProvider, IMediaUploadInput, IListMediaParams } from "./mediaStorage";` line:

```ts
export type { IAssetLibraryProvider, IAssetLibraryListParams } from "./assetLibrary";
export type { IQuickReplyProvider } from "./quickReply";
export type { ITrackableLinkProvider } from "./trackableLink";
export type { IScheduledSendProvider } from "./scheduledSend";
```

- [ ] 18.7 In the same file, add four keys to `interface IDataProviders`, immediately after the `media: IMediaStorageProvider;` line:

```ts
  assetLibrary: IAssetLibraryProvider;
  quickReply: IQuickReplyProvider;
  trackableLink: ITrackableLinkProvider;
  scheduledSend: IScheduledSendProvider;
```

- [ ] 18.8 Run `bun run build` — expect FAIL (the `IDataProviders` interface now has 4 keys the factory does not yet provide). This is EXPECTED — the next task wires the factory. Do NOT commit yet; proceed to Task 19, then commit both together at 19.x.

> If preferred, commit Task 18 and Task 19 atomically (the build is only green AFTER Task 19). The checklist below commits them together.

---

## TASK 19 — Mock impls (4) + supabase stubs (4) + factory wiring

**Files:**
- Create: `src/providers/data/impl/mock/assetLibrary.ts`
- Create: `src/providers/data/impl/mock/quickReply.ts`
- Create: `src/providers/data/impl/mock/trackableLink.ts`
- Create: `src/providers/data/impl/mock/scheduledSend.ts`
- Create: `src/providers/data/impl/supabase/assetLibrary.ts`
- Create: `src/providers/data/impl/supabase/quickReply.ts`
- Create: `src/providers/data/impl/supabase/trackableLink.ts`
- Create: `src/providers/data/impl/supabase/scheduledSend.ts`
- Modify: `src/providers/data/factory.ts`

**Steps:**

- [ ] 19.1 Create `src/providers/data/impl/mock/assetLibrary.ts`:

```ts
import type { ID, IAssetLibraryItem, IAssetLibraryListParams } from "@/shared/types";
import { assetLibraryApi } from "@/mocks";
import { getCurrentContext } from "@/features/multistore/utils/getCurrentContext";
import {
  isSensitiveAsset,
  canSendSensitiveAsset,
} from "@/features/quick-send/engine/assetSensitivity";
import type { IAssetLibraryProvider } from "../../contracts/assetLibrary";
import { logMockMutation } from "./_audit";
import { scopedListParams, withCreateStoreId } from "./_storeScope";

export const mockAssetLibraryProvider: IAssetLibraryProvider = {
  list: (filter: IAssetLibraryListParams) =>
    assetLibraryApi.list(scopedListParams(filter as Record<string, unknown>, "asset_library")),

  get: (id) => assetLibraryApi.get(id),

  search: (query) => assetLibraryApi.search(query),

  getRecent: (sellerId) => assetLibraryApi.getRecent(sellerId),

  getFavorites: (sellerId) => assetLibraryApi.getFavorites(sellerId),

  toggleFavorite: (sellerId, id) => assetLibraryApi.toggleFavorite(sellerId, id),

  create: async (input) => {
    const scoped = withCreateStoreId(input as typeof input & { storeId?: ID });
    const created = await assetLibraryApi.create(scoped);
    logMockMutation({
      action: "create",
      resource: "asset_library",
      resourceId: created.id,
      after: created,
      storeId: created.storeId,
    });
    return created;
  },

  update: async (id, patch) => {
    const before = await assetLibraryApi.get(id).catch(() => null);
    const updated = await assetLibraryApi.update(id, patch);
    logMockMutation({
      action: "update",
      resource: "asset_library",
      resourceId: id,
      before,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },

  publish: async (id) => {
    const updated = await assetLibraryApi.publish(id);
    logMockMutation({
      action: "publish",
      resource: "asset_library",
      resourceId: id,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },

  unpublish: async (id) => {
    const updated = await assetLibraryApi.unpublish(id);
    logMockMutation({
      action: "unpublish",
      resource: "asset_library",
      resourceId: id,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },

  bumpVersion: async (id, patch) => {
    const updated = await assetLibraryApi.bumpVersion(id, patch);
    logMockMutation({
      action: "bump_version",
      resource: "asset_library",
      resourceId: id,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },

  delete: async (id) => {
    const removed = await assetLibraryApi.delete(id);
    logMockMutation({
      action: "delete",
      resource: "asset_library",
      resourceId: id,
      before: removed,
      storeId: removed.storeId,
    });
    return removed;
  },

  listCombos: (storeId) => assetLibraryApi.listCombos(storeId),

  saveCombo: async (input) => {
    const scoped = withCreateStoreId(input as typeof input & { storeId?: ID });
    const created = await assetLibraryApi.saveCombo(scoped);
    logMockMutation({
      action: "create",
      resource: "asset_library",
      resourceId: created.id,
      after: created,
      storeId: created.storeId,
    });
    return created;
  },

  deleteCombo: async (id) => {
    const removed = await assetLibraryApi.deleteCombo(id);
    logMockMutation({
      action: "delete",
      resource: "asset_library",
      resourceId: id,
      before: removed,
      storeId: removed.storeId,
    });
    return removed;
  },

  recordSend: async (sellerId, assetId) => {
    // Gate sensitive sends (D-12): a viewer without permission is audited and
    // the send is NOT recorded. The picker also blocks this in the UI, but the
    // provider is the source of truth.
    const asset = await assetLibraryApi.get(assetId).catch(() => null);
    if (asset && isSensitiveAsset(asset) && !canSendSensitiveAsset(getCurrentContext().user)) {
      logMockMutation({
        action: "view_denied",
        resource: "asset_library",
        resourceId: assetId,
        after: { reason: "sensitive_no_permission" },
        storeId: asset.storeId,
      });
      return;
    }
    await assetLibraryApi.recordSend(sellerId, assetId);
  },

  // Bridges the mock usage ledger to the feature hook. The provider is the only
  // layer authorized to import `@/mocks` (ESLint boundary), so `getUsageStats`
  // lives here and `useAssetUsageStats` calls it through `useAssetLibraryProvider`.
  getUsageStats: () => assetLibraryApi.getUsageStats(),
};
```

- [ ] 19.2 Create `src/providers/data/impl/mock/quickReply.ts`:

```ts
import type { ID, IQuickReply } from "@/shared/types";
import { quickReplyApi } from "@/mocks";
import type { IQuickReplyProvider } from "../../contracts/quickReply";
import { logMockMutation } from "./_audit";
import { withCreateStoreId } from "./_storeScope";

export const mockQuickReplyProvider: IQuickReplyProvider = {
  list: (params) => quickReplyApi.list(params),

  get: (id) => quickReplyApi.get(id),

  findByShortcut: (shortcut, sellerId) => quickReplyApi.findByShortcut(shortcut, sellerId),

  create: async (input) => {
    const scoped = withCreateStoreId(input as typeof input & { storeId?: ID });
    const created = await quickReplyApi.create(scoped);
    // Creating/editing a `shared` snippet is governed (D-12).
    if (created.scope === "shared") {
      logMockMutation({
        action: "create",
        resource: "quick_reply",
        resourceId: created.id,
        after: created,
        storeId: created.storeId,
      });
    }
    return created;
  },

  update: async (id, patch) => {
    const before = await quickReplyApi.get(id).catch(() => null);
    const updated = await quickReplyApi.update(id, patch);
    if (updated.scope === "shared" || before?.scope === "shared") {
      logMockMutation({
        action: "update",
        resource: "quick_reply",
        resourceId: id,
        before,
        after: updated,
        storeId: updated.storeId,
      });
    }
    return updated;
  },

  delete: async (id) => {
    const removed = await quickReplyApi.delete(id);
    if (removed.scope === "shared") {
      logMockMutation({
        action: "delete",
        resource: "quick_reply",
        resourceId: id,
        before: removed,
        storeId: removed.storeId,
      });
    }
    return removed;
  },
};
```

- [ ] 19.3 Create `src/providers/data/impl/mock/trackableLink.ts`:

```ts
import type { ID, ITrackableLink } from "@/shared/types";
import { trackableLinkApi } from "@/mocks";
import type { ITrackableLinkProvider } from "../../contracts/trackableLink";
import { logMockMutation } from "./_audit";
import { withCreateStoreId } from "./_storeScope";

export const mockTrackableLinkProvider: ITrackableLinkProvider = {
  create: async (input) => {
    const scoped = withCreateStoreId(input as typeof input & { storeId?: ID });
    const created = await trackableLinkApi.create(scoped);
    logMockMutation({
      action: "create",
      resource: "trackable_link",
      resourceId: created.id,
      after: created,
      storeId: created.storeId,
    });
    return created;
  },

  get: (id) => trackableLinkApi.get(id),

  listByConversation: (conversationId) => trackableLinkApi.listByConversation(conversationId),

  registerOpen: (id) => trackableLinkApi.registerOpen(id),
};
```

- [ ] 19.4 Create `src/providers/data/impl/mock/scheduledSend.ts`:

```ts
import type { ID, IScheduledSend } from "@/shared/types";
import { scheduledSendApi } from "@/mocks";
import type { IScheduledSendProvider } from "../../contracts/scheduledSend";
import { logMockMutation } from "./_audit";
import { withCreateStoreId } from "./_storeScope";

export const mockScheduledSendProvider: IScheduledSendProvider = {
  list: (conversationId) => scheduledSendApi.list(conversationId),

  listDue: (now) => scheduledSendApi.listDue(now),

  create: async (input) => {
    const scoped = withCreateStoreId(input as typeof input & { storeId?: ID });
    const created = await scheduledSendApi.create(scoped);
    logMockMutation({
      action: "create",
      resource: "scheduled_send",
      resourceId: created.id,
      after: created,
      storeId: created.storeId,
    });
    return created;
  },

  update: (id, patch) => scheduledSendApi.update(id, patch),

  cancel: async (id) => {
    const updated = await scheduledSendApi.cancel(id);
    logMockMutation({
      action: "cancel",
      resource: "scheduled_send",
      resourceId: id,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },

  markSent: (id) => scheduledSendApi.markSent(id),

  markFailed: (id, reason) => scheduledSendApi.markFailed(id, reason),
};
```

- [ ] 19.5 Create `src/providers/data/impl/supabase/assetLibrary.ts`:

```ts
import { NotImplementedError } from "../../errors";
import type { IAssetLibraryProvider } from "../../contracts/assetLibrary";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseAssetLibraryProvider.${method} — implementar na Fase 2 (PRD-027 RNF-007).`,
  );
};

export const supabaseAssetLibraryProvider: IAssetLibraryProvider = {
  list: stub("list"),
  get: stub("get"),
  search: stub("search"),
  getRecent: stub("getRecent"),
  getFavorites: stub("getFavorites"),
  toggleFavorite: stub("toggleFavorite"),
  create: stub("create"),
  update: stub("update"),
  publish: stub("publish"),
  unpublish: stub("unpublish"),
  bumpVersion: stub("bumpVersion"),
  delete: stub("delete"),
  listCombos: stub("listCombos"),
  saveCombo: stub("saveCombo"),
  deleteCombo: stub("deleteCombo"),
  recordSend: stub("recordSend"),
  getUsageStats: stub("getUsageStats"),
};
```

- [ ] 19.6 Create `src/providers/data/impl/supabase/quickReply.ts`:

```ts
import { NotImplementedError } from "../../errors";
import type { IQuickReplyProvider } from "../../contracts/quickReply";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseQuickReplyProvider.${method} — implementar na Fase 2 (PRD-027 RNF-007).`,
  );
};

export const supabaseQuickReplyProvider: IQuickReplyProvider = {
  list: stub("list"),
  get: stub("get"),
  findByShortcut: stub("findByShortcut"),
  create: stub("create"),
  update: stub("update"),
  delete: stub("delete"),
};
```

- [ ] 19.7 Create `src/providers/data/impl/supabase/trackableLink.ts`:

```ts
import { NotImplementedError } from "../../errors";
import type { ITrackableLinkProvider } from "../../contracts/trackableLink";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseTrackableLinkProvider.${method} — implementar na Fase 2 (PRD-027 RNF-007).`,
  );
};

export const supabaseTrackableLinkProvider: ITrackableLinkProvider = {
  create: stub("create"),
  get: stub("get"),
  listByConversation: stub("listByConversation"),
  registerOpen: stub("registerOpen"),
};
```

- [ ] 19.8 Create `src/providers/data/impl/supabase/scheduledSend.ts`:

```ts
import { NotImplementedError } from "../../errors";
import type { IScheduledSendProvider } from "../../contracts/scheduledSend";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseScheduledSendProvider.${method} — implementar na Fase 2 (PRD-027 RNF-007).`,
  );
};

export const supabaseScheduledSendProvider: IScheduledSendProvider = {
  list: stub("list"),
  listDue: stub("listDue"),
  create: stub("create"),
  update: stub("update"),
  cancel: stub("cancel"),
  markSent: stub("markSent"),
  markFailed: stub("markFailed"),
};
```

- [ ] 19.9 In `src/providers/data/factory.ts`, add mock imports immediately after the `import { mockMediaProvider } from "./impl/mock/media";` line:

```ts
import { mockAssetLibraryProvider } from "./impl/mock/assetLibrary";
import { mockQuickReplyProvider } from "./impl/mock/quickReply";
import { mockTrackableLinkProvider } from "./impl/mock/trackableLink";
import { mockScheduledSendProvider } from "./impl/mock/scheduledSend";
```

- [ ] 19.10 Add supabase imports immediately after the `import { supabaseMediaProvider } from "./impl/supabase/media";` line:

```ts
import { supabaseAssetLibraryProvider } from "./impl/supabase/assetLibrary";
import { supabaseQuickReplyProvider } from "./impl/supabase/quickReply";
import { supabaseTrackableLinkProvider } from "./impl/supabase/trackableLink";
import { supabaseScheduledSendProvider } from "./impl/supabase/scheduledSend";
```

- [ ] 19.11 Add keys to `mockProviders`, immediately after the `media: mockMediaProvider,` line:

```ts
  assetLibrary: mockAssetLibraryProvider,
  quickReply: mockQuickReplyProvider,
  trackableLink: mockTrackableLinkProvider,
  scheduledSend: mockScheduledSendProvider,
```

- [ ] 19.12 Add keys to `supabaseProviders`, immediately after the `media: supabaseMediaProvider,` line:

```ts
  assetLibrary: supabaseAssetLibraryProvider,
  quickReply: supabaseQuickReplyProvider,
  trackableLink: supabaseTrackableLinkProvider,
  scheduledSend: supabaseScheduledSendProvider,
```

- [ ] 19.13 Run `bun run build` — expect GREEN (the `IDataProviders` shape from Task 18 is now fully satisfied by both provider bundles).
- [ ] 19.14 Commit Tasks 18 + 19 together:
  ```
  git add src/providers/data/contracts src/providers/data/impl/mock src/providers/data/impl/supabase src/providers/data/factory.ts
  git commit -m "feat(providers): wire PRD-027 4 slices (contracts + mock impls + supabase stubs + factory)"
  ```

---

## TASK 20 — Provider hooks (4) + public barrel

**Files:**
- Create: `src/providers/data/hooks/useAssetLibraryProvider.ts`
- Create: `src/providers/data/hooks/useQuickReplyProvider.ts`
- Create: `src/providers/data/hooks/useTrackableLinkProvider.ts`
- Create: `src/providers/data/hooks/useScheduledSendProvider.ts`
- Modify: `src/providers/data/index.ts`

**Steps:**

- [ ] 20.1 Create `src/providers/data/hooks/useAssetLibraryProvider.ts`:

```ts
import type { IAssetLibraryProvider } from "../contracts/assetLibrary";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useAssetLibraryProvider(): IAssetLibraryProvider {
  return useDataProviderSlice("assetLibrary", "useAssetLibraryProvider");
}
```

- [ ] 20.2 Create `src/providers/data/hooks/useQuickReplyProvider.ts`:

```ts
import type { IQuickReplyProvider } from "../contracts/quickReply";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useQuickReplyProvider(): IQuickReplyProvider {
  return useDataProviderSlice("quickReply", "useQuickReplyProvider");
}
```

- [ ] 20.3 Create `src/providers/data/hooks/useTrackableLinkProvider.ts`:

```ts
import type { ITrackableLinkProvider } from "../contracts/trackableLink";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useTrackableLinkProvider(): ITrackableLinkProvider {
  return useDataProviderSlice("trackableLink", "useTrackableLinkProvider");
}
```

- [ ] 20.4 Create `src/providers/data/hooks/useScheduledSendProvider.ts`:

```ts
import type { IScheduledSendProvider } from "../contracts/scheduledSend";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useScheduledSendProvider(): IScheduledSendProvider {
  return useDataProviderSlice("scheduledSend", "useScheduledSendProvider");
}
```

- [ ] 20.5 In `src/providers/data/index.ts`, add the four provider types to the big `export type { ... } from "./contracts"` block (insert immediately after `IListMediaParams,` and before the closing `} from "./contracts";`):

```ts
  IAssetLibraryProvider,
  IAssetLibraryListParams,
  IQuickReplyProvider,
  ITrackableLinkProvider,
  IScheduledSendProvider,
```

- [ ] 20.6 In the same file, add hook re-exports immediately after the `export { useMediaStorageProvider } from "./hooks/useMediaStorageProvider";` line (the last line of the file):

```ts
export { useAssetLibraryProvider } from "./hooks/useAssetLibraryProvider";
export { useQuickReplyProvider } from "./hooks/useQuickReplyProvider";
export { useTrackableLinkProvider } from "./hooks/useTrackableLinkProvider";
export { useScheduledSendProvider } from "./hooks/useScheduledSendProvider";
```

- [ ] 20.7 Run `bun run build` — expect GREEN.
- [ ] 20.8 Commit:
  ```
  git add src/providers/data/hooks/useAssetLibraryProvider.ts src/providers/data/hooks/useQuickReplyProvider.ts src/providers/data/hooks/useTrackableLinkProvider.ts src/providers/data/hooks/useScheduledSendProvider.ts src/providers/data/index.ts
  git commit -m "feat(providers): expose PRD-027 useXProvider hooks via data barrel"
  ```

---

## TASK 21 — Feature i18n skeleton + feature barrel

**Files:**
- Create: `src/features/quick-send/i18n/pt-BR.ts`
- Create: `src/features/quick-send/index.ts`

> The i18n bundle is created here as the namespace owner; Plans B and C append keys (append-only). The feature barrel exports the engines + i18n + types now; B/C extend it with hooks/components.

**Steps:**

- [ ] 21.1 Create `src/features/quick-send/i18n/pt-BR.ts`:

```ts
/**
 * PRD-027 — Quick Send & Asset Library i18n bundle (pt-BR).
 *
 * Created by Plan A as the namespace owner. Plans B and C append keys to the
 * existing groups (append-only — never rename or remove). All copy in
 * Brazilian Portuguese with correct accents.
 */
import type { LeadTemperature } from "@/shared/types";

export const QUICK_SEND_STRINGS = {
  picker: {
    title: "Biblioteca de ativos",
    searchPlaceholder: "Buscar catálogo, ficha, tabela...",
    tabRecents: "Recentes",
    tabFavorites: "Favoritos",
    tabAll: "Tudo",
    emptyState: "Nenhum ativo encontrado.",
    modePalette: "Paleta",
    modeGrid: "Grade",
    modeSheet: "Gaveta",
  },
  slash: {
    emptyState: "Nenhum comando ou resposta rápida.",
    literalSlashHint: "Use // para inserir uma barra literal.",
  },
  snippet: {
    fieldsToFill: (n: number) => `${n} campo${n === 1 ? "" : "s"} a preencher`,
    sendBlockedHint: "Preencha os campos destacados antes de enviar.",
  },
  productCard: {
    sendProduct: "Enviar produto",
    consultPrice: "Consultar valor",
    noImage: "Sem imagem",
    searchPlaceholder: "Buscar peça por nome, OE ou equivalência...",
    stockOk: "Em estoque",
    stockWarning: "Estoque baixo",
    stockCritical: "Sem estoque",
  },
  combo: {
    packageMode: "Modo pacote",
    tray: "Pacote",
    sendAll: "Enviar todos",
    sending: (i: number, n: number) => `Enviando ${i}/${n}`,
    // itemSkipped is a FUNCTION (Plan C ComboTray/useComboSend call it with a
    // title): keep this shape so consumers compile. Do NOT downgrade to a string.
    itemSkipped: (title: string) => `Ignorado: ${title} (sem permissão ou não publicado)`,
    addToCombo: "Adicionar ao pacote",
    moveUp: "Mover para cima",
    moveDown: "Mover para baixo",
    remove: "Remover do pacote",
    partialDone: (sent: number, skipped: number) =>
      `Pacote enviado: ${sent} item(ns)${skipped > 0 ? `, ${skipped} ignorado(s)` : ""}.`,
  },
  schedule: {
    scheduleSend: "Agendar envio",
    presetTodayEvening: "Hoje 18:00",
    presetTomorrowMorning: "Amanhã 09:00",
    presetMonday: "Segunda 08:00",
    custom: "Data e hora",
    scheduledCount: (n: number) => `Agendados (${n})`,
    edit: "Editar",
    cancel: "Cancelar",
    undo: "Desfazer",
  },
  link: {
    openedAgo: (label: string) => `Aberto há ${label}`,
    openCount: (n: number) => `${n} vez${n === 1 ? "" : "es"}`,
    trackableNote: "Link rastreável",
  },
  temperature: {
    // Re-pinned per CONTRACT §J (2026-06-06): two-arg cause→effect line consumed
    // by Plan C's useTrackableLinkSimulation, plus a toast(label). `label` is the
    // new LeadTemperature word; `what` is the link's UTM campaign or a fallback.
    roseUpTo: (label: LeadTemperature, what: string) => {
      const word = label === "quente" ? "Quente" : label === "morno" ? "Morno" : "Frio";
      const emoji = label === "quente" ? "🔥" : "🌤️";
      return `${emoji} Temperatura subiu para ${word} — cliente abriu ${what}`;
    },
    toast: (label: LeadTemperature) => {
      const word = label === "quente" ? "Quente" : label === "morno" ? "Morno" : "Frio";
      return `Temperatura do lead subiu para ${word}.`;
    },
  },
  library: {
    publish: "Publicar",
    unpublish: "Despublicar",
    version: "Versão",
    permission: "Permissão",
    draft: "Rascunho",
    archived: "Arquivado",
    sensitive: "Sensível",
    noPermission: "Sem permissão",
    manageSnippets: "Gerenciar respostas rápidas",
  },
  stats: {
    topAssets: "Ativos mais enviados",
    perSeller: "Ranking por vendedor",
    period: "Período",
  },
  errors: {
    loadAssetFailed: "Não foi possível carregar a biblioteca.",
    sendFailed: "Falha ao enviar. Tente novamente.",
  },
} as const;
```

- [ ] 21.2 Create `src/features/quick-send/index.ts`:

```ts
/**
 * PRD-027 — Quick Send & Asset Library feature barrel.
 *
 * Plan A exports the pure engines, the i18n bundle and the domain types.
 * Plans B and C append hooks and components (append-only).
 */

// Engines (pure)
export {
  resolvePlaceholders,
  hasUnresolved,
  type IPlaceholderContext,
} from "./engine/placeholderResolver";
export { parseSlash, type ISlashState } from "./engine/slashParser";
export { isSensitiveAsset, canSendSensitiveAsset } from "./engine/assetSensitivity";
export { pickSendableVersion, bumpVersion } from "./engine/assetVersioning";
export { filterAssets, type IAssetFilter } from "./engine/assetFiltering";
export { nextTemperature } from "./engine/temperatureEscalation";
export {
  buildShortRef,
  buildUtm,
  encodeLinkMarker,
  TRACKABLE_LINK_MARKER,
  type ILinkPayload,
} from "./engine/trackableLink";
export { isDue, validateFuture } from "./engine/scheduledSend";
export {
  planComboSend,
  type IComboPlan,
  type IComboPlanItem,
} from "./engine/comboSend";
export {
  encodeProductCard,
  decodeProductCard,
  priceLabel,
  hasImage,
  PRODUCT_CARD_MARKER,
  type IProductCardSnapshot,
} from "./engine/productCardPayload";

// i18n
export { QUICK_SEND_STRINGS } from "./i18n/pt-BR";
```

- [ ] 21.3 Run `bun run build` — expect GREEN.
- [ ] 21.4 Commit:
  ```
  git add src/features/quick-send/i18n/pt-BR.ts src/features/quick-send/index.ts
  git commit -m "feat(quick-send): i18n skeleton (QUICK_SEND_STRINGS) + feature barrel"
  ```

---

## TASK 22 — Foundation data hooks (pure data) — `useAssetLibrary`, `useQuickReplies`, `useAssetUsageStats`

**Files:**
- Create: `src/features/quick-send/hooks/useAssetLibrary.ts`
- Create: `src/features/quick-send/hooks/useQuickReplies.ts`
- Create: `src/features/quick-send/hooks/useAssetUsageStats.ts`
- Modify: `src/features/quick-send/index.ts`

> These three hooks are pure data (no composer surface) so the foundation owns them (CONTRACT §K). They use TanStack Query + the provider hooks. Verified by `bun run build` (no jsdom/RTL in this project).

**Steps:**

- [ ] 22.1 First, confirm the current seller id source. Check how other hooks read the active seller:
  ```
  rg "getCurrentContext\(\)\.user" src/features --glob "*.ts" -l
  ```
  Use `getCurrentContext().user?.id` for `sellerId` (the user is a seller in this app; `getCurrentContext` lives at `@/features/multistore/utils/getCurrentContext`).

- [ ] 22.2 Create `src/features/quick-send/hooks/useAssetLibrary.ts`:

```ts
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ID, IAssetLibraryItem } from "@/shared/types";
import { useAssetLibraryProvider } from "@/providers/data";
import { getCurrentContext } from "@/features/multistore/utils/getCurrentContext";
import type { IAssetFilter } from "../engine/assetFiltering";

/**
 * Foundation data hook for the asset library (PRD-027). Wraps the provider in
 * TanStack Query: lists by filter, plus the seller's recents and favorites.
 * `search` updates the debounce-friendly query in the filter; `toggleFavorite`
 * flips and invalidates the favorites query.
 */
export function useAssetLibrary(filter: IAssetFilter): {
  items: IAssetLibraryItem[];
  recents: IAssetLibraryItem[];
  favorites: IAssetLibraryItem[];
  isLoading: boolean;
  isError: boolean;
  search: (q: string) => void;
  toggleFavorite: (id: ID) => void;
  refetch: () => void;
} {
  const provider = useAssetLibraryProvider();
  const queryClient = useQueryClient();
  const sellerId = getCurrentContext().user?.id ?? "anon";
  const [query, setQuery] = useState(filter.query ?? "");

  const effectiveFilter = useMemo<IAssetFilter>(
    () => ({ ...filter, query }),
    [filter, query],
  );

  const listQuery = useQuery({
    queryKey: ["quick-send", "assets", effectiveFilter],
    queryFn: () =>
      provider.list({
        category: effectiveFilter.category,
        brand: effectiveFilter.brand,
        productLine: effectiveFilter.productLine,
        search: effectiveFilter.query,
        pageSize: 200,
      }),
  });

  const recentsQuery = useQuery({
    queryKey: ["quick-send", "recents", sellerId],
    queryFn: () => provider.getRecent(sellerId),
  });

  const favoritesQuery = useQuery({
    queryKey: ["quick-send", "favorites", sellerId],
    queryFn: () => provider.getFavorites(sellerId),
  });

  const search = useCallback((q: string) => setQuery(q), []);

  const toggleFavorite = useCallback(
    (id: ID) => {
      void provider.toggleFavorite(sellerId, id).then(() => {
        void queryClient.invalidateQueries({ queryKey: ["quick-send", "favorites", sellerId] });
      });
    },
    [provider, queryClient, sellerId],
  );

  const refetch = useCallback(() => {
    void listQuery.refetch();
    void recentsQuery.refetch();
    void favoritesQuery.refetch();
  }, [listQuery, recentsQuery, favoritesQuery]);

  return {
    items: listQuery.data?.data ?? [],
    recents: recentsQuery.data ?? [],
    favorites: favoritesQuery.data ?? [],
    isLoading: listQuery.isLoading,
    isError: listQuery.isError,
    search,
    toggleFavorite,
    refetch,
  };
}
```

- [ ] 22.3 Create `src/features/quick-send/hooks/useQuickReplies.ts`:

```ts
import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IQuickReply } from "@/shared/types";
import { useQuickReplyProvider } from "@/providers/data";
import { getCurrentContext } from "@/features/multistore/utils/getCurrentContext";

/**
 * Foundation data hook for quick replies / snippets (PRD-027). Lists the
 * seller's visible snippets (own private + store shared) and resolves a
 * shortcut synchronously from the loaded list.
 */
export function useQuickReplies(): {
  replies: IQuickReply[];
  isLoading: boolean;
  findByShortcut: (shortcut: string) => IQuickReply | null;
} {
  const provider = useQuickReplyProvider();
  const sellerId = getCurrentContext().user?.id ?? "anon";

  const repliesQuery = useQuery({
    queryKey: ["quick-send", "replies", sellerId],
    queryFn: () => provider.list({ sellerId }),
  });

  const replies = repliesQuery.data ?? [];

  const findByShortcut = useCallback(
    (shortcut: string): IQuickReply | null => {
      const candidates = replies.filter((r) => r.shortcut === shortcut);
      const own = candidates.find((r) => r.scope === "private" && r.ownerId === sellerId);
      if (own) return own;
      return candidates.find((r) => r.scope === "shared") ?? null;
    },
    [replies, sellerId],
  );

  return {
    replies,
    isLoading: repliesQuery.isLoading,
    findByShortcut,
  };
}
```

- [ ] 22.4 Create `src/features/quick-send/hooks/useAssetUsageStats.ts`:

> IMPORTANT — lint boundary: feature files CANNOT import `@/mocks` (eslint.config.js
> `no-restricted-imports` forbids `@/mocks`/`@/mocks/api`/`@/mocks/api/*` for every
> file under `src/` except `src/mocks/**` and `src/providers/data/**`). So this hook
> consumes `useAssetLibraryProvider().getUsageStats()` — the PROVIDER bridges to
> `assetLibraryApi.getUsageStats` (§F.6, §A `IAssetLibraryProvider.getUsageStats`,
> §19.1). This preserves real per-asset/per-seller counts (D-13) AND respects the
> boundary. Do NOT import `@/mocks` here.

```ts
import { useQuery } from "@tanstack/react-query";
import type { ID, ISO8601 } from "@/shared/types";
import { useAssetLibraryProvider } from "@/providers/data";

/**
 * Foundation data hook for the management usage stats (PRD-027 D-13, RF-025).
 * Reads the simulated usage ledger via the asset library provider (the only
 * layer allowed to bridge `@/mocks`). The `from`/`to` params are accepted for
 * forward-compatibility; the Fase 1 mock aggregates all recorded sends
 * regardless of window.
 */
export function useAssetUsageStats(params?: { from?: ISO8601; to?: ISO8601 }): {
  topAssets: { assetId: ID; title: string; count: number }[];
  bySeller: { sellerId: ID; count: number }[];
  isLoading: boolean;
} {
  const provider = useAssetLibraryProvider();
  const statsQuery = useQuery({
    queryKey: ["quick-send", "usage-stats", params?.from ?? null, params?.to ?? null],
    queryFn: () => provider.getUsageStats(params),
  });

  return {
    topAssets: statsQuery.data?.topAssets ?? [],
    bySeller: statsQuery.data?.bySeller ?? [],
    isLoading: statsQuery.isLoading,
  };
}
```

- [ ] 22.5 Append the three hooks to `src/features/quick-send/index.ts` (after the i18n export):

```ts

// Foundation data hooks (pure data — Plan A)
export { useAssetLibrary } from "./hooks/useAssetLibrary";
export { useQuickReplies } from "./hooks/useQuickReplies";
export { useAssetUsageStats } from "./hooks/useAssetUsageStats";
```

- [ ] 22.6 Confirm the lint boundary holds. The 22.4 hook intentionally consumes
  `useAssetLibraryProvider().getUsageStats()` and does NOT import `@/mocks`, so the
  `no-restricted-imports` rule is satisfied by construction (the `getUsageStats`
  method was added to `IAssetLibraryProvider` in §A/Task 1.1, implemented in the
  mock provider in Task 19.1, and stubbed in supabase in Task 19.5). Sanity-check
  that no PRD-027 feature file imports `@/mocks` (expect ZERO matches):
  ```
  rg "from \"@/mocks\"" src/features/quick-send --glob "*.ts"
  ```
  (The only `@/mocks` consumers Plan A adds are the mock provider impls under
  `src/providers/data/impl/mock/` — that directory is exempt from the boundary in
  eslint.config.js.)

- [ ] 22.7 Run `bun run build` — expect GREEN. Run `bun run lint` and confirm no NEW `no-restricted-imports` error from these three files (compare against baseline).
- [ ] 22.8 Commit:
  ```
  git add src/features/quick-send/hooks/useAssetLibrary.ts src/features/quick-send/hooks/useQuickReplies.ts src/features/quick-send/hooks/useAssetUsageStats.ts src/features/quick-send/index.ts
  git commit -m "feat(quick-send): foundation data hooks (useAssetLibrary/useQuickReplies/useAssetUsageStats)"
  ```

---

## TASK 23 — Mock smoke test: providers list deterministic data

**Files:**
- Create: `src/mocks/generators/__tests__/quickSendBootstrap.test.ts`

> A node-level smoke proving the seeded dataset + selectors return deterministic, well-formed PRD-027 data (the "mock smoke" required by the plan validation). It exercises `bootstrap` end-to-end (no React).

**Steps:**

- [ ] 23.1 Create `src/mocks/generators/__tests__/quickSendBootstrap.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bootstrap } from "../bootstrap";

describe("bootstrap — PRD-027 collections", () => {
  it("populates the asset library, snippets, links and combos deterministically", () => {
    const a = bootstrap(42);
    const b = bootstrap(42);
    expect(a.assetLibraryItems).toEqual(b.assetLibraryItems);
    expect(a.quickReplies).toEqual(b.quickReplies);
    expect(a.trackableLinks).toEqual(b.trackableLinks);
    expect(a.assetCombos).toEqual(b.assetCombos);
  });

  it("respects configured volumes (±0 for these fixed-count collections)", () => {
    const d = bootstrap(42);
    expect(d.assetLibraryItems).toHaveLength(30);
    expect(d.quickReplies).toHaveLength(20);
    expect(d.trackableLinks).toHaveLength(10);
    expect(d.assetCombos).toHaveLength(5);
    expect(d.scheduledSends).toHaveLength(0);
  });

  it("binds trackable links to real conversations", () => {
    const d = bootstrap(42);
    const convIds = new Set(d.conversations.map((c) => c.id));
    for (const l of d.trackableLinks) {
      expect(convIds.has(l.conversationId!)).toBe(true);
    }
  });

  it("binds combos to real asset ids", () => {
    const d = bootstrap(42);
    const assetIds = new Set(d.assetLibraryItems.map((a) => a.id));
    for (const c of d.assetCombos) {
      for (const id of c.assetIds) expect(assetIds.has(id)).toBe(true);
    }
  });

  it("marks every tabela_preco asset sensitive in the seeded library", () => {
    const d = bootstrap(42);
    for (const a of d.assetLibraryItems) {
      if (a.category === "tabela_preco") expect(a.sensitivity).toBe("sensitive");
    }
  });
});
```

- [ ] 23.2 Run `bun run vitest run src/mocks/generators/__tests__/quickSendBootstrap.test.ts` — expect PASS.
- [ ] 23.3 Commit:
  ```
  git add src/mocks/generators/__tests__/quickSendBootstrap.test.ts
  git commit -m "test(mocks): PRD-027 bootstrap smoke (deterministic, referentially intact)"
  ```

---

## TASK 24 — Validation (final gate for Plan A)

**Files:** none (verification only).

**Steps:**

- [ ] 24.1 Run the full unit suite and confirm GREEN:
  ```
  bun run vitest run src/features/quick-send src/mocks/generators/__tests__/quickSend.test.ts src/mocks/generators/__tests__/quickSendBootstrap.test.ts
  ```
  Expected: all engine tests (TASK 2–11), the generator test (TASK 14) and the bootstrap smoke (TASK 23) PASS, 0 failures.

- [ ] 24.2 Run the whole test suite to confirm no regressions elsewhere:
  ```
  bun run vitest run
  ```
  Expected: GREEN (no new failures vs. the pre-Plan-A baseline). If a pre-existing failure is present on `main`, note it but do not fix it here.

- [ ] 24.3 Run the build gate:
  ```
  bun run build
  ```
  Expected: GREEN (vite build completes; no new TypeScript errors introduced by Plan A — judge by delta).

- [ ] 24.4 Run lint and confirm no NEW violations from Plan A files:
  ```
  bun run lint
  ```
  Expected: no new `no-restricted-imports`/`no-explicit-any` errors attributable to the files this plan created. (Pre-existing warnings on unrelated files are out of scope.)

- [ ] 24.5 Manual checklist (confirm by inspection — no browser):
  - [ ] `src/shared/types/quickSend.ts` exists and is re-exported by `src/shared/types/index.ts`.
  - [ ] All 10 engines + their `*.test.ts` exist under `src/features/quick-send/engine/`.
  - [ ] 4 contracts, 4 mock impls, 4 supabase stubs, 4 provider hooks exist; `factory.ts` registers all 4 in both bundles; `src/providers/data/index.ts` re-exports the 4 hooks + types.
  - [ ] `src/mocks/config.ts` has the 5 new `VOLUMES` keys; `bootstrap.ts` generates + returns the 5 collections; `selectors.ts` has the 10 new selectors; `api/index.ts` re-exports the 4 apis.
  - [ ] `resources.ts` has the 4 new resources; `matrix.ts` has Owner/Gestor/Vendedor/SDR entries (NO `send` action anywhere).
  - [ ] `src/features/quick-send/i18n/pt-BR.ts` exports `QUICK_SEND_STRINGS`; `src/features/quick-send/index.ts` barrels engines + i18n + the 3 foundation hooks.
  - [ ] No React UI component was created in this plan.

- [ ] 24.6 Final summary commit (optional — only if any doc/checklist file changed). Plan A introduces NO version bump and NO changelog entry (that happens after Plan C completes the PRD, per the spec's MINOR → v0.68.0 plan).

---

**Plan A complete when:** `bun run vitest run` GREEN, `bun run build` GREEN, the mock smoke (TASK 23) confirms deterministic provider/seed data, and every checkbox above is checked. Plans B and C build the React surfaces (composer/picker/snippet/card and tracking/combos/scheduling/governance) on top of this foundation, consuming the exact names defined in the CONTRACT.

**AILA Sistemas Inteligentes — PRD-027 Plan A (Fundação), 2026-06-06.**
