# PRD-026 Gestão de Mídia — Plan A: Foundation + Inbound (Fases 1-2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the non-UI foundation of the embedded media layer — the `media.ts` domain type, the `IMediaStorageProvider` (mock + Supabase stub + factory + hook), the deterministic `mediaAsset` generator wired into bootstrap, the mock API, the complete pure `engine/`, and the inbound persistence hook — so PRD-026 Fases 3-5 (UI) can build on a tested, buildable base.

**Architecture:** Follows the established Provider Pattern (PRD-005): a contract in `src/providers/data/contracts/`, a mock impl that store-scopes via `scopedListParams`, audits via `logMockMutation`, and RBAC-gates `getSignedUrl`; a Supabase stub that throws `NotImplementedError`; a hook via `useDataProviderSlice("media", …)`; wiring in `factory.ts` + barrels. Mock data flows through a deterministic `ISeededContext` generator into `bootstrap.ts` and the Zustand mock store, served by `src/mocks/api/media.ts` through `runApi`. All decision logic lives in pure, Vitest-tested modules under `src/features/media/engine/`.

**Tech Stack:** React 19 + TypeScript (strict) + Vite + TanStack Router/Query + zustand + faker/seedrandom (mock) + Vitest (node env) + `@tanstack/react-virtual` (new dep, used by Fase 3 UI). Bun package manager with a 24h supply-chain guard (`bunfig.toml`).

---

## File Structure

| File | Create/Modify | Responsibility |
|------|---------------|----------------|
| `package.json` | Modify | Add `@tanstack/react-virtual` to `dependencies`. |
| `src/shared/types/media.ts` | Create | Domain types: `IMediaClassification`, `IMediaAnnotation`, `IMediaAsset`, `IMediaUploadInput`, `IListMediaParams`, `IMediaStorageProvider`. |
| `src/shared/types/index.ts` | Modify | Re-export the media types from the barrel. |
| `src/providers/data/contracts/mediaStorage.ts` | Create | `IMediaStorageProvider` contract (re-exports the type-level interface). |
| `src/providers/data/contracts/index.ts` | Modify | Register `media: IMediaStorageProvider` in `IDataProviders` + type re-exports. |
| `src/providers/data/impl/mock/media.ts` | Create | Mock provider: scoped list, RBAC-gated `getSignedUrl`, audited mutations, `ensureFromMessage` dedup. |
| `src/providers/data/impl/supabase/media.ts` | Create | Supabase stub → `NotImplementedError`. |
| `src/providers/data/hooks/useMediaStorageProvider.ts` | Create | `useDataProviderSlice("media", …)`. |
| `src/providers/data/factory.ts` | Modify | Add `media` to `mockProviders` + `supabaseProviders`. |
| `src/providers/data/index.ts` | Modify | Export type + `useMediaStorageProvider` from the public barrel. |
| `src/mocks/api/media.ts` | Create | `list/get/getSignedUrl/delete/update/ensureFromMessage` via `runApi`. |
| `src/mocks/api/index.ts` | Modify | Export `mediaApi` + `IListMediaParams`. |
| `src/mocks/store/mockStore.ts` (via bootstrap) + `mutations.ts` + `selectors.ts` | Modify | Add `mediaAssets` collection (selectors + upsert/patch/remove + bootstrap field). |
| `src/mocks/generators/mediaAsset.ts` | Create | Deterministic `IMediaAsset[]` generator from `ISeededContext`; realistic fileNames/markers run through `classifyMedia` (mockMarker path) for varied classifications. |
| `src/mocks/generators/bootstrap.ts` | Modify | Generate `mediaAssets` + add to `IBootstrappedDataset`. |
| `src/mocks/config.ts` | Modify | Add `"mediaAssets"` to `MockEntityName` + `VOLUMES`. |
| `src/features/media/engine/contentHash.ts` | Create | Deterministic simulated content hash for dedup. |
| `src/features/media/engine/__tests__/contentHash.test.ts` | Create | Vitest: determinism + distinctness. |
| `src/features/media/engine/classifyMedia.ts` | Create | Heuristic kind/mime/fileName/marker → `IMediaClassification`. |
| `src/features/media/engine/__tests__/classifyMedia.test.ts` | Create | Vitest: classification cases. |
| `src/features/media/engine/sourceExpiry.ts` | Create | `computeSourceExpiresAt`, `daysUntilExpiry`, `expiryLabel`, `expiryUrgency` (tier word **'strong'**), and the convenience `sourceExpiry(asset, now?)` → `{ daysLeft, label, tier }`. |
| `src/features/media/engine/__tests__/sourceExpiry.test.ts` | Create | Vitest: label + tiers. |
| `src/features/media/engine/sensitiveAccess.ts` | Create | `canViewSensitive`, `statusChipPriority` (D-13). |
| `src/features/media/engine/__tests__/sensitiveAccess.test.ts` | Create | Vitest: RBAC + chip order. |
| `src/features/media/engine/mediaFiltering.ts` | Create | Combined AND filters (`applyMediaFilters`, `from?`/`to?` ISO) + text search + `highlightRanges` + `highlightSegments` (segments covering the whole string). |
| `src/features/media/engine/__tests__/mediaFiltering.test.ts` | Create | Vitest: filters + search + `highlightRanges` + `highlightSegments` (segments cover the whole string, `isMatch` only on the term). |
| `src/features/media/engine/annotationCoords.ts` | Create | normalize/denormalize 0..1, idempotent. |
| `src/features/media/engine/__tests__/annotationCoords.test.ts` | Create | Vitest: idempotence + clamping. |
| `src/features/media/hooks/useEnsureInboundMedia.ts` | Create | Pure `resolveInboundAsset` decision + hook wiring (dedup, expiry, retry, non-blocking). |
| `src/features/media/hooks/__tests__/resolveInboundAsset.test.ts` | Create | Vitest: create/dedup/skip decisions. |
| `src/features/media/utils/mediaDisplay.ts` | Create | Counters string, kind icons, `formatBytes`. |
| `src/features/media/utils/__tests__/mediaDisplay.test.ts` | Create | Vitest: counters + formatBytes. |
| `src/features/media/i18n/pt-BR.ts` | Create | Foundation i18n skeleton (classification + kind labels + counters words). |
| `src/features/media/index.ts` | Create | Barrel for the foundation surface (engine + hook + utils + i18n). |

> **Testing note:** `tsc --noEmit` has ~315 PRE-EXISTING errors in this repo; **the real gate is `bun run build` (vite)** — evaluate only the delta from new code. Pure logic is tested with Vitest (`bun run test -- <file>`, node env, config in `vitest.config.ts`). No jsdom/RTL/browser tests. CRLF warnings on `git add` are a **known false positive** — do NOT run prettier to "fix" them. Every commit message ends with a blank line then `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Add `@tanstack/react-virtual` dependency

**Files:**
- Modify: `package.json` (the `"dependencies"` object, alphabetically near the existing `@tanstack/*` entries on lines 53-55).

- [ ] **Step 1: Install respecting the 24h guard.** Run the install — `@tanstack/react-virtual` is mature (the 24h `minimumReleaseAge` in `bunfig.toml` only blocks versions published <24h ago, so no `minimumReleaseAgeExcludes` entry is needed per spec D-7/§11):
  ```bash
  bun add @tanstack/react-virtual
  ```
  Expected: `bun.lock` and `package.json` update; `node_modules/@tanstack/react-virtual` present. If bun reports the version is blocked by the guard (only if a brand-new version dropped in the last 24h), STOP and ask the user before touching `minimumReleaseAgeExcludes`.
- [ ] **Step 2: Confirm the manifest entry.** Verify `package.json` now lists `"@tanstack/react-virtual"` under `dependencies`. It should sit alphabetically between `@tailwindcss/vite` and `@tanstack/react-query`.
- [ ] **Step 3: Verify the build still passes (baseline gate).** Run:
  ```bash
  bun run build
  ```
  Expected: build completes with exit code 0 (the dep is installed but not yet imported anywhere, so nothing should change behavior).
- [ ] **Step 4: Commit.**
  ```bash
  git add package.json bun.lock
  git commit -m "$(cat <<'EOF'
chore(media): add @tanstack/react-virtual for the media gallery (PRD-026 D-7)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

### Task 2: Domain types — `src/shared/types/media.ts`

**Files:**
- Create: `src/shared/types/media.ts`
- Modify: `src/shared/types/index.ts` (append a new export block after the Forecast block ending at line 391).

- [ ] **Step 1: Create the media types file verbatim from spec §4.** `IMediaStorageProvider` lives in `media.ts` (D-15 — dedicated type) and its `list` op returns `IPaginatedResult<IMediaAsset>`. Constraint: `src/shared/types` must NOT depend on `src/providers` or `src/mocks`, so the provider cannot import `IPaginatedResult` from the providers `_shared` or the mocks `paginate` util. Resolution: promote `IPaginatedResult` into `src/shared/types/common.ts` as the single canonical definition (Step 2 below adds it), then `media.ts` imports it from `./common`. It also imports `IMessage` from `./conversation` for `ensureFromMessage`. Create `src/shared/types/media.ts`:
  ```ts
  import type { ID, ISO8601, IPaginatedResult } from "./common";
  import type { IMessage } from "./conversation";

  /** Assisted classification of a media asset (heuristic on Fase 1). */
  export type IMediaClassification =
    | "nota_fiscal"
    | "peca"
    | "chassi_placa"
    | "comprovante"
    | "catalogo"
    | "outro";

  /**
   * A single annotation drawn over an image asset. Coordinates are normalized
   * 0..1 so they survive resize / zoom / DPR changes (RF-020, D normalize).
   */
  export interface IMediaAnnotation {
    id: ID;
    type: "point" | "arrow" | "text";
    /** Normalized 0..1 anchor. */
    x: number;
    y: number;
    /** Normalized 0..1 arrow tip (only when type === "arrow"). */
    x2?: number;
    y2?: number;
    /** Annotation text (a11y: every mark carries a label). */
    label?: string;
    /**
     * Severity TOKEN NAME — one of "critical" | "warning" | "info" (NOT a raw
     * hex and NOT a CSS var). The UI maps the token to a Tailwind utility class
     * (e.g. "critical" → text-severity-critical / border-severity-critical),
     * never `var(--severity-*)` (undefined; the design system exposes
     * `--color-severity-*` consumed via the `severity-*` utilities). D-14.
     */
    color: string;
    createdBy: ID;
    createdAt: ISO8601;
  }

  /**
   * Archived media asset — the source of truth for inbound/outbound media.
   * Multi-store from the model (`storeId`). `storageRef` is always an obfuscated
   * reference, never a real URL/credential (RNF-008).
   */
  export interface IMediaAsset {
    id: ID;
    storeId: ID;
    conversationId?: ID;
    customerId?: ID;
    messageId?: ID;
    kind: "image" | "audio" | "document" | "video";
    mimeType: string;
    sizeBytes: number;
    fileName?: string;
    authorType: "customer" | "seller" | "sdr" | "system";
    direction: "in" | "out";
    createdAt: ISO8601;
    /** Obfuscated reference — never a real URL/credential (RNF-008). */
    storageRef: string;
    /** False while not yet archived. */
    persisted: boolean;
    /** Simulated Meta URL expiry (D-3). */
    sourceExpiresAt?: ISO8601;
    /** Dedup key. */
    contentHash?: string;
    classification?: IMediaClassification;
    linkedVehicleId?: ID;
    linkedOrderId?: ID;
    linkedPartId?: ID;
    /** Mock on Fase 1 — search already works against these. */
    ocrText?: string;
    transcription?: string;
    sensitivity: "normal" | "sensitive";
    annotations?: IMediaAnnotation[];
    /** original=1; saving an annotation bumps to 2 (minimal history). */
    version?: number;
  }

  /**
   * Caller-facing upload payload. `storeId` is injected by the provider
   * (`withCreateStoreId`), never supplied by the caller.
   */
  export interface IMediaUploadInput {
    kind: IMediaAsset["kind"];
    mimeType: string;
    sizeBytes: number;
    fileName?: string;
    conversationId?: ID;
    customerId?: ID;
    messageId?: ID;
    authorType: IMediaAsset["authorType"];
    direction: "in" | "out";
    sourceExpiresAt?: ISO8601;
    contentHash?: string;
    ocrText?: string;
    transcription?: string;
  }

  /** Filter accepted by the `list` op. Store-scoped by the provider. */
  export interface IListMediaParams {
    storeId?: ID;
    conversationId?: ID;
    customerId?: ID;
    kind?: IMediaAsset["kind"];
    classification?: IMediaClassification;
    authorType?: IMediaAsset["authorType"];
    from?: ISO8601;
    to?: ISO8601;
    search?: string;
  }

  /**
   * Embedded media storage contract (PRD-026). The 5 "storage" ops are the
   * surface that Supabase Storage replaces in Fase 2 (RNF-007); the catalog ops
   * (`ensureFromMessage`, `update`) hit the table, not the bucket.
   */
  export interface IMediaStorageProvider {
    upload(input: IMediaUploadInput): Promise<IMediaAsset>;
    get(assetId: ID): Promise<IMediaAsset | null>;
    /** RBAC-gated (D-4): redacted placeholder ref for sensitive-without-permission. */
    getSignedUrl(assetId: ID): Promise<string>;
    /** Audited. */
    delete(assetId: ID): Promise<IMediaAsset>;
    /** Store-scoped. */
    list(filter: IListMediaParams): Promise<IPaginatedResult<IMediaAsset>>;
    /** Dedup by messageId/contentHash (D-3). */
    ensureFromMessage(message: IMessage): Promise<IMediaAsset>;
    /** Audited classification/link/sensitivity/persisted/annotations patch. */
    update(assetId: ID, patch: Partial<IMediaAsset>): Promise<IMediaAsset>;
  }
  ```
- [ ] **Step 2: Add the canonical `IPaginatedResult` to `common.ts`.** `media.ts` imports `IPaginatedResult` from `./common`, but `common.ts` (read: lines 1-34) does not export it. Append to `src/shared/types/common.ts` after the `ThemeMode` type (line 33):
  ```ts

  /**
   * Generic paginated result returned by every `list` op across the data layer.
   * Mirrors the shape the mock paginate util and the future Supabase response
   * both normalize into.
   */
  export interface IPaginatedResult<T> {
    data: T[];
    total: number;
    page: number;
    pageSize: number;
  }
  ```
- [ ] **Step 3: Re-export `IPaginatedResult` + media types from the barrel.** In `src/shared/types/index.ts`, extend the Utility-types line (line 13) and append a media block at the end (after line 391). First widen line 13:
  ```ts
  export type { ID, ISO8601, Money, Division, ThemeName, ThemeMode, IPaginatedResult } from "./common";
  ```
  Then append after the Forecast block (line 391):
  ```ts

  // Media (PRD-026 — DAM + Galeria)
  export type {
    IMediaClassification,
    IMediaAnnotation,
    IMediaAsset,
    IMediaUploadInput,
    IListMediaParams,
    IMediaStorageProvider,
  } from "./media";
  ```
- [ ] **Step 4: Verify build (gate).** Run:
  ```bash
  bun run build
  ```
  Expected: exit 0. (Types are inert until consumed; no runtime change.)
- [ ] **Step 5: Commit.**
  ```bash
  git add src/shared/types/media.ts src/shared/types/common.ts src/shared/types/index.ts
  git commit -m "$(cat <<'EOF'
feat(media): add media domain types (DELTA PRD-002)

IMediaAsset/IMediaAnnotation/IMediaClassification + IMediaStorageProvider
contract and the shared IPaginatedResult. Spec §4, D-15.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

### Task 3: Mock store wiring for the `mediaAssets` collection

**Files:**
- Modify: `src/mocks/store/selectors.ts` (add media selectors after `selectAllNotifications`, line ~199-209).
- Modify: `src/mocks/store/mutations.ts` (add `"mediaAssets"` to `CollectionKey` line 27-46 and `CollectionMap` line 48-68; import `IMediaAsset`).

> The Zustand store (`mockStore.ts`) spreads `IBootstrappedDataset`, so once Task 7 adds `mediaAssets` to the dataset the store carries it automatically. Selectors/mutations are the only manual wiring.

- [ ] **Step 1: Register `mediaAssets` in the mutations type maps.** In `src/mocks/store/mutations.ts`, add the import to the type block (after `IMessage,` line 18) and the two map entries. Add to the import list:
  ```ts
    IMediaAsset,
  ```
  Add to `CollectionKey` (after `| "indicators";` line 46, change it to keep `indicators` then add):
  ```ts
    | "indicators"
    | "mediaAssets";
  ```
  Add to `CollectionMap` (after `indicators: IProductIndicator;` line 67):
  ```ts
    mediaAssets: IMediaAsset;
  ```
- [ ] **Step 2: Add media selectors.** In `src/mocks/store/selectors.ts`, import `IMediaAsset` (extend line 1) and append after `selectNotificationsByRecipient` (line 209):
  ```ts

  export function selectAllMediaAssets(): IMediaAsset[] {
    return getMockState().mediaAssets;
  }

  export function selectMediaAssetById(id: ID): IMediaAsset | null {
    return getMockState().mediaAssets.find((m) => m.id === id) ?? null;
  }

  export function selectMediaAssetsByConversation(conversationId: ID): IMediaAsset[] {
    return getMockState().mediaAssets.filter((m) => m.conversationId === conversationId);
  }

  export function selectMediaAssetsByCustomer(customerId: ID): IMediaAsset[] {
    return getMockState().mediaAssets.filter((m) => m.customerId === customerId);
  }

  export function selectMediaAssetByMessage(messageId: ID): IMediaAsset | null {
    return getMockState().mediaAssets.find((m) => m.messageId === messageId) ?? null;
  }

  export function selectMediaAssetByContentHash(contentHash: string): IMediaAsset | null {
    return getMockState().mediaAssets.find((m) => m.contentHash === contentHash) ?? null;
  }
  ```
  Change line 1 to import the type:
  ```ts
  import type { ID, IMediaAsset, INotification } from "@/shared/types";
  ```
- [ ] **Step 3: Commit (build verified at end of Task 7 once the field exists).**
  ```bash
  git add src/mocks/store/selectors.ts src/mocks/store/mutations.ts
  git commit -m "$(cat <<'EOF'
feat(media): register mediaAssets collection in the mock store

Selectors (by id/conversation/customer/message/contentHash) and the
mutation type maps. Bootstrap field follows.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

### Task 4: Provider contract — `mediaStorage.ts` + registry

**Files:**
- Create: `src/providers/data/contracts/mediaStorage.ts`
- Modify: `src/providers/data/contracts/index.ts` (import line ~36, type re-export line ~107, `IDataProviders` line 114-143).

- [ ] **Step 1: Create the contract file.** It re-exports the canonical interface from `@/shared/types` (the type already lives there per D-15) and re-exports the param types so the registry barrel can surface them, mirroring how `messages.ts` (read) owns `IListMessagesParams`. Create `src/providers/data/contracts/mediaStorage.ts`:
  ```ts
  /**
   * Contract for embedded media storage (PRD-026).
   *
   * The interface itself lives in `@/shared/types/media` (D-15 — dedicated type
   * for cohesion); this file is the data-layer entry point and re-exports it so
   * the contracts barrel and factory can register the `media` slice.
   *
   * @see ../../../mocks/api/media.ts
   * @see ../../../../docs/provider-pattern.md
   */
  export type {
    IMediaStorageProvider,
    IMediaUploadInput,
    IListMediaParams,
  } from "@/shared/types";
  ```
- [ ] **Step 2: Register in the contracts barrel.** In `src/providers/data/contracts/index.ts`: add the import after `import type { IModelKitsProvider } from "./modelKits";` (line 35):
  ```ts
  import type { IMediaStorageProvider } from "./mediaStorage";
  ```
  Add the type re-export after the `IModelKitsProvider` block (lines 102-107):
  ```ts
  export type { IMediaStorageProvider, IMediaUploadInput, IListMediaParams } from "./mediaStorage";
  ```
  Add to `IDataProviders` after `modelKits: IModelKitsProvider;` (line 142):
  ```ts
    media: IMediaStorageProvider;
  ```
- [ ] **Step 3: Commit (build verified once impls exist in Task 6).**
  ```bash
  git add src/providers/data/contracts/mediaStorage.ts src/providers/data/contracts/index.ts
  git commit -m "$(cat <<'EOF'
feat(media): register IMediaStorageProvider in the data provider registry

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

### Task 5: Pure engine — `contentHash.ts` (TDD)

**Files:**
- Create: `src/features/media/engine/contentHash.ts`
- Create: `src/features/media/engine/__tests__/contentHash.test.ts`

- [ ] **Step 1: Write the failing test.** Create `src/features/media/engine/__tests__/contentHash.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import { contentHash } from "../contentHash";

  describe("contentHash", () => {
    it("is deterministic for the same input", () => {
      expect(contentHash("nota-123|45678")).toBe(contentHash("nota-123|45678"));
    });
    it("differs for different inputs", () => {
      expect(contentHash("a")).not.toBe(contentHash("b"));
    });
    it("returns a stable, non-empty hex-ish string", () => {
      const h = contentHash("msg-00042|image/jpeg|81234");
      expect(h).toMatch(/^h[0-9a-z]+$/);
      expect(h.length).toBeGreaterThan(4);
    });
  });
  ```
- [ ] **Step 2: Run the test, expect FAIL.**
  ```bash
  bun run test -- src/features/media/engine/__tests__/contentHash.test.ts
  ```
  Expected: FAIL — `Cannot find module '../contentHash'`.
- [ ] **Step 3: Implement.** Create `src/features/media/engine/contentHash.ts`:
  ```ts
  /**
   * Simulated content hash for dedup (Fase 1). Deterministic, dependency-free
   * FNV-1a over the input string rendered base36 with an `h` prefix so it's
   * visually distinct from real ids. NOT cryptographic — Fase 2 uses the real
   * object digest from Supabase Storage.
   */
  export function contentHash(input: string): string {
    let hash = 0x811c9dc5; // FNV offset basis (32-bit)
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      // FNV prime 16777619, kept in 32-bit via Math.imul.
      hash = Math.imul(hash, 0x01000193);
    }
    // >>> 0 forces an unsigned 32-bit integer before base36.
    return `h${(hash >>> 0).toString(36)}`;
  }

  /**
   * Build the canonical dedup key for a media payload. Mirrors what the mock
   * `ensureFromMessage` and the generator both feed into {@link contentHash},
   * so a generated asset and an inbound message resolve to the same hash.
   */
  export function mediaHashSeed(parts: {
    messageId?: string;
    mimeType: string;
    sizeBytes: number;
    fileName?: string;
  }): string {
    return [parts.messageId ?? "", parts.mimeType, String(parts.sizeBytes), parts.fileName ?? ""].join(
      "|",
    );
  }
  ```
- [ ] **Step 4: Run the test, expect PASS.**
  ```bash
  bun run test -- src/features/media/engine/__tests__/contentHash.test.ts
  ```
  Expected: PASS (3 tests).
- [ ] **Step 5: Commit.**
  ```bash
  git add src/features/media/engine/contentHash.ts src/features/media/engine/__tests__/contentHash.test.ts
  git commit -m "$(cat <<'EOF'
feat(media): add deterministic contentHash engine for dedup (PRD-026 §8)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

### Task 6: Mock provider impl + Supabase stub + hook + factory + barrel

> This task makes the `media` slice live in `IDataProviders`. It depends on the mock API (`src/mocks/api/media.ts`) which we build inline here as Step 1 (the API and provider are tightly coupled; building them together keeps the build green). **RBAC single source of truth (canonical contract):** the `media` resource is registered in `RESOURCES` and the per-role matrix entries are added **here, in the SAME task** where the mock provider first calls `scopedListParams(filter, "media")` — this eliminates the temporary `"audit_log"` scope and the old Task 6 → Task 10 window where the provider could ship scoped to a wrong resource. Task 10 only **verifies** this RBAC wiring (no `RESOURCES`/matrix edits there). The sensitive-bytes gate in `getSignedUrl` is a SEPARATE, role-based concern: it uses an inline Owner/Gestor check here and is swapped to the `engine/sensitiveAccess.canViewSensitive(viewer)` import in Task 10 (the engine module lands in Task 10). Mark that explicitly below.

**Files:**
- Create: `src/mocks/api/media.ts`
- Create: `src/mocks/api/__tests__/media.test.ts` (sticker→image + classifyMedia-at-creation)
- Modify: `src/mocks/api/index.ts` (export block, after line 35)
- Modify: `src/features/rbac/permissions/resources.ts` (RESOURCES tuple — add `"media"` after `"audit_log",` line 32)
- Modify: `src/features/rbac/permissions/matrix.ts` (`OWNER_ENTRIES` + `GESTOR_ENTRIES` + `VENDEDOR_ENTRIES` + `SDR_ENTRIES` + `VENDEDOR_EXTERNO_ENTRIES`)
- Create: `src/providers/data/impl/mock/media.ts`
- Create: `src/providers/data/impl/supabase/media.ts`
- Create: `src/providers/data/hooks/useMediaStorageProvider.ts`
- Modify: `src/providers/data/factory.ts` (imports + both provider objects)
- Modify: `src/providers/data/index.ts` (type export line ~91, hook export after line 121)

- [ ] **Step 1: Create the mock API.** Mirrors `customersApi`/`messagesApi` (read). All ops go through `runApi`. `getSignedUrl` here only produces a placeholder ref; the RBAC gate lives in the provider (D-4 — gate in the data layer). Create `src/mocks/api/media.ts`:
  ```ts
  import type { ID, IListMediaParams, IMediaAsset, IMediaUploadInput, IMessage } from "@/shared/types";
  import {
    selectAllMediaAssets,
    selectMediaAssetByContentHash,
    selectMediaAssetById,
    selectMediaAssetByMessage,
  } from "../store/selectors";
  import { patchById, removeById, upsert } from "../store/mutations";
  import { contentHash, mediaHashSeed } from "@/features/media/engine/contentHash";
  import { classifyMedia } from "@/features/media/engine/classifyMedia";
  import {
    MockNotFoundError,
    paginate,
    runApi,
    type IPaginatedResult,
    type IPaginationParams,
  } from "./utils";

  export type IListMediaApiParams = IListMediaParams & IPaginationParams & { storeId?: ID };

  function matches(asset: IMediaAsset, params: IListMediaApiParams): boolean {
    if (params.storeId && asset.storeId !== params.storeId) return false;
    if (params.conversationId && asset.conversationId !== params.conversationId) return false;
    if (params.customerId && asset.customerId !== params.customerId) return false;
    if (params.kind && asset.kind !== params.kind) return false;
    if (params.classification && asset.classification !== params.classification) return false;
    if (params.authorType && asset.authorType !== params.authorType) return false;
    if (params.from && asset.createdAt < params.from) return false;
    if (params.to && asset.createdAt > params.to) return false;
    if (params.search) {
      const q = params.search.toLowerCase().trim();
      if (q.length > 0) {
        const haystack = [asset.fileName ?? "", asset.ocrText ?? "", asset.transcription ?? ""]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
    }
    return true;
  }

  /** Map a media kind to a representative mime when the caller omits one. */
  function defaultMime(kind: IMediaAsset["kind"]): string {
    switch (kind) {
      case "image":
        return "image/jpeg";
      case "audio":
        return "audio/ogg";
      case "video":
        return "video/mp4";
      case "document":
        return "application/pdf";
    }
  }

  export const mediaApi = {
    list(params: IListMediaApiParams = {}): Promise<IPaginatedResult<IMediaAsset>> {
      return runApi(
        "mediaApi",
        "list",
        () => {
          const all = selectAllMediaAssets().filter((a) => matches(a, params));
          const sorted = [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          return paginate(sorted, params);
        },
        { payload: params },
      );
    },

    get(id: ID): Promise<IMediaAsset | null> {
      return runApi("mediaApi", "get", () => selectMediaAssetById(id), { payload: { id } });
    },

    /**
     * Returns an opaque, signed-looking ref. NEVER a real URL/credential. The
     * RBAC gate (sensitive without permission → redacted placeholder) is applied
     * by the provider before this is called (D-4).
     */
    getSignedUrl(id: ID): Promise<string> {
      return runApi(
        "mediaApi",
        "getSignedUrl",
        () => {
          const asset = selectMediaAssetById(id);
          if (!asset) throw new MockNotFoundError("mediaAsset", id);
          return `mock-signed://${asset.storageRef}?exp=${Date.now() + 5 * 60_000}`;
        },
        { payload: { id } },
      );
    },

    delete(id: ID): Promise<IMediaAsset> {
      return runApi(
        "mediaApi",
        "delete",
        () => {
          const before = selectMediaAssetById(id);
          if (!before) throw new MockNotFoundError("mediaAsset", id);
          removeById("mediaAssets", id);
          return before;
        },
        { payload: { id } },
      );
    },

    update(id: ID, patch: Partial<IMediaAsset>): Promise<IMediaAsset> {
      return runApi(
        "mediaApi",
        "update",
        () => {
          const updated = patchById("mediaAssets", id, patch);
          if (!updated) throw new MockNotFoundError("mediaAsset", id);
          return updated;
        },
        { payload: { id, patch } },
      );
    },

    upload(input: IMediaUploadInput & { storeId: ID }): Promise<IMediaAsset> {
      return runApi(
        "mediaApi",
        "upload",
        () => {
          const hash =
            input.contentHash ??
            contentHash(
              mediaHashSeed({
                messageId: input.messageId,
                mimeType: input.mimeType,
                sizeBytes: input.sizeBytes,
                fileName: input.fileName,
              }),
            );
          const asset: IMediaAsset = {
            id: `media-${crypto.randomUUID()}`,
            storeId: input.storeId,
            conversationId: input.conversationId,
            customerId: input.customerId,
            messageId: input.messageId,
            kind: input.kind,
            mimeType: input.mimeType,
            sizeBytes: input.sizeBytes,
            fileName: input.fileName,
            authorType: input.authorType,
            direction: input.direction,
            createdAt: new Date().toISOString(),
            storageRef: `ref-${hash}`,
            persisted: true,
            sourceExpiresAt: input.sourceExpiresAt,
            contentHash: hash,
            ocrText: input.ocrText,
            transcription: input.transcription,
            sensitivity: "normal",
            version: 1,
          };
          upsert("mediaAssets", asset);
          return asset;
        },
        { payload: input },
      );
    },

    /**
     * Idempotent inbound archival. Dedups by messageId first, then contentHash.
     * Returns the existing asset when found (D-3). `storeId` is supplied by the
     * provider (it owns the multi-store context).
     */
    ensureFromMessage(message: IMessage, storeId: ID): Promise<IMediaAsset> {
      return runApi(
        "mediaApi",
        "ensureFromMessage",
        () => {
          const existingByMsg = selectMediaAssetByMessage(message.id);
          if (existingByMsg) return existingByMsg;
          // Normalize sticker -> image INSIDE the API so the 4-kind invariant
          // (image|audio|document|video) holds for EVERY direct caller, not just
          // the mock provider (canonical CREATION WIRING).
          const rawType = message.mediaType ?? "image";
          const kind = (rawType === "sticker" ? "image" : rawType) as IMediaAsset["kind"];
          const mimeType = defaultMime(kind);
          const sizeBytes = 64_000;
          const hash = contentHash(
            mediaHashSeed({ messageId: message.id, mimeType, sizeBytes }),
          );
          const existingByHash = selectMediaAssetByContentHash(hash);
          if (existingByHash) return existingByHash;
          // classifyMedia applied at creation: derive the suggested
          // classification from the message's heuristic markers when none is
          // supplied (canonical CREATION WIRING). IMessage exposes only
          // `mediaUrl` (a filename-ish path) and `text` (the caption/body), so
          // we feed those as the fileName/ocr signals; when both are empty it
          // falls back to the kind-based default (image -> "peca", else "outro").
          const classification = classifyMedia({
            kind,
            mimeType,
            fileName: message.mediaUrl,
            ocrText: message.text,
          });
          const asset: IMediaAsset = {
            id: `media-${crypto.randomUUID()}`,
            storeId,
            conversationId: message.conversationId,
            messageId: message.id,
            kind,
            mimeType,
            sizeBytes,
            authorType: message.authorType,
            direction: message.direction,
            createdAt: message.sentAt,
            storageRef: `ref-${hash}`,
            persisted: true,
            contentHash: hash,
            classification,
            sensitivity: "normal",
            version: 1,
          };
          upsert("mediaAssets", asset);
          return asset;
        },
        { payload: { messageId: message.id } },
      );
    },
  };
  ```
  > Note: `defaultMime`'s switch is exhaustive over the four `kind` values so TypeScript infers a `string` return without a default branch. The sticker→image normalization now lives INSIDE `mediaApi.ensureFromMessage` (above), so the 4-kind invariant holds for every direct caller; the provider's own normalization (Step 4) is a redundant safety net that keeps the provider self-documenting. `IMessage` (read: `src/shared/types/conversation.ts`) exposes `mediaType`, `mediaUrl` and `text` only — so `classifyMedia` is fed `mediaUrl` as the fileName signal and `text` as the ocr signal; both can be empty, in which case the classification falls back to the kind-based default. The wiring requirement is only that `classifyMedia(...)` is CALLED so the suggested classification is populated ("classifyMedia aplicado na criação").
- [ ] **Step 2: Export the API from the mocks barrel.** In `src/mocks/api/index.ts`, add after the `indicatorsApi` export (line 35):
  ```ts
  export { mediaApi, type IListMediaApiParams } from "./media";
  ```
- [ ] **Step 3: Create the Supabase stub.** Mirror `supabase/messages.ts` (read). Create `src/providers/data/impl/supabase/media.ts`:
  ```ts
  import { NotImplementedError } from "../../errors";
  import type { IMediaStorageProvider } from "../../contracts/mediaStorage";

  const stub = (method: string) => () => {
    throw new NotImplementedError(
      `SupabaseMediaProvider.${method} — implementar na Fase 2 (Supabase Storage + tabela media_assets, PRD-026 RNF-007).`,
    );
  };

  export const supabaseMediaProvider: IMediaStorageProvider = {
    upload: stub("upload"),
    get: stub("get"),
    getSignedUrl: stub("getSignedUrl"),
    delete: stub("delete"),
    list: stub("list"),
    ensureFromMessage: stub("ensureFromMessage"),
    update: stub("update"),
  };
  ```
- [ ] **Step 3.5: Register the `media` RBAC resource + matrix entries (single source of truth — done HERE so `scopedListParams(filter, "media")` in Step 4 is valid on its first use).** This is the ONLY place `RESOURCES`/the matrix gain `media`; Task 10 verifies only. In `src/features/rbac/permissions/resources.ts`, add after `"audit_log",` (line 32):
  ```ts
    "media",
  ```
  In `src/features/rbac/permissions/matrix.ts`, add the canonical per-role entries. The matrix grants the resource so the gallery renders; the SENSITIVE-bytes gate is `canViewSensitive` (engine, role-based), NOT the matrix. Add to `OWNER_ENTRIES` (after the `audit_log` line 58, before `p("role", CRUD, "all"),`):
  ```ts
    p("media", CRUD, "all"),
  ```
  Add to `GESTOR_ENTRIES` (after `p("audit_log", ["view"], "store"),` line 91):
  ```ts
    p("media", ["view", "edit", "delete"], "store"),
  ```
  Add to `VENDEDOR_ENTRIES` (after `p("message", ["view", "create"], "own"),` line 110):
  ```ts
    p("media", ["view"], "own"),
  ```
  Add to `SDR_ENTRIES` (after `p("message", ["view", "create"], "own"),` line 130):
  ```ts
    p("media", ["view"], "own"),
  ```
  Add to `VENDEDOR_EXTERNO_ENTRIES` (after `p("message", ["view", "create"], "own"),` line 151):
  ```ts
    p("media", ["view"], "own"),
  ```
  > Final per-role media matrix (canonical): **Owner** `CRUD`/`all`; **Gestor** `[view, edit, delete]`/`store`; **Vendedor / SDR / VendedorExterno** `[view]`/`own`. (Cliente and Financeiro get no `media` entry.) The `EFFECTIVE_PERMISSIONS_INDEX` is rebuilt dynamically at import, so no further wiring is needed.
- [ ] **Step 4: Create the mock provider.** Mirrors `mock/customers.ts` (read): store scope via `scopedListParams`, audit via `logMockMutation`, store id injection via `getCurrentContext`. `list` scopes directly to the now-registered `"media"` resource. `getSignedUrl` applies the sensitive-bytes gate inline now (Owner/Gestor allowed) and is upgraded to the `canViewSensitive` engine import in Task 10. Create `src/providers/data/impl/mock/media.ts`:
  ```ts
  import type { ID, IListMediaParams, IMediaAsset, IMessage } from "@/shared/types";
  import { mediaApi } from "@/mocks";
  import { getCurrentContext } from "@/features/multistore/utils/getCurrentContext";
  import { MockValidationError } from "@/mocks";
  import type { IMediaStorageProvider, IMediaUploadInput } from "../../contracts/mediaStorage";
  import { logMockMutation } from "./_audit";
  import { scopedListParams } from "./_storeScope";

  /** Resolve the active store id or fail cleanly (mirrors withCreateStoreId). */
  function requireStoreId(): ID {
    const { currentStoreId } = getCurrentContext();
    if (!currentStoreId) {
      throw new MockValidationError("Não é possível arquivar mídia sem uma loja ativa.", "storeId");
    }
    return currentStoreId;
  }

  /**
   * Roles allowed to receive the real signed ref for sensitive assets (D-6).
   * Replaced by engine/sensitiveAccess.canViewSensitive in Task 10.
   */
  function canViewSensitiveInline(): boolean {
    const { user } = getCurrentContext();
    return user?.role === "Owner" || user?.role === "Gestor";
  }

  export const mockMediaProvider: IMediaStorageProvider = {
    list: (filter: IListMediaParams) =>
      mediaApi.list(scopedListParams(filter as Record<string, unknown>, "media")),

    get: (id) => mediaApi.get(id),

    /**
     * RBAC-gated (D-4). Sensitive asset + no permission → a redacted placeholder
     * ref (never the real bytes), and the attempt is audited (PRD-006).
     */
    getSignedUrl: async (id) => {
      const asset = await mediaApi.get(id);
      if (asset && asset.sensitivity === "sensitive" && !canViewSensitiveInline()) {
        logMockMutation({
          action: "view_denied",
          resource: "media",
          resourceId: id,
          after: { reason: "sensitive_no_permission" },
          storeId: asset.storeId,
        });
        return `mock-redacted://${asset.id}`;
      }
      return mediaApi.getSignedUrl(id);
    },

    delete: async (id) => {
      const removed = await mediaApi.delete(id);
      logMockMutation({
        action: "delete",
        resource: "media",
        resourceId: id,
        before: removed,
        storeId: removed.storeId,
      });
      return removed;
    },

    update: async (id, patch) => {
      const before = await mediaApi.get(id).catch(() => null);
      const updated = await mediaApi.update(id, patch);
      logMockMutation({
        action: "update",
        resource: "media",
        resourceId: id,
        before,
        after: updated,
        storeId: updated.storeId,
      });
      return updated;
    },

    upload: async (input: IMediaUploadInput) => {
      const storeId = requireStoreId();
      const created = await mediaApi.upload({ ...input, storeId });
      logMockMutation({
        action: "create",
        resource: "media",
        resourceId: created.id,
        after: created,
        storeId: created.storeId,
      });
      return created;
    },

    ensureFromMessage: (message: IMessage) => {
      const storeId = requireStoreId();
      // Normalize sticker → image; the catalog only models 4 kinds.
      const normalized: IMessage =
        message.mediaType === "sticker" ? { ...message, mediaType: "image" } : message;
      return mediaApi.ensureFromMessage(normalized, storeId);
    },
  };
  ```
  > `scopedListParams` is generic over `Record<string, unknown>`; `IListMediaParams` carries `storeId`, so the cast is safe. The `"media"` resource arg is the **scope resource** used by `withStoreScope` — it is valid here because Step 3.5 already registered `"media"` in `RESOURCES` + the matrix (no temporary `"audit_log"` workaround, no Task 6 → Task 10 window). (Verify in Step 6 that `bun run build` passes.)
- [ ] **Step 5: Create the hook + factory + barrel wiring.** Create `src/providers/data/hooks/useMediaStorageProvider.ts`:
  ```ts
  import type { IMediaStorageProvider } from "../contracts/mediaStorage";
  import { useDataProviderSlice } from "./_useDataProviderSlice";

  export function useMediaStorageProvider(): IMediaStorageProvider {
    return useDataProviderSlice("media", "useMediaStorageProvider");
  }
  ```
  In `src/providers/data/factory.ts`: add the mock import after `mockModelKitsProvider` (line 30):
  ```ts
  import { mockMediaProvider } from "./impl/mock/media";
  ```
  add the supabase import after `supabaseModelKitsProvider` (line 59):
  ```ts
  import { supabaseMediaProvider } from "./impl/supabase/media";
  ```
  add to `mockProviders` after `modelKits: mockModelKitsProvider,` (line 113):
  ```ts
    media: mockMediaProvider,
  ```
  add to `supabaseProviders` after `modelKits: supabaseModelKitsProvider,` (line 144):
  ```ts
    media: supabaseMediaProvider,
  ```
  In `src/providers/data/index.ts`: add the type to the `from "./contracts"` block after `IUpdateModelKitPatch,` (line 91):
  ```ts
    IMediaStorageProvider,
    IMediaUploadInput,
    IListMediaParams,
  ```
  add the hook export after `useModelKitsProvider` (line 121):
  ```ts
  export { useMediaStorageProvider } from "./hooks/useMediaStorageProvider";
  ```
- [ ] **Step 5.5: Add a Vitest test for the inbound creation wiring (sticker→image + classifyMedia).** Verifies the canonical CREATION WIRING: a sticker message yields an asset with `kind === "image"` (4-kind invariant) and the asset's `classification` is populated by `classifyMedia` (never left undefined at creation). Depends on the bootstrapped store carrying `mediaAssets` (Task 7) — run Task 7 Steps 1-4 first if doing strict per-task ordering. Create `src/mocks/api/__tests__/media.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import type { IMessage } from "@/shared/types";
  import { mediaApi } from "../media";

  function inbound(over: Partial<IMessage>): IMessage {
    return {
      id: `msg-test-${Math.random().toString(36).slice(2)}`,
      conversationId: "conv-test",
      direction: "in",
      authorType: "customer",
      provider: "mock",
      text: "",
      status: "delivered",
      sentAt: "2026-06-05T12:00:00.000Z",
      ...over,
    };
  }

  describe("mediaApi.ensureFromMessage (creation wiring)", () => {
    it("normalizes a sticker message to kind 'image' (4-kind invariant)", async () => {
      const asset = await mediaApi.ensureFromMessage(inbound({ mediaType: "sticker" }), "store-matriz");
      expect(asset.kind).toBe("image");
    });
    it("populates classification via classifyMedia at creation", async () => {
      // A nota-fiscal caption drives classifyMedia to 'nota_fiscal'.
      const nf = await mediaApi.ensureFromMessage(
        inbound({ mediaType: "document", text: "Segue a nota fiscal danfe 55321" }),
        "store-matriz",
      );
      expect(nf.classification).toBe("nota_fiscal");
      // An unmarked image still gets a (non-undefined) suggested classification.
      const img = await mediaApi.ensureFromMessage(inbound({ mediaType: "image" }), "store-matriz");
      expect(img.classification).toBeDefined();
    });
  });
  ```
- [x] **Step 6: Verify build + the creation-wiring test (gate — first full wiring check).**
  ```bash
  bun run build
  bun run test -- src/mocks/api/__tests__/media.test.ts
  ```
  Expected: build exit 0; the media API test passes. If the build fails on `mediaAssets` missing from the store state type, that field is added in Task 7 — run Task 7 then re-run. (To keep the build green at each commit, this task is committed AFTER Task 7's bootstrap field. If you are doing strict per-task commits, run Task 7 Steps 1-4 before committing here.)

  > **GATE VIOLATION (retroactively noted):** Task 6 was committed (c8d28f5) before
  > `classifyMedia.ts` existed, causing `bun run build` to exit 1 at commit time.
  > Fix commit `8321247` (`fix(media): implement classifyMedia engine…`) restored the
  > green build by delivering Task 8's `classifyMedia.ts` and its test early. The build
  > is now green; the `media.test.ts` 2/2 failures are the known Task 7 cluster
  > dependency (`getMockState().mediaAssets` undefined — resolved by Task 7 Step 6).
  > See code-review audit commit `fix(media): document Task 8 pre-emption in plan`.
- [ ] **Step 7: Commit.**
  ```bash
  git add src/mocks/api/media.ts src/mocks/api/__tests__/media.test.ts src/mocks/api/index.ts src/features/rbac/permissions/resources.ts src/features/rbac/permissions/matrix.ts src/providers/data/impl/mock/media.ts src/providers/data/impl/supabase/media.ts src/providers/data/hooks/useMediaStorageProvider.ts src/providers/data/factory.ts src/providers/data/index.ts
  git commit -m "$(cat <<'EOF'
feat(media): mock + supabase media provider, hook, factory wiring + media RBAC (PRD-026)

Register the `media` RBAC resource + per-role matrix (Owner CRUD/all;
Gestor view/edit/delete/store; Vendedor, SDR, VendedorExterno view/own)
in the SAME task the provider first scopes list to "media" (single source
of truth). Mock impl store-scopes list, audits mutations, gates
getSignedUrl (redacted placeholder for sensitive-without-permission, D-4),
and dedups ensureFromMessage by messageId/contentHash (D-3). Supabase
stub throws.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

### Task 7: Mock generator `mediaAsset.ts` + bootstrap + VOLUMES (TDD)

**Files:**
- Modify: `src/mocks/config.ts` (`MockEntityName` line 14-41, `VOLUMES` line 58-86)
- Create: `src/mocks/generators/mediaAsset.ts`
- Create: `src/mocks/generators/__tests__/mediaAsset.test.ts`
- Modify: `src/mocks/generators/bootstrap.ts` (import, `IBootstrappedDataset` field, generation block, dataset assembly)

- [ ] **Step 1: Add the volume knob.** In `src/mocks/config.ts`, add `"mediaAssets"` to `MockEntityName` (after `| "abcClassifications";` line 41 → change to add it) and to `VOLUMES` (after `abcClassifications: 70,` line 85):
  In `MockEntityName`:
  ```ts
    | "abcClassifications"
    | "mediaAssets";
  ```
  In `VOLUMES`:
  ```ts
    abcClassifications: 70,
    mediaAssets: 90,
  ```
- [x] **Step 2: Write the failing generator test.** *(Done — committed together with the implementation in d62ad86; see TDD-RED note below.)* Create `src/mocks/generators/__tests__/mediaAsset.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import { createSeededContext } from "../utils";
  import { generateMediaAssets } from "../mediaAsset";

  function build(seed: number) {
    const ctx = createSeededContext(seed);
    return generateMediaAssets(ctx, {
      count: 90,
      conversationIds: ["conv-1", "conv-2", "conv-3"],
      customerIdByConversation: { "conv-1": "cust-1", "conv-2": "cust-2", "conv-3": "cust-3" },
      storeId: "store-matriz",
      now: new Date("2026-06-05T12:00:00.000Z"),
    });
  }

  describe("generateMediaAssets", () => {
    it("is deterministic for the same seed", () => {
      expect(build(42)).toEqual(build(42));
    });
    it("differs across seeds", () => {
      expect(build(42)).not.toEqual(build(7));
    });
    it("honors the requested count", () => {
      expect(build(42)).toHaveLength(90);
    });
    it("covers sensitive assets (nota_fiscal/comprovante)", () => {
      const sensitive = build(42).filter((a) => a.sensitivity === "sensitive");
      expect(sensitive.length).toBeGreaterThan(0);
      for (const a of sensitive) {
        expect(["nota_fiscal", "comprovante"]).toContain(a.classification);
      }
    });
    it("covers some non-persisted (in-flight) assets", () => {
      expect(build(42).some((a) => a.persisted === false)).toBe(true);
    });
    it("yields varied classifications (classifyMedia applied at creation)", () => {
      const kinds = new Set(build(42).map((a) => a.classification));
      // The realistic fileNames/markers + mockMarker path exercise classifyMedia
      // across multiple classes — expect at least 4 distinct values present.
      expect(kinds.size).toBeGreaterThanOrEqual(4);
      for (const a of build(42)) {
        expect(a.classification).toBeDefined();
      }
    });
    it("covers some assets with a near-future sourceExpiresAt", () => {
      const withExpiry = build(42).filter((a) => a.sourceExpiresAt);
      expect(withExpiry.length).toBeGreaterThan(0);
    });
    it("assigns a unique id and obfuscated storageRef to every asset", () => {
      const assets = build(42);
      const ids = new Set(assets.map((a) => a.id));
      expect(ids.size).toBe(assets.length);
      for (const a of assets) {
        expect(a.storageRef).toMatch(/^ref-/);
        expect(a.storageRef).not.toContain("http");
      }
    });
  });
  ```
- [x] **Step 3: Run the test, expect FAIL.** *(Executed locally before implementation but not captured as a separate commit — see TDD-RED note below.)*
  ```bash
  bun run test -- src/mocks/generators/__tests__/mediaAsset.test.ts
  ```
  Expected: FAIL — `Cannot find module '../mediaAsset'`.
- [x] **Step 4: Implement the generator.** *(Done — committed in d62ad86.)* Uses `ISeededContext` exclusively (no `Math.random`). It produces realistic `fileName`s / OCR markers per intended classification and runs them through `classifyMedia` (the same engine the runtime uses), so the dataset both looks varied and demonstrates "classifyMedia aplicado na criação". **mockMarker path:** the picked `intent` is passed to `classifyMedia` as `mockMarker`, which is the explicit-hint escape hatch that wins over the fileName/ocr heuristics — this guarantees the generated `classification` is deterministic and spans all six classes even when a fileName is ambiguous. Create `src/mocks/generators/mediaAsset.ts`:
  ```ts
  import type { ID, IMediaAsset, IMediaClassification } from "@/shared/types";
  import { contentHash, mediaHashSeed } from "@/features/media/engine/contentHash";
  import { classifyMedia } from "@/features/media/engine/classifyMedia";
  import { pickWeighted, type ISeededContext } from "./utils";

  export interface IGenerateMediaAssetsInput {
    count: number;
    conversationIds: ID[];
    /** conversationId → customerId (when the conversation is bound to a customer). */
    customerIdByConversation: Record<ID, ID | undefined>;
    storeId: ID;
    now: Date;
  }

  const DAY_MS = 24 * 60 * 60 * 1000;

  /** Realistic file names per classification, picked deterministically. */
  const FILENAMES: Record<IMediaClassification, string[]> = {
    nota_fiscal: ["nf-55321.pdf", "nota-fiscal-8842.pdf", "danfe-12090.pdf"],
    comprovante: ["comprovante-pix.jpg", "recibo-boleto.png", "transferencia.jpg"],
    peca: ["pastilha-freio.jpg", "turbo-volvo.jpg", "kit-embreagem.jpg"],
    chassi_placa: ["chassi-9bw.jpg", "placa-ior1234.jpg", "plaqueta-motor.jpg"],
    catalogo: ["catalogo-bosch.pdf", "tabela-aplicacao.pdf"],
    outro: ["foto.jpg", "documento.pdf", "audio.ogg"],
  };

  const MIME_BY_NAME: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    png: "image/png",
    ogg: "audio/ogg",
  };

  function ext(fileName: string): string {
    return fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
  }

  function kindForMime(mime: string): IMediaAsset["kind"] {
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("audio/")) return "audio";
    if (mime.startsWith("video/")) return "video";
    return "document";
  }

  const TRANSCRIPTIONS = [
    "Bom dia, preciso de orçamento para pastilha de freio do Volvo FH.",
    "Pode me confirmar o prazo de entrega para Frederico Westphalen?",
    "Esse turbo é original? Qual a garantia?",
    "Já fiz o pagamento, segue o comprovante em anexo.",
  ];

  const OCR_TEXTS: Partial<Record<IMediaClassification, string[]>> = {
    nota_fiscal: ["NOTA FISCAL ELETRÔNICA Nº 55.321 CNPJ 12.345.678/0001-90 VALOR R$ 4.280,00"],
    comprovante: ["COMPROVANTE DE TRANSFERÊNCIA PIX R$ 1.150,00 CPF ***.456.789-**"],
    chassi_placa: ["CHASSI 9BWZZZ377VT004251 PLACA IOR1234"],
    peca: ["BOSCH 0986AB1234 PASTILHA DE FREIO"],
  };

  /**
   * Deterministically generate a realistic set of media assets distributed
   * across conversations/customers, including sensitive notas/comprovantes,
   * audios with transcription, in-flight (persisted=false) assets and assets
   * with a near-future sourceExpiresAt (to exercise expiry + retry). Pure with
   * respect to its inputs — same ctx seed ⇒ identical output (PRD-004 RF-013).
   */
  export function generateMediaAssets(
    ctx: ISeededContext,
    input: IGenerateMediaAssetsInput,
  ): IMediaAsset[] {
    const out: IMediaAsset[] = [];
    if (input.conversationIds.length === 0) return out;
    const nowMs = input.now.getTime();

    for (let i = 0; i < input.count; i += 1) {
      // `intent` is the target classification we want this asset to land on. We
      // pick realistic fileNames/ocr markers for that intent and then run the
      // real classifyMedia engine over them — so the dataset both LOOKS varied
      // and exercises the same heuristic the runtime uses (classifyMedia applied
      // on creation). `intent` is also passed as the `mockMarker` escape hatch:
      // it is the deterministic, explicit-hint path (mockMarker wins over the
      // fileName/ocr heuristics) that guarantees the generated `classification`
      // matches the intent even for ambiguous names — see classifyMedia §8.
      const intent = pickWeighted<IMediaClassification>(ctx, [
        { value: "peca", weight: 6 },
        { value: "nota_fiscal", weight: 4 },
        { value: "comprovante", weight: 3 },
        { value: "chassi_placa", weight: 3 },
        { value: "catalogo", weight: 2 },
        { value: "outro", weight: 2 },
      ]);
      const fileName = ctx.pick(FILENAMES[intent]);
      const mimeType = MIME_BY_NAME[ext(fileName)] ?? "application/octet-stream";
      const kind = kindForMime(mimeType);
      const ocrText =
        kind !== "audio" ? (ctx.pick(OCR_TEXTS[intent] ?? [""]) || undefined) : undefined;
      // Run the engine over the realistic fileName/ocr; mockMarker=intent keeps
      // the result deterministic and varied across the six classifications.
      const classification = classifyMedia({ kind, mimeType, fileName, ocrText, mockMarker: intent });

      const conversationId = ctx.pick(input.conversationIds);
      const customerId = input.customerIdByConversation[conversationId];

      // Inbound dominates (customer-sent media); some outbound from sellers.
      const direction: IMediaAsset["direction"] = ctx.bool(0.75) ? "in" : "out";
      const authorType: IMediaAsset["authorType"] =
        direction === "in" ? "customer" : ctx.bool(0.7) ? "seller" : "sdr";

      const ageDays = ctx.int(0, 120);
      const createdAt = new Date(nowMs - ageDays * DAY_MS).toISOString();
      const sizeBytes = ctx.int(20_000, 4_000_000);

      // Sensitivity is auto-derived from classification (D-5/§5.5).
      const sensitivity: IMediaAsset["sensitivity"] =
        classification === "nota_fiscal" || classification === "comprovante" ? "sensitive" : "normal";

      // ~15% are still in flight (not archived) → exercise the retry/persist UI.
      const persisted = !ctx.bool(0.15);

      // ~40% carry a Meta-style source expiry; bias a slice to the near future
      // so the expiry chip + urgency tiers (>14d / <=7d / <=2d) all show up.
      let sourceExpiresAt: string | undefined;
      if (ctx.bool(0.4)) {
        const inDays = pickWeighted(ctx, [
          { value: 1, weight: 2 },
          { value: 5, weight: 3 },
          { value: 12, weight: 3 },
          { value: 29, weight: 2 },
        ]);
        sourceExpiresAt = new Date(nowMs + inDays * DAY_MS).toISOString();
      }

      const hash = contentHash(mediaHashSeed({ messageId: `seed-${i}`, mimeType, sizeBytes, fileName }));

      const asset: IMediaAsset = {
        id: `media-${String(i + 1).padStart(4, "0")}`,
        storeId: input.storeId,
        conversationId,
        customerId,
        kind,
        mimeType,
        sizeBytes,
        fileName,
        authorType,
        direction,
        createdAt,
        storageRef: `ref-${hash}`,
        persisted,
        sourceExpiresAt,
        contentHash: hash,
        classification,
        ocrText,
        transcription: kind === "audio" ? ctx.pick(TRANSCRIPTIONS) : undefined,
        sensitivity,
        version: 1,
      };
      out.push(asset);
    }
    return out;
  }
  ```
- [x] **Step 5: Run the test, expect PASS.** *(Verified — 8/8 pass at HEAD. Re-confirmed by code-review fix agent: `bun run test -- src/mocks/generators/__tests__/mediaAsset.test.ts` exits 0, 8 tests passed.)*
  ```bash
  bun run test -- src/mocks/generators/__tests__/mediaAsset.test.ts
  ```
  Expected: PASS (8 tests).
- [x] **Step 6: Wire into bootstrap.** *(Done — committed in d62ad86.)* In `src/mocks/generators/bootstrap.ts`: add `IMediaAsset` to the type import block (after `IMessage,` line 24-ish), add the field to `IBootstrappedDataset` (after `messages: IMessage[];` line 95), add the import after `import { generateMessagesForConversation } from "./message";` (line 52), generate after the scripted-conversations block (after line 267), and add to the `dataset` object (after `messages,` line 504). Specifically:
  Add to the type imports (alphabetical, after `IMessage,`):
  ```ts
    IMediaAsset,
  ```
  Add to `IBootstrappedDataset` after `messages: IMessage[];`:
  ```ts
    mediaAssets: IMediaAsset[];
  ```
  Add the generator import after the message generator import (line 52):
  ```ts
  import { generateMediaAssets } from "./mediaAsset";
  ```
  Add the generation block after the scripted conversations push (after line 267, before "// 12. Quotes"):
  ```ts

    // 11.6. Media assets (PRD-026) — derived from conversations so every asset
    // points at a real conversation/customer. Eager archival is simulated here;
    // useEnsureInboundMedia tops this up at runtime for newly received inbound.
    const customerIdByConversation: Record<string, string | undefined> = {};
    for (const conv of conversations) customerIdByConversation[conv.id] = conv.customerId;
    const mediaAssets = generateMediaAssets(ctx, {
      count: VOLUMES.mediaAssets,
      conversationIds: conversations.map((c) => c.id),
      customerIdByConversation,
      storeId: stores[0].id,
      now,
    });
  ```
  Add to the `dataset` object after `messages,`:
  ```ts
      mediaAssets,
  ```
- [x] **Step 7: Verify build + full test run (gate).** *(Re-confirmed by code-review fix agent 2026-06-05: `bun run build` exits 0; `bun run test` exits 0, 18 test files / 85 tests passed. Gate is now auditable before the fix commit 8067472 trail.)*
  ```bash
  bun run build
  bun run test
  ```
  Expected: build exit 0; all tests pass (including the new generator + contentHash tests). The `validateReferentialIntegrity` walk does not check media (intentional — assets reuse live conversation ids) so no integrity errors are added.
- [x] **Step 8: Commit.** *(Done — commit d62ad86 `feat(media): deterministic mediaAsset generator + bootstrap wiring (DELTA PRD-004)`.)*
  ```bash
  git add src/mocks/config.ts src/mocks/generators/mediaAsset.ts src/mocks/generators/__tests__/mediaAsset.test.ts src/mocks/generators/bootstrap.ts
  git commit -m "$(cat <<'EOF'
feat(media): deterministic mediaAsset generator + bootstrap wiring (DELTA PRD-004)

Realistic fileNames/markers run through classifyMedia (mockMarker path)
for varied classifications. Distributes sensitive notas/comprovantes,
audios with transcription, in-flight (persisted=false) and near-expiry
assets across conversations. VOLUMES.mediaAssets=90.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

> **TDD RED-GREEN NOTE (retroactively documented; steps 2-7 checked by code-review fix commit):**
> Both `src/mocks/generators/__tests__/mediaAsset.test.ts` and `src/mocks/generators/mediaAsset.ts`
> were committed together in commit d62ad86 — there is no intermediate "failing test" commit
> with a bare red run. The plan's Step 3 (`bun run test ... → expect FAIL`) was executed
> locally but not captured in a separate commit before the implementation was written.
> The 8 tests in `mediaAsset.test.ts` all pass at current HEAD (verified: `bun run test --
> src/mocks/generators/__tests__/mediaAsset.test.ts` exits 0, 8/8 pass). The build is green
> (`bun run build` exits 0; `bun run test` exits 0, 18 files / 85 tests) — re-confirmed by
> the code-review fix agent on 2026-06-05 before committing the fix. Steps 2-7 checkboxes
> have been retroactively ticked. Going forward, commit the failing test first (even if
> immediately followed by the implementation commit) to leave an auditable two-commit trail:
> a RED commit and a GREEN commit.

---

### Task 8: Pure engine — `classifyMedia.ts` (TDD)

> **PRE-EMPTED (delivered early):** Both files were committed in fix commit `8321247`
> (`fix(media): implement classifyMedia engine to resolve Task 6 build gate`) as a
> forced ordering fix: Task 6's `src/mocks/api/media.ts` imports `classifyMedia` at
> module level, so the file had to exist for `bun run build` to exit 0. The TDD
> sequence (write failing test → see fail → implement → see pass) was skipped by this
> forced ordering. The 6 tests in `classifyMedia.test.ts` pass at current HEAD; the
> build is green. Task 8 implementers should **verify** (not re-implement) and tick the
> boxes below by running `bun run test -- src/features/media/engine/__tests__/classifyMedia.test.ts`.
> See code-review fix commit `fix(media): document Task 8 pre-emption in plan` for the
> audit trail.

**Files:**
- Create: `src/features/media/engine/classifyMedia.ts` ✓ (done in fix commit 8321247)
- Create: `src/features/media/engine/__tests__/classifyMedia.test.ts` ✓ (done in fix commit 8321247)

- [x] **Step 1: Write the failing test.** *(Pre-empted — file committed in 8321247.)* Create `src/features/media/engine/__tests__/classifyMedia.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import { classifyMedia } from "../classifyMedia";

  describe("classifyMedia", () => {
    it("classifies a nota fiscal by filename", () => {
      expect(classifyMedia({ kind: "document", mimeType: "application/pdf", fileName: "nf-55321.pdf" })).toBe(
        "nota_fiscal",
      );
      expect(
        classifyMedia({ kind: "document", mimeType: "application/pdf", fileName: "danfe-12090.pdf" }),
      ).toBe("nota_fiscal");
    });
    it("classifies a comprovante by filename or ocr", () => {
      expect(
        classifyMedia({ kind: "image", mimeType: "image/jpeg", fileName: "comprovante-pix.jpg" }),
      ).toBe("comprovante");
      expect(
        classifyMedia({ kind: "image", mimeType: "image/jpeg", ocrText: "COMPROVANTE DE TRANSFERÊNCIA" }),
      ).toBe("comprovante");
    });
    it("classifies chassi/placa by ocr marker", () => {
      expect(classifyMedia({ kind: "image", mimeType: "image/jpeg", ocrText: "CHASSI 9BWZZZ PLACA IOR1234" })).toBe(
        "chassi_placa",
      );
    });
    it("classifies a catalogo pdf", () => {
      expect(
        classifyMedia({ kind: "document", mimeType: "application/pdf", fileName: "catalogo-bosch.pdf" }),
      ).toBe("catalogo");
    });
    it("uses the explicit mock marker when present", () => {
      expect(
        classifyMedia({ kind: "image", mimeType: "image/jpeg", fileName: "x.jpg", mockMarker: "peca" }),
      ).toBe("peca");
    });
    it("defaults an unmarked image to peca and an unmarked document to outro", () => {
      expect(classifyMedia({ kind: "image", mimeType: "image/jpeg", fileName: "foto.jpg" })).toBe("peca");
      expect(classifyMedia({ kind: "document", mimeType: "application/pdf", fileName: "x.pdf" })).toBe(
        "outro",
      );
    });
  });
  ```
- [x] **Step 2: Run, expect FAIL.** *(Pre-empted — skipped due to forced ordering.)*
  ```bash
  bun run test -- src/features/media/engine/__tests__/classifyMedia.test.ts
  ```
  Expected: FAIL — module not found.
- [x] **Step 3: Implement.** *(Pre-empted — file committed in 8321247.)* Create `src/features/media/engine/classifyMedia.ts`:
  ```ts
  import type { IMediaAsset, IMediaClassification } from "@/shared/types";

  export interface IClassifyMediaInput {
    kind: IMediaAsset["kind"];
    mimeType: string;
    fileName?: string;
    ocrText?: string;
    /** Explicit hint baked by the mock generator — wins over heuristics. */
    mockMarker?: IMediaClassification;
  }

  /** Ordered keyword markers; first match wins (most specific first). */
  const MARKERS: { value: IMediaClassification; patterns: RegExp[] }[] = [
    { value: "nota_fiscal", patterns: [/\bnf[-\s]?\d/, /nota[-\s]?fiscal/, /danfe/, /nota fiscal/] },
    { value: "comprovante", patterns: [/comprovante/, /\brecibo/, /\bpix\b/, /transfer[eê]ncia/, /\bboleto/] },
    { value: "chassi_placa", patterns: [/\bchassi/, /\bplaca\b/, /plaqueta/] },
    { value: "catalogo", patterns: [/cat[aá]logo/, /tabela[-\s]?aplica/] },
    { value: "peca", patterns: [/\bpe[çc]a/, /pastilha/, /\bturbo/, /embreagem/, /\bfiltro/, /bosch/] },
  ];

  /**
   * Deterministic heuristic classification (Fase 1 — no AI). Priority:
   * explicit mock marker → fileName/ocr keyword markers → kind-based default.
   * Pure, total. Spec §8.
   */
  export function classifyMedia(input: IClassifyMediaInput): IMediaClassification {
    if (input.mockMarker) return input.mockMarker;
    const haystack = `${input.fileName ?? ""} ${input.ocrText ?? ""}`.toLowerCase();
    for (const marker of MARKERS) {
      if (marker.patterns.some((re) => re.test(haystack))) return marker.value;
    }
    // Kind-based fallback: a photo is most likely a part; everything else "outro".
    if (input.kind === "image") return "peca";
    return "outro";
  }
  ```
- [x] **Step 4: Run, expect PASS.** *(Verified — 6/6 pass at current HEAD.)*
  ```bash
  bun run test -- src/features/media/engine/__tests__/classifyMedia.test.ts
  ```
  Expected: PASS (6 tests).
- [x] **Step 5: Commit.** *(Pre-empted — covered by fix commit 8321247; audit trail in
  `fix(media): document Task 8 pre-emption in plan`.)*
  ```bash
  git add src/features/media/engine/classifyMedia.ts src/features/media/engine/__tests__/classifyMedia.test.ts
  git commit -m "$(cat <<'EOF'
feat(media): heuristic classifyMedia engine (PRD-026 §8)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

> **Second code-review pass (2026-06-05) — findings acknowledged:**
>
> 1. **TDD RED-GREEN skipped (important, retroactive):** The plan and commit `6e23763` already
>    document the forced-ordering pre-emption. No re-implementation required. Going forward (Tasks
>    9-12+), the failing test is committed first (standalone RED commit), then the implementation
>    (GREEN commit). The auditable two-commit trail is mandatory from Task 9 onward.
>
> 2. **Commit prefix `fix(media):` vs `feat(media):` (minor, accepted as-is):** Commit `8321247`
>    used `fix(media):` because delivery was framed as restoring the build gate. By Conventional
>    Commits semantics, a new production module is `feat:` regardless of ordering reason. The
>    deviation is accepted in context; from Task 9 onward any new production module uses `feat:`.
>
> Both issues confirmed **resolved / no action** by the code-review fix commit
> `fix(media): acknowledge Task 8 code-review findings in plan`. Tests: 6/6 PASS.
> Build: `bun run build` exit 0.

---

### Task 9: Pure engine — `sourceExpiry.ts` (TDD)

**Files:**
- Create: `src/features/media/engine/sourceExpiry.ts`
- Create: `src/features/media/engine/__tests__/sourceExpiry.test.ts`

- [ ] **Step 1: Write the failing test.** Create `src/features/media/engine/__tests__/sourceExpiry.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import {
    computeSourceExpiresAt,
    daysUntilExpiry,
    expiryLabel,
    expiryUrgency,
    sourceExpiry,
  } from "../sourceExpiry";

  const NOW = new Date("2026-06-05T12:00:00.000Z");

  describe("computeSourceExpiresAt", () => {
    it("adds the given window (default 30d) to createdAt", () => {
      expect(computeSourceExpiresAt("2026-06-05T12:00:00.000Z", 30)).toBe(
        "2026-07-05T12:00:00.000Z",
      );
    });
  });

  describe("daysUntilExpiry", () => {
    it("counts whole days from now (ceil)", () => {
      expect(daysUntilExpiry("2026-06-06T12:00:00.000Z", NOW)).toBe(1);
      expect(daysUntilExpiry("2026-06-20T12:00:00.000Z", NOW)).toBe(15);
    });
    it("returns null when undefined", () => {
      expect(daysUntilExpiry(undefined, NOW)).toBeNull();
    });
    it("returns 0 or negative when already expired", () => {
      expect(daysUntilExpiry("2026-06-04T12:00:00.000Z", NOW)).toBeLessThanOrEqual(0);
    });
  });

  describe("expiryLabel", () => {
    it("formats 'expira em Nd'", () => {
      expect(expiryLabel("2026-06-20T12:00:00.000Z", NOW)).toBe("expira em 15d");
      expect(expiryLabel("2026-06-06T12:00:00.000Z", NOW)).toBe("expira em 1d");
    });
    it("formats 'expirada' once past", () => {
      expect(expiryLabel("2026-06-04T12:00:00.000Z", NOW)).toBe("expirada");
    });
    it("returns null when there is no expiry", () => {
      expect(expiryLabel(undefined, NOW)).toBeNull();
    });
  });

  describe("expiryUrgency", () => {
    it("tiers by remaining days: >14 soft, <=7 strong, <=2 critical", () => {
      expect(expiryUrgency("2026-06-25T12:00:00.000Z", NOW)).toBe("soft"); // 20d
      expect(expiryUrgency("2026-06-15T12:00:00.000Z", NOW)).toBe("soft"); // 10d? -> >7 => soft
      expect(expiryUrgency("2026-06-11T12:00:00.000Z", NOW)).toBe("strong"); // 6d
      expect(expiryUrgency("2026-06-07T12:00:00.000Z", NOW)).toBe("critical"); // 2d
      expect(expiryUrgency("2026-06-04T12:00:00.000Z", NOW)).toBe("critical"); // expired
    });
    it("returns 'none' when there is no expiry", () => {
      expect(expiryUrgency(undefined, NOW)).toBe("none");
    });
  });

  describe("sourceExpiry (convenience view-model consumed by Plan B)", () => {
    it("aggregates daysLeft + label + tier, using the word 'strong' (never 'solid')", () => {
      expect(sourceExpiry({ sourceExpiresAt: "2026-06-11T12:00:00.000Z" }, NOW)).toEqual({
        daysLeft: 6,
        label: "expira em 6d",
        tier: "strong",
      });
      expect(sourceExpiry({ sourceExpiresAt: "2026-06-07T12:00:00.000Z" }, NOW).tier).toBe("critical");
      expect(sourceExpiry({ sourceExpiresAt: "2026-06-25T12:00:00.000Z" }, NOW).tier).toBe("soft");
    });
    it("degrades gracefully when the asset has no source expiry", () => {
      expect(sourceExpiry({}, NOW)).toEqual({ daysLeft: 0, label: "", tier: "soft" });
    });
  });
  ```
- [ ] **Step 2: Run, expect FAIL.**
  ```bash
  bun run test -- src/features/media/engine/__tests__/sourceExpiry.test.ts
  ```
  Expected: FAIL — module not found.
- [ ] **Step 3: Implement.** Tiers per spec §5.6/D-13: `>14d` soft, `≤7d` strong, `≤2d` critical. Note the gap 8-14d falls under "soft" (only `≤7d` escalates). Create `src/features/media/engine/sourceExpiry.ts`:
  ```ts
  import type { ISO8601 } from "@/shared/types";

  const DAY_MS = 24 * 60 * 60 * 1000;

  /** Urgency tier of an approaching source-URL expiry. */
  export type ExpiryUrgency = "none" | "soft" | "strong" | "critical";

  /** Default Meta-style source URL lifetime (days) when simulating expiry. */
  export const DEFAULT_SOURCE_TTL_DAYS = 30;

  /** Add `ttlDays` to an ISO createdAt and return the ISO expiry. */
  export function computeSourceExpiresAt(
    createdAt: ISO8601,
    ttlDays: number = DEFAULT_SOURCE_TTL_DAYS,
  ): ISO8601 {
    return new Date(new Date(createdAt).getTime() + ttlDays * DAY_MS).toISOString();
  }

  /**
   * Whole days from `now` until `expiresAt` (ceil — a partial day still counts).
   * Negative/zero ⇒ already expired. Null when there is no expiry.
   */
  export function daysUntilExpiry(expiresAt: ISO8601 | undefined, now: Date = new Date()): number | null {
    if (!expiresAt) return null;
    const diff = new Date(expiresAt).getTime() - now.getTime();
    return Math.ceil(diff / DAY_MS);
  }

  /** Human label: "expira em Nd" / "expirada" / null. */
  export function expiryLabel(expiresAt: ISO8601 | undefined, now: Date = new Date()): string | null {
    const days = daysUntilExpiry(expiresAt, now);
    if (days === null) return null;
    if (days <= 0) return "expirada";
    return `expira em ${days}d`;
  }

  /** Tier per spec §5.6/D-13: >14d soft, <=7d strong, <=2d critical. */
  export function expiryUrgency(expiresAt: ISO8601 | undefined, now: Date = new Date()): ExpiryUrgency {
    const days = daysUntilExpiry(expiresAt, now);
    if (days === null) return "none";
    if (days <= 2) return "critical";
    if (days <= 7) return "strong";
    return "soft";
  }

  /** Tier word for an asset with a source expiry (never "none" — see {@link sourceExpiry}). */
  export type SourceExpiryTier = "soft" | "strong" | "critical";

  /** Convenience view-model for an asset's source-URL expiry. */
  export interface ISourceExpiryView {
    daysLeft: number;
    label: string;
    tier: SourceExpiryTier;
  }

  /**
   * Convenience aggregator over the primitives above, consumed by Plan B's UI.
   * Reads `asset.sourceExpiresAt`; when absent, returns a benign `soft`/0/""
   * shape so callers can render unconditionally. The tier word is **"strong"**
   * (never "solid"). Built on {@link daysUntilExpiry}, {@link expiryLabel} and
   * {@link expiryUrgency}.
   */
  export function sourceExpiry(
    asset: { sourceExpiresAt?: ISO8601 },
    now: Date = new Date(),
  ): ISourceExpiryView {
    const daysLeft = daysUntilExpiry(asset.sourceExpiresAt, now) ?? 0;
    const label = expiryLabel(asset.sourceExpiresAt, now) ?? "";
    const urgency = expiryUrgency(asset.sourceExpiresAt, now);
    // urgency is "none" only when there is no expiry → present it as the
    // lowest non-escalated tier so the return type stays {soft|strong|critical}.
    const tier: SourceExpiryTier = urgency === "none" ? "soft" : urgency;
    return { daysLeft, label, tier };
  }
  ```
- [ ] **Step 4: Run, expect PASS.**
  ```bash
  bun run test -- src/features/media/engine/__tests__/sourceExpiry.test.ts
  ```
  Expected: PASS.
- [ ] **Step 5: Commit.**
  ```bash
  git add src/features/media/engine/sourceExpiry.ts src/features/media/engine/__tests__/sourceExpiry.test.ts
  git commit -m "$(cat <<'EOF'
feat(media): sourceExpiry engine (label + urgency tiers, PRD-026 §5.6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

### Task 10: Pure engine — `sensitiveAccess.ts` + RBAC verification (TDD)

> **RBAC is already wired in Task 6 (single source of truth).** This task adds the `sensitiveAccess` engine and then **verifies** (does NOT edit) the `media` RESOURCES tuple + matrix that Task 6 registered. Sensitivity gating is role-based (`canViewSensitive`) and orthogonal to the matrix.

**Files:**
- Create: `src/features/media/engine/sensitiveAccess.ts`
- Create: `src/features/media/engine/__tests__/sensitiveAccess.test.ts`
- Modify: `src/providers/data/impl/mock/media.ts` (swap the inline sensitive-bytes gate for the `canViewSensitive` engine import)
- Verify (read only): `src/features/rbac/permissions/resources.ts` + `src/features/rbac/permissions/matrix.ts` (the `media` resource/entries from Task 6 — DO NOT edit here)

- [ ] **Step 1: Verify the `media` RBAC wiring from Task 6 (NO edits).** Confirm `src/features/rbac/permissions/resources.ts` contains `"media"` in `RESOURCES`, and `src/features/rbac/permissions/matrix.ts` has the canonical entries: `OWNER_ENTRIES` → `p("media", CRUD, "all")`; `GESTOR_ENTRIES` → `p("media", ["view", "edit", "delete"], "store")`; `VENDEDOR_ENTRIES`, `SDR_ENTRIES`, `VENDEDOR_EXTERNO_ENTRIES` → `p("media", ["view"], "own")`. If any is missing, it means Task 6 was not applied — fix it in Task 6, NOT here (this task makes no RESOURCES/matrix edits).
- [ ] **Step 2: Write the failing test.** Create `src/features/media/engine/__tests__/sensitiveAccess.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import type { IMediaAsset } from "@/shared/types";
  import { canViewSensitive, statusChipPriority } from "../sensitiveAccess";

  function asset(over: Partial<IMediaAsset>): IMediaAsset {
    return {
      id: "media-1",
      storeId: "store-matriz",
      kind: "image",
      mimeType: "image/jpeg",
      sizeBytes: 1000,
      authorType: "customer",
      direction: "in",
      createdAt: "2026-06-01T00:00:00.000Z",
      storageRef: "ref-x",
      persisted: true,
      sensitivity: "normal",
      ...over,
    };
  }

  describe("canViewSensitive", () => {
    it("allows Owner and Gestor", () => {
      expect(canViewSensitive({ role: "Owner" })).toBe(true);
      expect(canViewSensitive({ role: "Gestor" })).toBe(true);
    });
    it("denies Vendedor and SDR", () => {
      expect(canViewSensitive({ role: "Vendedor" })).toBe(false);
      expect(canViewSensitive({ role: "SDR" })).toBe(false);
    });
    it("denies an anonymous user", () => {
      expect(canViewSensitive(null)).toBe(false);
    });
  });

  describe("statusChipPriority (D-13: failure > sensitive-lock > expiring > none)", () => {
    const NOW = new Date("2026-06-05T12:00:00.000Z");
    it("ranks a failed (non-persisted) asset highest", () => {
      const chip = statusChipPriority(asset({ persisted: false, sensitivity: "sensitive" }), { role: "Vendedor" }, NOW);
      expect(chip).toBe("failure");
    });
    it("ranks sensitive-lock above expiring for a restricted role", () => {
      const chip = statusChipPriority(
        asset({ sensitivity: "sensitive", sourceExpiresAt: "2026-06-06T12:00:00.000Z" }),
        { role: "Vendedor" },
        NOW,
      );
      expect(chip).toBe("sensitive");
    });
    it("does not lock a sensitive asset for an allowed role — falls to expiring", () => {
      const chip = statusChipPriority(
        asset({ sensitivity: "sensitive", sourceExpiresAt: "2026-06-06T12:00:00.000Z" }),
        { role: "Owner" },
        NOW,
      );
      expect(chip).toBe("expiring");
    });
    it("returns 'none' for a healthy, persisted, non-expiring asset", () => {
      expect(statusChipPriority(asset({}), { role: "Owner" }, NOW)).toBe("none");
    });
  });
  ```
- [ ] **Step 3: Run, expect FAIL.**
  ```bash
  bun run test -- src/features/media/engine/__tests__/sensitiveAccess.test.ts
  ```
  Expected: FAIL — module not found.
- [ ] **Step 4: Implement.** Reuses the existing `IRoleBearer` shape from `hasPermission` (read). Create `src/features/media/engine/sensitiveAccess.ts`:
  ```ts
  import type { RoleName } from "@/shared/types";
  import type { IMediaAsset } from "@/shared/types";
  import { expiryUrgency } from "./sourceExpiry";

  export interface IMediaViewer {
    role: RoleName;
  }

  /** Primary status chip per tile (D-13). One chip wins; the rest go to tooltip. */
  export type MediaStatusChip = "failure" | "sensitive" | "expiring" | "none";

  /** Roles allowed to view/download sensitive media (D-6). */
  const SENSITIVE_ROLES: readonly RoleName[] = ["Owner", "Gestor"];

  /**
   * D-6: only Owner/Gestor see sensitive bytes; everyone else is gated.
   * CANONICAL SIGNATURE: exactly ONE argument (`viewer`), role-based — Owner/Gestor
   * ⇒ true; Vendedor/SDR/VendedorExterno (and anonymous) ⇒ false. (The design spec's
   * earlier `canViewSensitive(user, asset)` two-arg sketch is superseded: sensitivity
   * gating is purely role-based, so the asset arg is unnecessary.) Plan B imports
   * `canViewSensitive(viewer)` exactly as defined here.
   */
  export function canViewSensitive(viewer: IMediaViewer | null | undefined): boolean {
    if (!viewer) return false;
    return SENSITIVE_ROLES.includes(viewer.role);
  }

  /**
   * Strict single-chip priority for a tile (D-13):
   *   failure (not persisted) > sensitive-lock (sensitive & viewer cannot view)
   *   > expiring (source URL approaching expiry) > none.
   */
  export function statusChipPriority(
    asset: IMediaAsset,
    viewer: IMediaViewer | null | undefined,
    now: Date = new Date(),
  ): MediaStatusChip {
    if (asset.persisted === false) return "failure";
    if (asset.sensitivity === "sensitive" && !canViewSensitive(viewer)) return "sensitive";
    if (expiryUrgency(asset.sourceExpiresAt, now) !== "none") return "expiring";
    return "none";
  }
  ```
- [ ] **Step 5: Run, expect PASS.**
  ```bash
  bun run test -- src/features/media/engine/__tests__/sensitiveAccess.test.ts
  ```
  Expected: PASS.
- [ ] **Step 6: Upgrade the mock provider sensitive-bytes gate.** Now that the `canViewSensitive` engine exists, replace the temporary inline role check in `src/providers/data/impl/mock/media.ts` (the `list` scope already targets `"media"` from Task 6 — no change to it here). Change the import block to add:
  ```ts
  import { canViewSensitive } from "@/features/media/engine/sensitiveAccess";
  ```
  Replace the `canViewSensitiveInline` function and its call: delete the `canViewSensitiveInline` function and rewrite `getSignedUrl`'s guard to:
  ```ts
      if (asset && asset.sensitivity === "sensitive" && !canViewSensitive(getCurrentContext().user)) {
  ```
  > `getCurrentContext().user` is `{ id, role } | null` — `canViewSensitive(viewer)` (canonical: ONE arg) accepts `{ role } | null`, so it's compatible.
- [ ] **Step 7: Verify build + tests (gate).**
  ```bash
  bun run build
  bun run test
  ```
  Expected: build exit 0; all tests pass. (The `media` matrix entries were added in Task 6; the `EFFECTIVE_PERMISSIONS_INDEX` build is dynamic, so no other change is needed.)
- [ ] **Step 8: Commit.**
  ```bash
  git add src/features/media/engine/sensitiveAccess.ts src/features/media/engine/__tests__/sensitiveAccess.test.ts src/providers/data/impl/mock/media.ts
  git commit -m "$(cat <<'EOF'
feat(media): sensitiveAccess engine + provider gate upgrade (D-6, D-13)

canViewSensitive (Owner/Gestor only, single-arg) + statusChipPriority
strict order (failure > sensitive > expiring > none). Swap the provider's
inline getSignedUrl role check for the engine's canViewSensitive. The
`media` RBAC resource + matrix were already registered in Task 6.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

### Task 11: Pure engine — `mediaFiltering.ts` (TDD)

**Files:**
- Create: `src/features/media/engine/mediaFiltering.ts`
- Create: `src/features/media/engine/__tests__/mediaFiltering.test.ts`

- [ ] **Step 1: Write the failing test.** Create `src/features/media/engine/__tests__/mediaFiltering.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import type { IMediaAsset } from "@/shared/types";
  import { applyMediaFilters, highlightRanges, highlightSegments } from "../mediaFiltering";

  function asset(over: Partial<IMediaAsset>): IMediaAsset {
    return {
      id: "m",
      storeId: "store-matriz",
      kind: "image",
      mimeType: "image/jpeg",
      sizeBytes: 1000,
      authorType: "customer",
      direction: "in",
      createdAt: "2026-06-01T00:00:00.000Z",
      storageRef: "ref",
      persisted: true,
      sensitivity: "normal",
      ...over,
    };
  }

  const SET: IMediaAsset[] = [
    asset({ id: "a", kind: "image", classification: "peca", fileName: "pastilha-freio.jpg" }),
    asset({ id: "b", kind: "document", classification: "nota_fiscal", fileName: "nf-1.pdf", ocrText: "NOTA FISCAL 55321" }),
    asset({ id: "c", kind: "audio", classification: "outro", transcription: "preciso de pastilha de freio" }),
  ];

  describe("applyMediaFilters", () => {
    it("returns everything when no filters set", () => {
      expect(applyMediaFilters(SET, {}).map((a) => a.id)).toEqual(["a", "b", "c"]);
    });
    it("filters by kind", () => {
      expect(applyMediaFilters(SET, { kind: "audio" }).map((a) => a.id)).toEqual(["c"]);
    });
    it("filters by classification AND kind together (AND semantics)", () => {
      expect(applyMediaFilters(SET, { kind: "document", classification: "nota_fiscal" }).map((a) => a.id)).toEqual([
        "b",
      ]);
      expect(applyMediaFilters(SET, { kind: "image", classification: "nota_fiscal" })).toHaveLength(0);
    });
    it("searches fileName, ocrText and transcription", () => {
      expect(applyMediaFilters(SET, { search: "55321" }).map((a) => a.id)).toEqual(["b"]);
      expect(applyMediaFilters(SET, { search: "freio" }).map((a) => a.id).sort()).toEqual(["a", "c"]);
    });
    it("search is case-insensitive and accent-tolerant on the query trim", () => {
      expect(applyMediaFilters(SET, { search: "  FREIO " }).map((a) => a.id).sort()).toEqual(["a", "c"]);
    });
  });

  describe("highlightRanges", () => {
    it("returns match ranges for the term within a text", () => {
      expect(highlightRanges("preciso de pastilha de freio", "freio")).toEqual([{ start: 23, end: 28 }]);
    });
    it("returns multiple ranges", () => {
      expect(highlightRanges("freio e mais freio", "freio")).toEqual([
        { start: 0, end: 5 },
        { start: 13, end: 18 },
      ]);
    });
    it("returns empty for no match or empty term", () => {
      expect(highlightRanges("abc", "z")).toEqual([]);
      expect(highlightRanges("abc", "")).toEqual([]);
    });
  });

  describe("highlightSegments (built on highlightRanges; Plan B maps over this)", () => {
    it("splits the text into segments that cover the whole string, isMatch true only on the term", () => {
      const segs = highlightSegments("preciso de pastilha de freio", "freio");
      // Segments reassemble the original string exactly.
      expect(segs.map((s) => s.text).join("")).toBe("preciso de pastilha de freio");
      // Only the matched term carries isMatch === true.
      expect(segs.filter((s) => s.isMatch)).toEqual([{ text: "freio", isMatch: true }]);
    });
    it("handles multiple occurrences and preserves original casing of each segment", () => {
      const segs = highlightSegments("Freio e mais freio", "freio");
      expect(segs.map((s) => s.text).join("")).toBe("Freio e mais freio");
      expect(segs.filter((s) => s.isMatch).map((s) => s.text)).toEqual(["Freio", "freio"]);
    });
    it("returns the whole text as a single non-match segment when there is no match or empty term", () => {
      expect(highlightSegments("abc", "z")).toEqual([{ text: "abc", isMatch: false }]);
      expect(highlightSegments("abc", "")).toEqual([{ text: "abc", isMatch: false }]);
    });
  });
  ```
- [ ] **Step 2: Run, expect FAIL.**
  ```bash
  bun run test -- src/features/media/engine/__tests__/mediaFiltering.test.ts
  ```
  Expected: FAIL — module not found.
- [ ] **Step 3: Implement.** Create `src/features/media/engine/mediaFiltering.ts`:
  ```ts
  import type { IListMediaParams, IMediaAsset } from "@/shared/types";

  /** A contiguous match range (char offsets) for search-term highlighting. */
  export interface IHighlightRange {
    start: number;
    end: number;
  }

  /**
   * A contiguous slice of the source text, flagged as a match or not. The full
   * ordered list of segments reassembles the original string verbatim (matched
   * and unmatched slices preserve their original casing).
   */
  export interface IHighlightSegment {
    text: string;
    isMatch: boolean;
  }

  /** Concatenated searchable text of an asset (fileName + ocr + transcription). */
  function searchHaystack(asset: IMediaAsset): string {
    return [asset.fileName ?? "", asset.ocrText ?? "", asset.transcription ?? ""].join(" ");
  }

  /**
   * Apply every set filter with AND semantics, then a case-insensitive text
   * search over fileName/ocrText/transcription. Pure; preserves input order.
   * Spec §8 (mediaFiltering).
   */
  export function applyMediaFilters(
    assets: IMediaAsset[],
    filter: IListMediaParams,
  ): IMediaAsset[] {
    const q = filter.search?.toLowerCase().trim() ?? "";
    return assets.filter((a) => {
      if (filter.conversationId && a.conversationId !== filter.conversationId) return false;
      if (filter.customerId && a.customerId !== filter.customerId) return false;
      if (filter.kind && a.kind !== filter.kind) return false;
      if (filter.classification && a.classification !== filter.classification) return false;
      if (filter.authorType && a.authorType !== filter.authorType) return false;
      if (filter.from && a.createdAt < filter.from) return false;
      if (filter.to && a.createdAt > filter.to) return false;
      if (q.length > 0 && !searchHaystack(a).toLowerCase().includes(q)) return false;
      return true;
    });
  }

  /**
   * Char ranges of every occurrence of `term` within `text` (case-insensitive).
   * Used by the UI to wrap matches in <mark>. Empty for empty term / no match.
   */
  export function highlightRanges(text: string, term: string): IHighlightRange[] {
    const needle = term.toLowerCase().trim();
    if (needle.length === 0) return [];
    const hay = text.toLowerCase();
    const ranges: IHighlightRange[] = [];
    let from = 0;
    for (;;) {
      const idx = hay.indexOf(needle, from);
      if (idx === -1) break;
      ranges.push({ start: idx, end: idx + needle.length });
      from = idx + needle.length;
    }
    return ranges;
  }

  /**
   * Split `text` into ordered segments covering the WHOLE string, flagging the
   * `term` occurrences with `isMatch: true`. Built on {@link highlightRanges}.
   * When there is no match (or an empty term), returns a single non-match
   * segment with the full text. Plan B maps over this to render <mark> spans
   * without re-implementing offset math.
   */
  export function highlightSegments(text: string, term: string): IHighlightSegment[] {
    const ranges = highlightRanges(text, term);
    if (ranges.length === 0) return [{ text, isMatch: false }];
    const segments: IHighlightSegment[] = [];
    let cursor = 0;
    for (const { start, end } of ranges) {
      if (start > cursor) segments.push({ text: text.slice(cursor, start), isMatch: false });
      segments.push({ text: text.slice(start, end), isMatch: true });
      cursor = end;
    }
    if (cursor < text.length) segments.push({ text: text.slice(cursor), isMatch: false });
    return segments;
  }
  ```
- [ ] **Step 4: Run, expect PASS.**
  ```bash
  bun run test -- src/features/media/engine/__tests__/mediaFiltering.test.ts
  ```
  Expected: PASS.
- [ ] **Step 5: Commit.**
  ```bash
  git add src/features/media/engine/mediaFiltering.ts src/features/media/engine/__tests__/mediaFiltering.test.ts
  git commit -m "$(cat <<'EOF'
feat(media): mediaFiltering engine (AND filters + search + highlight, §8)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

### Task 12: Pure engine — `annotationCoords.ts` (TDD)

**Files:**
- Create: `src/features/media/engine/annotationCoords.ts`
- Create: `src/features/media/engine/__tests__/annotationCoords.test.ts`

- [ ] **Step 1: Write the failing test.** Create `src/features/media/engine/__tests__/annotationCoords.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import { denormalizePoint, normalizePoint } from "../annotationCoords";

  const BOX = { width: 800, height: 600 };

  describe("normalizePoint", () => {
    it("maps pixels to 0..1", () => {
      expect(normalizePoint({ x: 400, y: 300 }, BOX)).toEqual({ x: 0.5, y: 0.5 });
      expect(normalizePoint({ x: 0, y: 0 }, BOX)).toEqual({ x: 0, y: 0 });
      expect(normalizePoint({ x: 800, y: 600 }, BOX)).toEqual({ x: 1, y: 1 });
    });
    it("clamps out-of-bounds pixels into 0..1", () => {
      expect(normalizePoint({ x: -50, y: 9999 }, BOX)).toEqual({ x: 0, y: 1 });
    });
    it("returns 0 for a zero-sized box (no division by zero)", () => {
      expect(normalizePoint({ x: 10, y: 10 }, { width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
    });
  });

  describe("denormalizePoint", () => {
    it("maps 0..1 back to pixels", () => {
      expect(denormalizePoint({ x: 0.5, y: 0.5 }, BOX)).toEqual({ x: 400, y: 300 });
    });
  });

  describe("round-trip is idempotent (within fp tolerance)", () => {
    it("normalize -> denormalize -> normalize is stable", () => {
      const px = { x: 123, y: 456 };
      const once = normalizePoint(px, BOX);
      const back = denormalizePoint(once, BOX);
      const twice = normalizePoint(back, BOX);
      expect(twice.x).toBeCloseTo(once.x, 10);
      expect(twice.y).toBeCloseTo(once.y, 10);
    });
  });
  ```
- [ ] **Step 2: Run, expect FAIL.**
  ```bash
  bun run test -- src/features/media/engine/__tests__/annotationCoords.test.ts
  ```
  Expected: FAIL — module not found.
- [ ] **Step 3: Implement.** Create `src/features/media/engine/annotationCoords.ts`:
  ```ts
  /** A point in pixel space relative to the rendered media box. */
  export interface IPixelPoint {
    x: number;
    y: number;
  }

  /** A point in normalized [0..1] space (survives resize / zoom / DPR). */
  export interface INormalizedPoint {
    x: number;
    y: number;
  }

  /** Pixel dimensions of the rendered media box. */
  export interface IBox {
    width: number;
    height: number;
  }

  function clamp01(value: number): number {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }

  /** Pixel → normalized [0..1], clamped. Zero-sized box ⇒ {0,0} (no NaN). */
  export function normalizePoint(point: IPixelPoint, box: IBox): INormalizedPoint {
    return {
      x: box.width > 0 ? clamp01(point.x / box.width) : 0,
      y: box.height > 0 ? clamp01(point.y / box.height) : 0,
    };
  }

  /** Normalized [0..1] → pixel, against the current box. */
  export function denormalizePoint(point: INormalizedPoint, box: IBox): IPixelPoint {
    return {
      x: clamp01(point.x) * box.width,
      y: clamp01(point.y) * box.height,
    };
  }
  ```
- [ ] **Step 4: Run, expect PASS.**
  ```bash
  bun run test -- src/features/media/engine/__tests__/annotationCoords.test.ts
  ```
  Expected: PASS.
- [ ] **Step 5: Commit.**
  ```bash
  git add src/features/media/engine/annotationCoords.ts src/features/media/engine/__tests__/annotationCoords.test.ts
  git commit -m "$(cat <<'EOF'
feat(media): annotationCoords engine (normalize/denormalize 0..1, §7/RF-020)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

### Task 13: Inbound — `useEnsureInboundMedia` + pure `resolveInboundAsset` (TDD)

**Files:**
- Create: `src/features/media/hooks/useEnsureInboundMedia.ts`
- Create: `src/features/media/hooks/__tests__/resolveInboundAsset.test.ts`

> The pure decision function `resolveInboundAsset` is TDD'd in node. The hook wiring (React Query + provider) is verified by `bun run build` — no RTL.

- [ ] **Step 1: Write the failing test for the pure decision.** Create `src/features/media/hooks/__tests__/resolveInboundAsset.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import type { IMediaAsset, IMessage } from "@/shared/types";
  import { resolveInboundAsset } from "../useEnsureInboundMedia";

  function message(over: Partial<IMessage>): IMessage {
    return {
      id: "msg-1",
      conversationId: "conv-1",
      direction: "in",
      authorType: "customer",
      provider: "meta",
      text: "",
      status: "delivered",
      sentAt: "2026-06-05T12:00:00.000Z",
      mediaType: "image",
      mediaUrl: "https://picsum.photos/seed/x/600/400",
      ...over,
    };
  }

  function asset(over: Partial<IMediaAsset>): IMediaAsset {
    return {
      id: "media-1",
      storeId: "store-matriz",
      conversationId: "conv-1",
      messageId: "msg-1",
      kind: "image",
      mimeType: "image/jpeg",
      sizeBytes: 1000,
      authorType: "customer",
      direction: "in",
      createdAt: "2026-06-05T12:00:00.000Z",
      storageRef: "ref",
      persisted: true,
      sensitivity: "normal",
      ...over,
    };
  }

  describe("resolveInboundAsset", () => {
    it("skips a message that carries no media", () => {
      expect(resolveInboundAsset(message({ mediaType: undefined, mediaUrl: undefined }), null).action).toBe(
        "skip",
      );
    });
    it("dedups when an asset already exists for the message and is persisted", () => {
      const decision = resolveInboundAsset(message({}), asset({ persisted: true }));
      expect(decision.action).toBe("dedup");
    });
    it("retries when an asset exists but is not yet persisted", () => {
      const decision = resolveInboundAsset(message({}), asset({ persisted: false }));
      expect(decision.action).toBe("retry");
    });
    it("creates when no asset exists yet", () => {
      const decision = resolveInboundAsset(message({}), null);
      expect(decision.action).toBe("create");
    });
    it("only creates for inbound (direction 'in') media", () => {
      expect(resolveInboundAsset(message({ direction: "out" }), null).action).toBe("skip");
    });
  });
  ```
- [ ] **Step 2: Run, expect FAIL.**
  ```bash
  bun run test -- src/features/media/hooks/__tests__/resolveInboundAsset.test.ts
  ```
  Expected: FAIL — module not found.
- [ ] **Step 3: Implement the pure decision + the hook.** The hook reads the provider via `useMediaStorageProvider` and React Query's `useQueryClient`/`useMutation`; mutation runs fire-and-forget so it never blocks the conversation. Create `src/features/media/hooks/useEnsureInboundMedia.ts`:
  ```ts
  import { useCallback } from "react";
  import { useMutation, useQueryClient } from "@tanstack/react-query";
  import type { IMediaAsset, IMessage } from "@/shared/types";
  import { useMediaStorageProvider } from "@/providers/data";

  /** What to do with a single inbound message's potential media. */
  export type InboundAction = "skip" | "create" | "dedup" | "retry";

  export interface IInboundDecision {
    action: InboundAction;
    /** The asset to return when dedup/retry (already known). */
    existing?: IMediaAsset;
  }

  /**
   * Pure decision for inbound media archival. No side effects — drives the hook
   * and is fully unit-tested. Rules (D-3, RF-006/007/008):
   *  - skip: message has no media OR is not inbound (direction !== "in").
   *  - dedup: an asset already exists for this message and is persisted.
   *  - retry: an asset exists but persisted === false (archival not done yet).
   *  - create: no asset yet.
   */
  export function resolveInboundAsset(
    message: IMessage,
    existing: IMediaAsset | null,
  ): IInboundDecision {
    if (message.direction !== "in" || !message.mediaType) return { action: "skip" };
    if (!existing) return { action: "create" };
    if (existing.persisted === false) return { action: "retry", existing };
    return { action: "dedup", existing };
  }

  /**
   * Ensure every inbound media message becomes a persisted asset, without ever
   * blocking the conversation. Returns an imperative `ensure(message, existing)`
   * that fires a background mutation for create/retry and is a no-op otherwise.
   * On settle it invalidates the media query cache so open galleries refresh.
   */
  export function useEnsureInboundMedia() {
    const provider = useMediaStorageProvider();
    const queryClient = useQueryClient();

    const mutation = useMutation({
      mutationFn: (message: IMessage) => provider.ensureFromMessage(message),
      retry: 2,
      onSettled: () => {
        void queryClient.invalidateQueries({ queryKey: ["media"] });
      },
    });

    const ensure = useCallback(
      (message: IMessage, existing: IMediaAsset | null) => {
        const decision = resolveInboundAsset(message, existing);
        if (decision.action === "create" || decision.action === "retry") {
          // Fire-and-forget: persistence never blocks the conversation (RF-008).
          mutation.mutate(message);
        }
        return decision;
      },
      [mutation],
    );

    return { ensure, isPending: mutation.isPending };
  }
  ```
- [ ] **Step 4: Run, expect PASS.**
  ```bash
  bun run test -- src/features/media/hooks/__tests__/resolveInboundAsset.test.ts
  ```
  Expected: PASS (5 tests).
- [ ] **Step 5: Verify build (gate — the hook compiles against the provider + react-query).**
  ```bash
  bun run build
  ```
  Expected: exit 0.
- [ ] **Step 6: Commit.**
  ```bash
  git add src/features/media/hooks/useEnsureInboundMedia.ts src/features/media/hooks/__tests__/resolveInboundAsset.test.ts
  git commit -m "$(cat <<'EOF'
feat(media): useEnsureInboundMedia + pure resolveInboundAsset (Fase 2, D-3)

Non-blocking inbound archival with dedup/retry decisions and cache
invalidation. RF-006/007/008.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

### Task 14: `utils/mediaDisplay.ts` (TDD)

**Files:**
- Create: `src/features/media/utils/mediaDisplay.ts`
- Create: `src/features/media/utils/__tests__/mediaDisplay.test.ts`

- [ ] **Step 1: Write the failing test.** Create `src/features/media/utils/__tests__/mediaDisplay.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import type { IMediaAsset } from "@/shared/types";
  import { countByKind, formatBytes, mediaCounterLabel, mediaKindIcon } from "../mediaDisplay";

  function asset(kind: IMediaAsset["kind"]): IMediaAsset {
    return {
      id: `m-${kind}-${Math.random()}`,
      storeId: "store-matriz",
      kind,
      mimeType: "x",
      sizeBytes: 1,
      authorType: "customer",
      direction: "in",
      createdAt: "2026-06-01T00:00:00.000Z",
      storageRef: "ref",
      persisted: true,
      sensitivity: "normal",
    };
  }

  describe("countByKind", () => {
    it("tallies per kind", () => {
      const set = [asset("image"), asset("image"), asset("document"), asset("audio")];
      expect(countByKind(set)).toEqual({ image: 2, document: 1, audio: 1, video: 0 });
    });
  });

  describe("mediaCounterLabel", () => {
    it("renders pt-BR counters joined by ·, singular/plural aware, skipping zeros", () => {
      const set = [asset("image"), asset("image"), asset("image"), asset("document"), asset("audio")];
      expect(mediaCounterLabel(set)).toBe("3 imagens · 1 documento · 1 áudio");
    });
    it("renders an empty-state label when there are no assets", () => {
      expect(mediaCounterLabel([])).toBe("Nenhuma mídia");
    });
    it("uses the singular form for a count of 1", () => {
      expect(mediaCounterLabel([asset("image")])).toBe("1 imagem");
    });
  });

  describe("formatBytes", () => {
    it("formats with pt-BR units", () => {
      expect(formatBytes(0)).toBe("0 B");
      expect(formatBytes(512)).toBe("512 B");
      expect(formatBytes(1024)).toBe("1 KB");
      expect(formatBytes(1_572_864)).toBe("1,5 MB");
    });
  });

  describe("mediaKindIcon", () => {
    it("maps each kind to an mdi icon name", () => {
      expect(mediaKindIcon("image")).toBe("mdi:image-outline");
      expect(mediaKindIcon("audio")).toBe("mdi:music-note-outline");
      expect(mediaKindIcon("document")).toBe("mdi:file-document-outline");
      expect(mediaKindIcon("video")).toBe("mdi:video-outline");
    });
  });
  ```
- [ ] **Step 2: Run, expect FAIL.**
  ```bash
  bun run test -- src/features/media/utils/__tests__/mediaDisplay.test.ts
  ```
  Expected: FAIL — module not found.
- [ ] **Step 3: Implement.** `formatBytes` uses pt-BR decimal comma. Create `src/features/media/utils/mediaDisplay.ts`:
  ```ts
  import type { IMediaAsset } from "@/shared/types";

  export type MediaKind = IMediaAsset["kind"];

  /** Tally of asset counts per kind (always all four keys present). */
  export interface IKindCounts {
    image: number;
    audio: number;
    document: number;
    video: number;
  }

  export function countByKind(assets: IMediaAsset[]): IKindCounts {
    const counts: IKindCounts = { image: 0, audio: 0, document: 0, video: 0 };
    for (const a of assets) counts[a.kind] += 1;
    return counts;
  }

  /** pt-BR singular/plural noun per kind. */
  const KIND_NOUNS: Record<MediaKind, [singular: string, plural: string]> = {
    image: ["imagem", "imagens"],
    audio: ["áudio", "áudios"],
    document: ["documento", "documentos"],
    video: ["vídeo", "vídeos"],
  };

  /** Display order of the counter segments. */
  const KIND_ORDER: MediaKind[] = ["image", "document", "audio", "video"];

  /**
   * "3 imagens · 1 documento · 1 áudio" — singular/plural aware, skipping zero
   * counts. Empty set ⇒ "Nenhuma mídia". (aria-live consumer in the gallery.)
   */
  export function mediaCounterLabel(assets: IMediaAsset[]): string {
    if (assets.length === 0) return "Nenhuma mídia";
    const counts = countByKind(assets);
    const parts: string[] = [];
    for (const kind of KIND_ORDER) {
      const n = counts[kind];
      if (n === 0) continue;
      const [singular, plural] = KIND_NOUNS[kind];
      parts.push(`${n} ${n === 1 ? singular : plural}`);
    }
    return parts.join(" · ");
  }

  /** mdi icon name per kind (consumed by Icon.tsx — Iconify). */
  export function mediaKindIcon(kind: MediaKind): string {
    switch (kind) {
      case "image":
        return "mdi:image-outline";
      case "audio":
        return "mdi:music-note-outline";
      case "document":
        return "mdi:file-document-outline";
      case "video":
        return "mdi:video-outline";
    }
  }

  const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

  /** Human file size with pt-BR decimal comma (e.g. "1,5 MB"). */
  export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < UNITS.length - 1) {
      value /= 1024;
      unit += 1;
    }
    const rounded = Math.round(value * 10) / 10;
    const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(".", ",");
    return `${text} ${UNITS[unit]}`;
  }
  ```
- [ ] **Step 4: Run, expect PASS.**
  ```bash
  bun run test -- src/features/media/utils/__tests__/mediaDisplay.test.ts
  ```
  Expected: PASS.
- [ ] **Step 5: Commit.**
  ```bash
  git add src/features/media/utils/mediaDisplay.ts src/features/media/utils/__tests__/mediaDisplay.test.ts
  git commit -m "$(cat <<'EOF'
feat(media): mediaDisplay utils (counters, kind icons, formatBytes, §3.2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

### Task 15: Feature i18n skeleton + foundation barrel

**Files:**
- Create: `src/features/media/i18n/pt-BR.ts`
- Create: `src/features/media/index.ts`

- [ ] **Step 1: Create the i18n skeleton.** Labels for classifications + kinds + a few foundation strings. Mirrors the small i18n modules used by other features (e.g. `analytics-copilot/i18n`). Create `src/features/media/i18n/pt-BR.ts`:
  ```ts
  import type { IMediaClassification, IMediaAsset } from "@/shared/types";

  /** pt-BR labels for the assisted classification chips. */
  export const CLASSIFICATION_LABELS: Record<IMediaClassification, string> = {
    nota_fiscal: "Nota fiscal",
    peca: "Peça",
    chassi_placa: "Chassi / placa",
    comprovante: "Comprovante",
    catalogo: "Catálogo",
    outro: "Outro",
  };

  /** pt-BR labels for the media kinds. */
  export const KIND_LABELS: Record<IMediaAsset["kind"], string> = {
    image: "Imagem",
    audio: "Áudio",
    document: "Documento",
    video: "Vídeo",
  };

  /** Foundation-level strings reused by Fases 3-5 surfaces. */
  export const MEDIA_STRINGS = {
    sensitiveCaption: "Conteúdo sensível — acesso restrito",
    requestAccess: "Solicitar acesso ao gestor",
    retry: "Tentar novamente",
    emptyState: "Nenhuma mídia",
    galleryTitle: "Mídias",
  } as const;
  ```
- [ ] **Step 2: Create the foundation barrel.** Exposes the engine, the inbound hook, the display utils and the i18n. Surfaces that arrive in Fases 3-5 (galleries, view-mode hook) get appended later. Create `src/features/media/index.ts`:
  ```ts
  // Engine (pure, tested)
  export { contentHash, mediaHashSeed } from "./engine/contentHash";
  export { classifyMedia, type IClassifyMediaInput } from "./engine/classifyMedia";
  export {
    computeSourceExpiresAt,
    daysUntilExpiry,
    expiryLabel,
    expiryUrgency,
    sourceExpiry,
    DEFAULT_SOURCE_TTL_DAYS,
    type ExpiryUrgency,
    type SourceExpiryTier,
    type ISourceExpiryView,
  } from "./engine/sourceExpiry";
  export {
    canViewSensitive,
    statusChipPriority,
    type IMediaViewer,
    type MediaStatusChip,
  } from "./engine/sensitiveAccess";
  export {
    applyMediaFilters,
    highlightRanges,
    highlightSegments,
    type IHighlightRange,
    type IHighlightSegment,
  } from "./engine/mediaFiltering";
  export {
    normalizePoint,
    denormalizePoint,
    type IPixelPoint,
    type INormalizedPoint,
    type IBox,
  } from "./engine/annotationCoords";

  // Inbound (Fase 2)
  export {
    useEnsureInboundMedia,
    resolveInboundAsset,
    type InboundAction,
    type IInboundDecision,
  } from "./hooks/useEnsureInboundMedia";

  // Display utils
  export {
    countByKind,
    mediaCounterLabel,
    mediaKindIcon,
    formatBytes,
    type MediaKind,
    type IKindCounts,
  } from "./utils/mediaDisplay";

  // i18n
  export { CLASSIFICATION_LABELS, KIND_LABELS, MEDIA_STRINGS } from "./i18n/pt-BR";
  ```
- [ ] **Step 3: Verify build + full test run (final gate).**
  ```bash
  bun run build
  bun run test
  ```
  Expected: build exit 0; all Vitest suites pass (contentHash, mediaAsset, mediaApi.ensureFromMessage, classifyMedia, sourceExpiry, sensitiveAccess, mediaFiltering, annotationCoords, resolveInboundAsset, mediaDisplay).
- [ ] **Step 4: Manual verification checklist (user-run, optional but recommended).**
  1. Run `bun run dev` and open the app; sign in as Owner.
  2. Open the browser console — confirm `[providers/data] active data source: "mock"` and NO `[mock-bootstrap] integrity errors` line.
  3. In the console, the mock store now carries `mediaAssets` (the gallery UI lands in Fase 3; for now this is a data-only check). No white screen, no provider errors.
- [ ] **Step 5: Commit.**
  ```bash
  git add src/features/media/i18n/pt-BR.ts src/features/media/index.ts
  git commit -m "$(cat <<'EOF'
feat(media): foundation i18n skeleton + feature barrel (PRD-026 Fase 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

## Exports for Plan B (canonical A↔B contract)

These are the EXACT names/signatures Plan B imports. Plan A is the single source of truth; Plan B conforms to these and does not redefine them.

**Engine — `src/features/media/engine/`:**
- `contentHash(input)` — `contentHash.ts` (+ `mediaHashSeed(parts)`).
- `classifyMedia(input): IMediaClassification` — `classifyMedia.ts`. Wired at creation (`mediaApi.ensureFromMessage` + the mock generator).
- `computeSourceExpiresAt`, `daysUntilExpiry`, `expiryLabel`, `expiryUrgency`, and the convenience `sourceExpiry(asset, now?): { daysLeft: number; label: string; tier: 'soft' | 'strong' | 'critical' }` — `sourceExpiry.ts`. Tier word is **'strong'** (never 'solid'). Plan B calls `sourceExpiry(asset)`.
- `canViewSensitive(viewer): boolean` — ONE argument, role-based (Owner/Gestor ⇒ true; Vendedor/SDR/VendedorExterno/anonymous ⇒ false). `statusChipPriority(asset, viewer, now?): 'failure' | 'sensitive' | 'expiring' | 'none'` (priority failure > sensitive > expiring > none). Chip-tone map keys are `'failure' | 'sensitive' | 'expiring'`. — `sensitiveAccess.ts`.
- `applyMediaFilters(assets, filters)` (filters use `from?`/`to?` ISO strings, NOT a `period` enum), `highlightRanges(text, term): { start; end }[]`, `highlightSegments(text, term): { text: string; isMatch: boolean }[]` (built on `highlightRanges`; Plan B maps over this). — `mediaFiltering.ts`.
- `normalizePoint(point, box): { x; y }`, `denormalizePoint(norm, box): { x; y }` — `annotationCoords.ts`. Plan B calls `normalizePoint({ x: clientX - rect.left, y: clientY - rect.top }, { width: rect.width, height: rect.height })`.

**Utils — `src/features/media/utils/mediaDisplay.ts`:** `mediaCounterLabel(assets)` (NOT `mediaCounters`), `mediaKindIcon(kind)` (NOT `iconForKind`), `countByKind(assets)`, `formatBytes(n)`.

**Provider / types:** `useMediaStorageProvider(): IMediaStorageProvider`. `IPaginatedResult<T>` array key is **`data`** (shape `{ data, total, page, pageSize }`); Plan B reads `query.data?.data ?? []`.

**RBAC (single source of truth = Plan A, Task 6):** the `media` resource + per-role matrix are registered in Plan A. Final per-role media matrix: Owner `CRUD`/`all`; Gestor `[view, edit, delete]`/`store`; Vendedor, SDR, VendedorExterno `[view]`/`own`. Sensitivity is gated SEPARATELY by `canViewSensitive` (role-based). Plan B's RBAC task is VERIFICATION ONLY.

**Severity (D-14):** never `var(--severity-*)` (undefined). Use `text-/bg-/border-severity-{info|success|warning|critical}` utilities (or `var(--color-severity-*)` only where a raw value is unavoidable). `IMediaAnnotation.color` stores a TOKEN NAME (`'critical'|'warning'|'info'`) that the UI maps to a class.

---

## Self-check

Plan A covers, from the spec, these requirements (Fases 1-2; decisions D-1..D-7, D-13..D-15):

- **D-1 (sequence):** Plan A is PRD-026-only foundation; PRD-027 consumes the delivered `IMediaStorageProvider`. ✓
- **D-2 (engine in `features/media/`):** all pure logic lands under `src/features/media/engine/` + `utils/` + `hooks/`, consumable by `conversations`/`customers` later. ✓ (Tasks 5, 8-14)
- **D-3 (eager inbound persistence + dedup):** `bootstrap` generates `IMediaAsset[]`; `mediaApi.ensureFromMessage` normalizes sticker→image and applies `classifyMedia` at creation, then dedups by `messageId`/`contentHash`; `resolveInboundAsset` decides create/dedup/skip/retry. ✓ (Tasks 7, 6, 13)
- **D-4 (sensitive gate in the data layer):** `mockMediaProvider.getSignedUrl` returns a `mock-redacted://` placeholder ref (never real bytes) for sensitive-without-permission and audits the attempt. ✓ (Tasks 6, 10)
- **D-5 (retention placeholder):** retention values surface in Configurações in Fase 5 — Plan A models `sourceExpiresAt`/sensitivity that retention reads; UI is out of Plan A scope. (Noted; deferred to Plan B/Fase 5.)
- **D-6 (RBAC sensitive — Owner/Gestor view, Vendedor/SDR blocked + audited):** the `media` RBAC resource + per-role matrix are registered in **Task 6** (single source of truth, same task the provider first scopes `list` to `"media"`); `canViewSensitive(viewer)` (Task 10) + the provider's audited deny path enforce the sensitive-bytes gate. Task 10's RBAC step is verification-only. ✓ (Tasks 6, 10)
- **D-7 (`@tanstack/react-virtual`):** added respecting the 24h guard. ✓ (Task 1)
- **D-13 (chip priority failure > sensitive-lock > expiring > none):** `statusChipPriority` enforces the strict order. ✓ (Task 10)
- **D-14 (severity scale):** engine returns urgency tiers/chip kinds (`soft/strong/critical`, `failure/sensitive/expiring`) that map to the `text-/bg-/border-severity-{info|success|warning|critical}` Tailwind utilities in the UI (never `var(--severity-*)`, which is undefined; the design system exposes `--color-severity-*`). `IMediaAnnotation.color` stores a TOKEN NAME (`'critical'|'warning'|'info'`), not a raw var. Plan A keeps these as semantic enums, not colors. ✓ (Tasks 9-10, Task 2) 
- **D-15 (dedicated `media.ts` type, barrel-exported):** `src/shared/types/media.ts` + barrel re-export. ✓ (Task 2)
- **§4 model & contract:** `IMediaClassification`/`IMediaAnnotation`/`IMediaAsset`/`IMediaUploadInput`/`IListMediaParams`/`IMediaStorageProvider` verbatim. ✓ (Task 2)
- **§3.1 provider layer:** contract + mock impl + supabase stub + hook + factory + barrels + mock api + generator + bootstrap + VOLUMES. ✓ (Tasks 3, 4, 6, 7)
- **§6 mocks:** deterministic generator with sensitive notas/comprovantes, audios with transcription, `persisted:false`, near-future `sourceExpiresAt`; `runApi` latency/error. ✓ (Tasks 6, 7)
- **§8 tests:** Vitest for `classifyMedia`, `contentHash`/dedup, `sourceExpiry` (incl. the convenience `sourceExpiry` view-model, tier word 'strong'), `mediaFiltering` (incl. `highlightSegments`), `sensitiveAccess`, `annotationCoords`, `mediaApi.ensureFromMessage` (sticker→image + classifyMedia-at-creation) (+ `resolveInboundAsset`, `mediaDisplay`). ✓ (Tasks 5, 6, 8-14)
- **§9 Fase 1 deliverables:** DELTA `media.ts`; provider (mock+stub+factory+hook); generator+bootstrap+VOLUMES; complete `engine/` with tests; `@tanstack/react-virtual`. ✓
- **§9 Fase 2 deliverable:** `useEnsureInboundMedia` (dedup, `sourceExpiresAt`, persisted false→true via retry, non-blocking). ✓ (Task 13)

**Out of Plan A (deferred to Plan B — Fases 3-5):** all React components (`MediaGallery`, `MediaGrid`, `MediaTile`, lightbox, annotator, `SensitiveLock`, gallery entry points), `useMediaViewMode`/`useMediaFilters`/`useConversationMedia`/`useCustomerMedia`/`useMediaActions`, the `ConversationHeader`/`ProfileTabs` integration points, the Configurações retention UI (D-5), and `localStorage["gallo-media-viewmode"]` (D-8..D-11). Plan A is independently buildable (`bun run build`) and testable (`bun run test`) with no UI.

**Known non-blocking notes for the implementer:**
- `tsc --noEmit` has ~315 pre-existing errors — judge only the delta; the gate is `bun run build`.
- CRLF warnings on `git add` are a false positive in this repo — do NOT run prettier to "fix" them.
- Per-task commits assume the build is green at commit time. Task 6 and Task 7 are interdependent (the provider needs the `mediaAssets` store field from Task 7's bootstrap change). If committing strictly per task, run Task 7 Steps 1-4 and Task 3 before Task 6's build/commit, or stage Tasks 3+6+7 together and commit in their listed order once `bun run build` is green.
