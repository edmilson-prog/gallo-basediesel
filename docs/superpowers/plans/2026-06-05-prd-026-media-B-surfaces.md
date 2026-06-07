# PRD-026 Gestão de Mídia — Plan B (Surfaces + Governance) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the media galleria surfaces (3 view modes, filtros, lightbox, audio player, annotator, sensitive-lock) and governance (RBAC `media` resource, sensitive-access auditing, retention placeholder) by composing the engine and provider already shipped by Plan A, wiring two entry points — the Conversa `Sheet` and the Ficha `Mídias` tab.

**Architecture:** One reusable engine in `src/features/media/` exposes a shared `MediaGallery` shell consumed by `ConversationMediaGallery` (scope=conversation) and `CustomerMediaGallery` (scope=customer). The body switches by a persisted view-mode (`grade`/`cartoes`/`tipo`) chosen by a `MediaViewSwitcher` in the filter bar. Data flows from `useMediaStorageProvider()` (Plan A) through TanStack Query hooks (`useConversationMedia`/`useCustomerMedia`), is filtered client-side by the pure `mediaFiltering` engine, and is mutated through `useMediaActions` (provider.update/delete + `auditLog`). RBAC for sensitive content is enforced at the data layer (provider `getSignedUrl`) and mirrored in the UI by the pure `canViewSensitive` helper.

**Tech Stack:** React 19 + TypeScript (strict) · TanStack Router/Query · Tailwind v4 + shadcn/ui (new-york) · `@tanstack/react-virtual` (added in Plan A) · Vitest (node env) for pure logic · Iconify (`mdi:*`).

---

## Prerequisites from Plan A (DO NOT redefine — import by these exact names)

These already exist when Plan B starts. Cite/import; never re-create.

- **Types** — `@/shared/types`: `IMediaAsset`, `IMediaClassification`, `IMediaAnnotation`, `IMediaUploadInput`, `IListMediaParams`, `IMediaStorageProvider` (spec §4); plus `ID`, `ISO8601`, `IPaginatedResult`, `IMessage`. `IPaginatedResult<T>` array key is **`data`** (shape `{ data, total, page, pageSize }`) — read `query.data?.data ?? []`.
- **Provider hook** — `@/providers/data` → `useMediaStorageProvider(): IMediaStorageProvider` (slice key `"media"`). Ops: `upload`, `get`, `getSignedUrl`, `delete`, `list`, `ensureFromMessage`, `update`.
- **Engine modules** (`src/features/media/engine/`):
  - `classifyMedia.ts` → `classifyMedia(input): IMediaClassification`. Wired at creation by Plan A's `ensureFromMessage` (suggested classification + `sticker`→`image` normalization).
  - `contentHash.ts` → `contentHash(...)`.
  - `sourceExpiry.ts` → `computeSourceExpiresAt`, `daysUntilExpiry`, `expiryLabel`, `expiryUrgency`, plus the convenience export `sourceExpiry(asset, now?)` returning `{ daysLeft: number; label: string; tier: 'soft' | 'strong' | 'critical' }` (spec §5.6: `>14d` soft warning, `≤7d` strong warning, `≤2d` critical). The tier word is **`'strong'`** (NOT `'solid'`). Plan B calls `sourceExpiry(asset)`.
  - `sensitiveAccess.ts` → `canViewSensitive(viewer): boolean` (ONE argument, role-based: Owner/Gestor ⇒ true; Vendedor/SDR/VendedorExterno ⇒ false) and `statusChipPriority(asset, viewer, now?): 'failure' | 'sensitive' | 'expiring' | 'none'` (priority `failure > sensitive > expiring > none`, D-13). Chip-tone map keys are `'failure' | 'sensitive' | 'expiring'`.
  - `mediaFiltering.ts` → `applyMediaFilters(assets, filters): IMediaAsset[]` (filters use `from?`/`to?` ISO strings, NOT a `period` enum), `highlightRanges(text, term): { start: number; end: number }[]`, and `highlightSegments(text, term): { text: string; isMatch: boolean }[]` (built on `highlightRanges`; Plan B maps over this) over `fileName`/`ocrText`/`transcription`.
  - `annotationCoords.ts` → `normalizePoint(point: { x: number; y: number }, box: { width: number; height: number }): { x: number; y: number }` / `denormalizePoint(norm: { x: number; y: number }, box: { width: number; height: number }): { x: number; y: number }` (0..1).
- **Hooks** — `useEnsureInboundMedia` (Fase 2 inbound). **Utils** — `utils/mediaDisplay.ts` → `mediaCounterLabel(...): string`, `mediaKindIcon(kind): string`, `countByKind(assets)`, `formatBytes(n): string`.
- **i18n** — `src/features/media/i18n/pt-BR.ts` exists with a `MEDIA_STRINGS` object; Plan B **extends** it (adds keys). If a key referenced here is missing, add it in the task that first uses it.
- **Mocks** — `generators/mediaAsset.ts`, bootstrap entry, `VOLUMES.mediaAssets`.

> If any engine signature above differs slightly from what Plan A shipped, **adapt the call site to the real signature** (read the file first) — do not change the engine.

## Testing notes (project-specific)

- Pure logic only → **Vitest (node env)**. Command: `bun run test -- <path>`. Config: `vitest.config.ts` (env `node`, include `src/**/*.{test,spec}.{ts,tsx}`).
- React components & wiring → **NO jsdom/RTL/browser**. The gate is `bun run build` (vite). Each component task ends with a **Manual verification checklist** the user performs, then a commit.
- `tsc --noEmit` has **~315 PRE-EXISTING errors**; ignore them — evaluate only the delta. The real gate is `bun run build`.
- CRLF warnings on `git add` are a **known false positive** — do **NOT** run prettier to "fix" them.
- Every commit message ends with a blank line then:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

| File | Create/Modify | Responsibility |
|------|---------------|----------------|
| `src/features/media/hooks/useMediaViewMode.ts` | Create | Persisted view-mode (`grade`/`cartoes`/`tipo`), `normalizeMediaViewMode`, `MediaViewMode`, default `grade`, key `gallo-media-viewmode`. Mirrors `useCopilotViewMode`. |
| `src/features/media/hooks/__tests__/useMediaViewMode.test.ts` | Create | Vitest for `normalizeMediaViewMode`. |
| `src/features/media/hooks/useMediaFilters.ts` | Create | Scope-aware filter state (`conversation`/`customer`): search, kind, authorType, period, classification. |
| `src/features/media/hooks/useConversationMedia.ts` | Create | TanStack Query list of assets by `conversationId`. |
| `src/features/media/hooks/useCustomerMedia.ts` | Create | TanStack Query list of assets by `customerId` (aggregated across conversations). |
| `src/features/media/hooks/useMediaActions.ts` | Create | classify/link/sensitivity/delete/annotate via `provider.update`/`delete` + `auditLog`; invalidates queries. |
| `src/features/media/hooks/useMediaGallery.ts` | Create | Open/close state for the conversation Sheet (mirrors `useConversationFiche`), key `gallo-conversation-media-open`. |
| `src/features/media/components/MediaViewSwitcher.tsx` | Create | ToggleGroup (Grade/Cartões/Por tipo) in the filter bar (D-8..D-11). |
| `src/features/media/components/MediaFilters.tsx` | Create | Search input + kind ToggleGroup + author/period/classification Selects + the switcher. |
| `src/features/media/components/MediaTile.tsx` | Create | Square thumb + type icon + ONE status chip via `statusChipPriority` + locked overlay. |
| `src/features/media/components/MediaCardTile.tsx` | Create | Cartões-mode tile (thumb + footer badge/name/meta). |
| `src/features/media/components/MediaGrid.tsx` | Create | Virtualized grid (`@tanstack/react-virtual`), `role=grid` roving-tabindex. |
| `src/features/media/components/MediaTypeGroups.tsx` | Create | Por-tipo layout: images grid + docs/audio lists. |
| `src/features/media/components/MediaGallery.tsx` | Create | Shared shell: header + counters (`aria-live`) + filters + switcher + body-by-mode + states. |
| `src/features/media/components/SensitiveLock.tsx` | Create | Blurred placeholder + lock + "Solicitar acesso" dialog. |
| `src/features/media/components/MediaAudioPlayer.tsx` | Create | Slider + 1x/1.5x/2x persisted across items + transcript highlight. |
| `src/features/media/components/MediaAnnotator.tsx` | Create | SVG overlay (point/arrow/text), normalized coords, accessible list, save → version 2. |
| `src/features/media/components/MediaLightbox.tsx` | Create | Full-screen Dialog; image/audio/document + responsive aside + RBAC-gated actions + keymap. |
| `src/features/media/components/ConversationMediaGallery.tsx` | Create | Sheet (side=right) wrapping `MediaGallery` (scope=conversation). |
| `src/features/media/components/CustomerMediaGallery.tsx` | Create | Panel for the Ficha "Mídias" tab (scope=customer). |
| `src/features/media/i18n/pt-BR.ts` | Modify | Add gallery/filter/lightbox/sensitive/annotation/retention strings. |
| `src/features/media/index.ts` | Modify | Public barrel: `ConversationMediaGallery`, `CustomerMediaGallery`, view-mode exports, `useMediaGallery`. |
| `src/features/conversations/components/ConversationHeader.tsx` | Modify | Add "Mídias" button + `onToggleMedia`/`mediaOpen` props before `menuSlot`. |
| `src/features/conversations/i18n/pt-BR.ts` | Modify | Add `CONVERSATION_STRINGS.toggleMedia = "Mídias"`. |
| `src/features/conversations/pages/ConversationPage.tsx` | Modify | Mount `ConversationMediaGallery`, drive open state via `useMediaGallery`. |
| `src/features/customers/components/ProfileTabs.tsx` | Modify | Add `"midias"` to `TabKey`/`TAB_ORDER` after `conversations` + content. |
| `src/features/customers/i18n/pt-BR.ts` | Modify | Add `tabs.midias = "Mídias"`. |
| `src/features/rbac/permissions/resources.ts` | VERIFY ONLY | Plan A owns registration of `"media"` in `RESOURCES`; Plan B only verifies it exists. |
| `src/features/rbac/permissions/matrix.ts` | VERIFY ONLY | Plan A owns the per-role matrix entries; Plan B only verifies they match the contract (Owner CRUD/all; Gestor [view, edit, delete]/store; Vendedor/SDR/VendedorExterno [view]/own). Sensitivity is gated separately by `canViewSensitive`. |
| `src/features/settings/.../retention` (locate in Task 19) | Modify | Retention placeholder card showing 365 / 1825 days (D-5). |

---

## Phase 3 — Galeria + Lightbox

### Task 1: View-mode hook (`useMediaViewMode`) — TDD the normalizer

**Files:**
- Create `src/features/media/hooks/__tests__/useMediaViewMode.test.ts`
- Create `src/features/media/hooks/useMediaViewMode.ts`

Mirrors `src/features/analytics-copilot/hooks/useCopilotViewMode.ts` (read it first — same structure).

- [ ] **Step 1: Write the failing test.** Create `src/features/media/hooks/__tests__/useMediaViewMode.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { normalizeMediaViewMode, MEDIA_VIEW_MODES } from "../useMediaViewMode";

  describe("normalizeMediaViewMode", () => {
    it("exposes exactly the three modes in order", () => {
      expect(MEDIA_VIEW_MODES).toEqual(["grade", "cartoes", "tipo"]);
    });
    it("returns the value when it is a valid mode", () => {
      expect(normalizeMediaViewMode("cartoes")).toBe("cartoes");
      expect(normalizeMediaViewMode("tipo")).toBe("tipo");
    });
    it("falls back to 'grade' for null/undefined/unknown", () => {
      expect(normalizeMediaViewMode(null)).toBe("grade");
      expect(normalizeMediaViewMode(undefined)).toBe("grade");
      expect(normalizeMediaViewMode("kanban")).toBe("grade");
      expect(normalizeMediaViewMode("")).toBe("grade");
    });
  });
  ```
- [ ] **Step 2: Run it, expect FAIL.** `bun run test -- src/features/media/hooks/__tests__/useMediaViewMode.test.ts`
  Expected: FAIL — `Cannot find module '../useMediaViewMode'`.
  > **TDD trail note (retroactive):** The test file and implementation were committed together in a single commit `9da7fc1` without a preceding standalone RED commit. This deviates from the two-commit RED/GREEN discipline required by the HARD RULES and enforced from Task 9 onward in Plan A (see commits 67a7d45 → 1e0fe8b, 52a4abf → e3a5704). The deviation is acknowledged here; the RED/GREEN two-commit discipline **must be enforced starting from Task 2 onward** in Plan B.
- [ ] **Step 3: Implement the hook.** Create `src/features/media/hooks/useMediaViewMode.ts`:
  ```ts
  // src/features/media/hooks/useMediaViewMode.ts
  import { useCallback, useEffect, useState } from "react";

  export const MEDIA_VIEW_MODES = ["grade", "cartoes", "tipo"] as const;
  export type MediaViewMode = (typeof MEDIA_VIEW_MODES)[number];

  const STORAGE_KEY = "gallo-media-viewmode";
  const DEFAULT_MODE: MediaViewMode = "grade";

  /** Pure normalizer — keeps localStorage parsing testable and total. */
  export function normalizeMediaViewMode(raw: string | null | undefined): MediaViewMode {
    return MEDIA_VIEW_MODES.includes(raw as MediaViewMode)
      ? (raw as MediaViewMode)
      : DEFAULT_MODE;
  }

  function read(): MediaViewMode {
    if (typeof window === "undefined") return DEFAULT_MODE;
    try {
      return normalizeMediaViewMode(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      return DEFAULT_MODE;
    }
  }

  /** Persisted view-mode preference (default "grade"). */
  export function useMediaViewMode(): [MediaViewMode, (mode: MediaViewMode) => void] {
    const [mode, setMode] = useState<MediaViewMode>(() => read());

    useEffect(() => {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(STORAGE_KEY, mode);
      } catch {
        // ignore
      }
    }, [mode]);

    const set = useCallback((next: MediaViewMode) => setMode(next), []);
    return [mode, set];
  }
  ```
- [ ] **Step 4: Run it, expect PASS.** `bun run test -- src/features/media/hooks/__tests__/useMediaViewMode.test.ts`
  Expected: PASS — 3 tests green.
- [ ] **Step 5: Commit.**
  ```
  git add src/features/media/hooks/useMediaViewMode.ts src/features/media/hooks/__tests__/useMediaViewMode.test.ts
  git commit -m "feat(media): add persisted view-mode hook (grade/cartoes/tipo) — PRD-026

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 2: Scope-aware filter state (`useMediaFilters`)

**Files:**
- Create `src/features/media/hooks/useMediaFilters.ts`

The classification filter only applies to `scope === "customer"` (spec §5.1: "no scope=customer entra também o filtro de classificação"). The hook always tracks all fields; the UI hides classification for conversation scope.

- [ ] **Step 1: Implement the hook.** Create `src/features/media/hooks/useMediaFilters.ts`:
  ```ts
  // src/features/media/hooks/useMediaFilters.ts
  import { useCallback, useMemo, useState } from "react";
  import type { IMediaAsset, IMediaClassification } from "@/shared/types";

  export type MediaFilterScope = "conversation" | "customer";

  export interface IMediaFilterState {
    search: string;
    kind: IMediaAsset["kind"] | "all";
    authorType: IMediaAsset["authorType"] | "all";
    period: "all" | "7d" | "30d" | "90d";
    /** Only meaningful when scope === "customer". */
    classification: IMediaClassification | "all";
  }

  const EMPTY: IMediaFilterState = {
    search: "",
    kind: "all",
    authorType: "all",
    period: "all",
    classification: "all",
  };

  export interface IUseMediaFilters {
    scope: MediaFilterScope;
    filters: IMediaFilterState;
    setFilter: <K extends keyof IMediaFilterState>(key: K, value: IMediaFilterState[K]) => void;
    reset: () => void;
    /** Count of non-default filters (excludes free-text search). */
    activeCount: number;
  }

  export function useMediaFilters(scope: MediaFilterScope): IUseMediaFilters {
    const [filters, setFilters] = useState<IMediaFilterState>(EMPTY);

    const setFilter = useCallback(
      <K extends keyof IMediaFilterState>(key: K, value: IMediaFilterState[K]) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
      },
      [],
    );

    const reset = useCallback(() => setFilters(EMPTY), []);

    const activeCount = useMemo(() => {
      let n = 0;
      if (filters.kind !== "all") n++;
      if (filters.authorType !== "all") n++;
      if (filters.period !== "all") n++;
      if (scope === "customer" && filters.classification !== "all") n++;
      return n;
    }, [filters, scope]);

    return { scope, filters, setFilter, reset, activeCount };
  }
  ```
- [ ] **Step 2: Type-check the delta.** `bun run build`
  Expected: build SUCCEEDS (no new errors from this file). If `IMediaClassification` import path differs, fix to the real barrel path (`@/shared/types`).
- [ ] **Step 3: Commit.**
  ```
  git add src/features/media/hooks/useMediaFilters.ts
  git commit -m "feat(media): add scope-aware media filter state hook — PRD-026

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 3: Data hooks (`useConversationMedia`, `useCustomerMedia`)

**Files:**
- Create `src/features/media/hooks/useConversationMedia.ts`
- Create `src/features/media/hooks/useCustomerMedia.ts`

Both call `useMediaStorageProvider().list(...)` via TanStack Query. The provider is store-scoped already (Plan A). Filtering/search runs client-side later via `applyMediaFilters` in `MediaGallery`; these hooks only fetch the scoped superset.

- [ ] **Step 1: Implement `useConversationMedia`.** Create `src/features/media/hooks/useConversationMedia.ts`:
  ```ts
  // src/features/media/hooks/useConversationMedia.ts
  import { useQuery } from "@tanstack/react-query";
  import type { ID, IMediaAsset } from "@/shared/types";
  import { useMediaStorageProvider } from "@/providers/data";

  export interface IUseConversationMedia {
    assets: IMediaAsset[];
    isLoading: boolean;
    isError: boolean;
    refetch: () => void;
  }

  /** All media assets bound to a single conversation (scope=conversation). */
  export function useConversationMedia(conversationId: ID, enabled = true): IUseConversationMedia {
    const provider = useMediaStorageProvider();
    const query = useQuery({
      queryKey: ["media", "conversation", conversationId],
      queryFn: () => provider.list({ conversationId }),
      enabled: enabled && Boolean(conversationId),
      staleTime: 30_000,
    });
    return {
      assets: query.data?.data ?? [],
      isLoading: query.isLoading,
      isError: query.isError,
      refetch: () => void query.refetch(),
    };
  }
  ```
  > NOTE: `IPaginatedResult<T>` array key is **`data`** (shape `{ data, total, page, pageSize }`) — read `query.data?.data ?? []`. This matches Plan A's provider returning `{ data, total, page, pageSize }`.
- [ ] **Step 2: Implement `useCustomerMedia`.** Create `src/features/media/hooks/useCustomerMedia.ts`:
  ```ts
  // src/features/media/hooks/useCustomerMedia.ts
  import { useQuery } from "@tanstack/react-query";
  import type { ID, IMediaAsset } from "@/shared/types";
  import { useMediaStorageProvider } from "@/providers/data";

  export interface IUseCustomerMedia {
    assets: IMediaAsset[];
    isLoading: boolean;
    isError: boolean;
    refetch: () => void;
  }

  /**
   * Aggregated media for a customer across all their conversations
   * (scope=customer). The provider filters by customerId server-side
   * (Fase 2) / in the mock store today; assets carry customerId directly
   * (spec §4), so no extra join is needed.
   */
  export function useCustomerMedia(customerId: ID, enabled = true): IUseCustomerMedia {
    const provider = useMediaStorageProvider();
    const query = useQuery({
      queryKey: ["media", "customer", customerId],
      queryFn: () => provider.list({ customerId }),
      enabled: enabled && Boolean(customerId),
      staleTime: 30_000,
    });
    return {
      assets: query.data?.data ?? [],
      isLoading: query.isLoading,
      isError: query.isError,
      refetch: () => void query.refetch(),
    };
  }
  ```
- [ ] **Step 3: Build.** `bun run build` — Expected SUCCEEDS (delta clean).
- [ ] **Step 4: Commit.**
  ```
  git add src/features/media/hooks/useConversationMedia.ts src/features/media/hooks/useCustomerMedia.ts
  git commit -m "feat(media): add conversation/customer media query hooks — PRD-026

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 4: `MediaViewSwitcher` (the on-screen parameter)

**Files:**
- Create `src/features/media/components/MediaViewSwitcher.tsx`

Copy the proven structure of `src/features/analytics-copilot/components/CopilotViewSwitcher.tsx` (ToggleGroup + Tooltip + Icon, `data-[state=on]` styling).

- [ ] **Step 1: Add i18n keys.** In `src/features/media/i18n/pt-BR.ts`, add inside `MEDIA_STRINGS`:
  ```ts
    viewMode: {
      label: "Modo de visualização",
      grade: "Grade — miniaturas densas",
      cartoes: "Cartões — com nome e classificação",
      tipo: "Por tipo — imagens, documentos e áudios",
    },
  ```
- [ ] **Step 2: Implement the component.** Create `src/features/media/components/MediaViewSwitcher.tsx`:
  ```tsx
  // src/features/media/components/MediaViewSwitcher.tsx
  import { Icon } from "@/components/Icon";
  import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
  import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
  import { cn } from "@/lib/utils";
  import type { MediaViewMode } from "../hooks/useMediaViewMode";
  import { MEDIA_STRINGS } from "../i18n/pt-BR";

  interface IMediaViewSwitcherProps {
    mode: MediaViewMode;
    onChange: (mode: MediaViewMode) => void;
    className?: string;
  }

  const MODES: { value: MediaViewMode; icon: string; labelKey: keyof typeof MEDIA_STRINGS.viewMode }[] = [
    { value: "grade", icon: "mdi:view-grid-outline", labelKey: "grade" },
    { value: "cartoes", icon: "mdi:view-agenda-outline", labelKey: "cartoes" },
    { value: "tipo", icon: "mdi:format-list-group", labelKey: "tipo" },
  ];

  /** Segmented control switching the gallery body layout. Persisted upstream (D-8..D-11). */
  export function MediaViewSwitcher({ mode, onChange, className }: IMediaViewSwitcherProps) {
    return (
      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(v) => v && onChange(v as MediaViewMode)}
        className={cn("rounded-lg bg-muted/40 p-1", className)}
        aria-label={MEDIA_STRINGS.viewMode.label}
      >
        {MODES.map((m) => {
          const label = MEDIA_STRINGS.viewMode[m.labelKey];
          return (
            <Tooltip key={m.value}>
              <TooltipTrigger asChild>
                <ToggleGroupItem
                  value={m.value}
                  aria-label={label}
                  className={cn(
                    "h-8 w-8 rounded-md text-muted-foreground",
                    "data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm",
                    "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                >
                  <Icon icon={m.icon} size={18} />
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          );
        })}
      </ToggleGroup>
    );
  }
  ```
- [ ] **Step 3: Build.** `bun run build` — Expected SUCCEEDS.
- [ ] **Step 4: Commit.**
  ```
  git add src/features/media/components/MediaViewSwitcher.tsx src/features/media/i18n/pt-BR.ts
  git commit -m "feat(media): add MediaViewSwitcher segmented control — PRD-026

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 5: `MediaFilters` (search + type + author/period/classification + switcher)

**Files:**
- Create `src/features/media/components/MediaFilters.tsx`

Uses shadcn `Input` (`@/components/ui/input`), `ToggleGroup` for kind, `Select` (`@/components/ui/select`) for author/period/classification, and embeds `MediaViewSwitcher` at the right (D-11).

- [ ] **Step 1: Add i18n keys.** In `src/features/media/i18n/pt-BR.ts`, add inside `MEDIA_STRINGS`:
  ```ts
    filters: {
      searchPlaceholder: "Buscar por nome, texto reconhecido ou transcrição…",
      searchLabel: "Buscar mídias",
      clearSearch: "Limpar busca",
      kindLabel: "Tipo de mídia",
      kindAll: "Todos",
      kind: { image: "Imagens", document: "Documentos", audio: "Áudios", video: "Vídeos" },
      authorLabel: "Autor",
      authorAll: "Todos os autores",
      author: { customer: "Cliente", seller: "Vendedor", sdr: "SDR", system: "Sistema" },
      periodLabel: "Período",
      period: { all: "Qualquer data", "7d": "Últimos 7 dias", "30d": "Últimos 30 dias", "90d": "Últimos 90 dias" },
      classificationLabel: "Classificação",
      classificationAll: "Todas",
      classification: {
        nota_fiscal: "Nota fiscal",
        peca: "Peça",
        chassi_placa: "Chassi/Placa",
        comprovante: "Comprovante",
        catalogo: "Catálogo",
        outro: "Outro",
      },
      activeBadge: (n: number) => `${n} filtro${n === 1 ? "" : "s"}`,
      clearAll: "Limpar filtros",
    },
  ```
- [ ] **Step 2: Implement the component.** Create `src/features/media/components/MediaFilters.tsx`:
  ```tsx
  // src/features/media/components/MediaFilters.tsx
  import type { IMediaAsset, IMediaClassification } from "@/shared/types";
  import { Icon } from "@/components/Icon";
  import { Input } from "@/components/ui/input";
  import { Button } from "@/components/ui/button";
  import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
  import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  } from "@/components/ui/select";
  import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
  import { cn } from "@/lib/utils";
  import type { IUseMediaFilters } from "../hooks/useMediaFilters";
  import type { MediaViewMode } from "../hooks/useMediaViewMode";
  import { MediaViewSwitcher } from "./MediaViewSwitcher";
  import { MEDIA_STRINGS } from "../i18n/pt-BR";

  interface IMediaFiltersProps {
    filtersApi: IUseMediaFilters;
    viewMode: MediaViewMode;
    onViewModeChange: (m: MediaViewMode) => void;
  }

  const KINDS: IMediaAsset["kind"][] = ["image", "document", "audio", "video"];
  const AUTHORS: IMediaAsset["authorType"][] = ["customer", "seller", "sdr", "system"];
  const PERIODS = ["all", "7d", "30d", "90d"] as const;
  const CLASSIFICATIONS: IMediaClassification[] = [
    "nota_fiscal", "peca", "chassi_placa", "comprovante", "catalogo", "outro",
  ];

  export function MediaFilters({ filtersApi, viewMode, onViewModeChange }: IMediaFiltersProps) {
    const { scope, filters, setFilter, reset, activeCount } = filtersApi;
    const s = MEDIA_STRINGS.filters;

    return (
      <div className="flex flex-col gap-2 border-b border-border bg-card px-3 py-2">
        {/* Row 1: search + switcher */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Icon
              icon="mdi:magnify"
              size={16}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
              placeholder={s.searchPlaceholder}
              aria-label={s.searchLabel}
              className="h-8 pl-8 pr-8 text-sm"
            />
            {filters.search && (
              <button
                type="button"
                onClick={() => setFilter("search", "")}
                aria-label={s.clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <Icon icon="mdi:close-circle" size={15} />
              </button>
            )}
          </div>
          <MediaViewSwitcher mode={viewMode} onChange={onViewModeChange} />
        </div>

        {/* Row 2: kind toggle + selects */}
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            value={filters.kind}
            onValueChange={(v) => setFilter("kind", (v || "all") as typeof filters.kind)}
            aria-label={s.kindLabel}
            className="rounded-md border border-border p-0.5"
          >
            <ToggleGroupItem value="all" className="h-7 px-2 text-xs">
              {s.kindAll}
            </ToggleGroupItem>
            {KINDS.map((k) => (
              <Tooltip key={k}>
                <TooltipTrigger asChild>
                  <ToggleGroupItem value={k} aria-label={s.kind[k]} className="h-7 w-7 p-0">
                    <Icon
                      icon={
                        k === "image" ? "mdi:image-outline"
                          : k === "document" ? "mdi:file-document-outline"
                          : k === "audio" ? "mdi:waveform"
                          : "mdi:video-outline"
                      }
                      size={15}
                    />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>{s.kind[k]}</TooltipContent>
              </Tooltip>
            ))}
          </ToggleGroup>

          <Select value={filters.authorType} onValueChange={(v) => setFilter("authorType", v as typeof filters.authorType)}>
            <SelectTrigger className="h-8 w-[140px] text-xs" aria-label={s.authorLabel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{s.authorAll}</SelectItem>
              {AUTHORS.map((a) => (
                <SelectItem key={a} value={a}>{s.author[a]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.period} onValueChange={(v) => setFilter("period", v as typeof filters.period)}>
            <SelectTrigger className="h-8 w-[150px] text-xs" aria-label={s.periodLabel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p} value={p}>{s.period[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {scope === "customer" && (
            <Select
              value={filters.classification}
              onValueChange={(v) => setFilter("classification", v as typeof filters.classification)}
            >
              <SelectTrigger className="h-8 w-[150px] text-xs" aria-label={s.classificationLabel}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{s.classificationAll}</SelectItem>
                {CLASSIFICATIONS.map((c) => (
                  <SelectItem key={c} value={c}>{s.classification[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {activeCount > 0 && (
            <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={reset}>
              <Icon icon="mdi:filter-remove-outline" size={14} />
              {s.clearAll}
              <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px]">{activeCount}</span>
            </Button>
          )}
        </div>
      </div>
    );
  }
  ```
- [ ] **Step 3: Build.** `bun run build` — Expected SUCCEEDS.
- [ ] **Step 4: Commit.**
  ```
  git add src/features/media/components/MediaFilters.tsx src/features/media/i18n/pt-BR.ts
  git commit -m "feat(media): add MediaFilters bar (search/type/author/period/classification) — PRD-026

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 6: `MediaTile` (thumb + type icon + ONE status chip + locked state)

**Files:**
- Create `src/features/media/components/MediaTile.tsx`

One primary chip via `statusChipPriority` (D-13). Color uses the Tailwind `severity-*` utilities only (D-14) — `text-severity-{warning|critical}`, `bg-severity-*/NN`, `border-severity-*/NN`; NEVER `var(--severity-*)` (undefined — the real tokens are `--color-severity-*`). ALWAYS pair color with icon+text (RNF-004). The locked state shows the `SensitiveLock` overlay (built in Task 10, imported here — implement Task 10 before this if executing strictly; otherwise stub the import and resolve when Task 10 lands). To avoid a cycle, this tile **delegates** locked rendering to a prop `lockedOverlay?: React.ReactNode` passed by the grid, computed from `canViewSensitive`. Urgency tiers from `sourceExpiry(asset).tier` map to distinct chip tones (D-13/§5.6): `soft` ⇒ muted warning, `strong` ⇒ solid severity-warning, `critical` ⇒ severity-critical.

- [ ] **Step 1: Add i18n + chip helper strings.** In `src/features/media/i18n/pt-BR.ts`, add inside `MEDIA_STRINGS`:
  ```ts
    chip: {
      failure: "Falha",
      retry: "Tentar novamente",
      expiringDays: (n: number) => `${n}d`,
      expiringLabel: (n: number) => `Expira em ${n} dia${n === 1 ? "" : "s"}`,
      sensitive: "Conteúdo sensível",
    },
  ```
- [ ] **Step 2: Implement the tile.** Create `src/features/media/components/MediaTile.tsx`:
  ```tsx
  // src/features/media/components/MediaTile.tsx
  import type { ReactNode } from "react";
  import type { IMediaAsset } from "@/shared/types";
  import type { IMockUserProfile } from "@/features/auth/mock-users";
  import { Icon } from "@/components/Icon";
  import { cn } from "@/lib/utils";
  import { mediaKindIcon } from "../utils/mediaDisplay";
  import { statusChipPriority } from "../engine/sensitiveAccess";
  import { sourceExpiry } from "../engine/sourceExpiry";
  import { MEDIA_STRINGS } from "../i18n/pt-BR";

  interface IMediaTileProps {
    asset: IMediaAsset;
    /** Current viewer — drives the sensitive gate inside statusChipPriority. */
    viewer: IMockUserProfile | null;
    onOpen: () => void;
    onRetry?: () => void;
    /** Replaces the thumbnail with a blurred placeholder when locked. */
    lockedOverlay?: ReactNode;
    className?: string;
  }

  // D-14: Tailwind severity utilities ONLY — never var(--severity-*).
  // Expiry urgency tiers (D-13/§5.6): soft ⇒ muted warning, strong ⇒ solid warning, critical ⇒ critical.
  const CHIP_TONE: Record<"failure" | "sensitive" | "expiring", string> = {
    failure: "bg-severity-critical/15 text-severity-critical border-severity-critical/30",
    sensitive: "bg-severity-warning/15 text-severity-warning border-severity-warning/30",
    expiring: "bg-severity-warning/15 text-severity-warning border-severity-warning/30",
  };

  const EXPIRY_TONE: Record<"soft" | "strong" | "critical", string> = {
    soft: "bg-severity-warning/10 text-severity-warning/80 border-severity-warning/20",
    strong: "bg-severity-warning/15 text-severity-warning border-severity-warning/30",
    critical: "bg-severity-critical/15 text-severity-critical border-severity-critical/30",
  };

  /** Square thumbnail tile with exactly one priority chip (D-13) + a11y label. */
  export function MediaTile({ asset, viewer, onOpen, onRetry, lockedOverlay, className }: IMediaTileProps) {
    const chip = statusChipPriority(asset, viewer); // 'failure' | 'sensitive' | 'expiring' | 'none'
    const exp = sourceExpiry(asset);
    const c = MEDIA_STRINGS.chip;

    const ariaLabel = [
      asset.fileName ?? mediaKindIcon(asset.kind),
      chip === "sensitive" ? c.sensitive : null,
      chip === "failure" ? c.failure : null,
      chip === "expiring" ? c.expiringLabel(exp.daysLeft) : null,
    ]
      .filter(Boolean)
      .join(" — ");

    return (
      <div
        className={cn("relative aspect-square overflow-hidden rounded-md border border-border bg-muted", className)}
      >
        <button
          type="button"
          onClick={onOpen}
          aria-label={ariaLabel}
          className="group block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {lockedOverlay ?? (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/60 text-muted-foreground">
              <Icon icon={mediaKindIcon(asset.kind)} size={28} />
            </div>
          )}
          {/* type icon badge top-left */}
          <span className="absolute left-1.5 top-1.5 rounded bg-background/80 p-0.5 text-foreground shadow-sm">
            <Icon icon={mediaKindIcon(asset.kind)} size={13} aria-hidden />
          </span>
        </button>

        {/* ONE priority chip, bottom-right */}
        {chip === "sensitive" && (
          <span
            className={cn(
              "absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
              CHIP_TONE.sensitive,
            )}
          >
            <Icon icon="mdi:lock" size={11} aria-hidden />
            {c.sensitive}
          </span>
        )}
        {chip === "expiring" && (
          <span
            className={cn(
              "absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
              EXPIRY_TONE[exp.tier],
            )}
          >
            <Icon icon="mdi:clock-alert-outline" size={11} aria-hidden />
            {c.expiringDays(exp.daysLeft)}
          </span>
        )}

        {/* failure chip carries a real focusable retry button (RF-008, reachable without hover) */}
        {chip === "failure" && (
          <span className={cn("absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium", CHIP_TONE.failure)}>
            <Icon icon="mdi:alert-circle" size={11} aria-hidden />
            {c.failure}
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                aria-label={c.retry}
                className="ml-0.5 rounded-full p-0.5 hover:bg-severity-critical/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <Icon icon="mdi:refresh" size={11} />
              </button>
            )}
          </span>
        )}
      </div>
    );
  }
  ```
  > NOTE: `statusChipPriority(asset, viewer, now?)` returns `'failure' | 'sensitive' | 'expiring' | 'none'` in priority `failure > sensitive > expiring > none`; it derives the sensitive gate internally via `canViewSensitive(viewer)` and the failure state from `asset.persisted === false`. Pass the `IMockUserProfile | null` from `useAuth().currentUser` as `viewer` (type exported by `@/features/auth/mock-users`). Severity colors use the Tailwind utilities the design system exposes (`text-severity-*`, `bg-severity-*/NN`, `border-severity-*/NN`) — NEVER `var(--severity-*)` (undefined; real tokens are `--color-severity-*`).
  > NOTE on roving tabindex: the `role="gridcell"` wrapper is supplied by `MediaGrid` (Task 8) so each tile sits in a real `role="row"` → `role="gridcell"` structure. This tile renders a plain `<div>` (no role) so the grid owns the grid semantics; do not add `role="gridcell"` here.
- [ ] **Step 3: Verify severity utilities resolve.** `bun run build`. The Tailwind `severity-*` utilities come from the `@theme inline` `--color-severity-*` tokens in `src/styles.css` (mirror `src/features/notifications/lib/severity.ts`). Manually confirm contrast with the user during Task 17.
- [ ] **Step 4: Commit.**
  ```
  git add src/features/media/components/MediaTile.tsx src/features/media/i18n/pt-BR.ts
  git commit -m "feat(media): add MediaTile with single priority chip + a11y label (D-13/D-14) — PRD-026

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 7: `MediaCardTile` (Cartões mode)

**Files:**
- Create `src/features/media/components/MediaCardTile.tsx`

Thumb on top, footer = classification badge + filename + meta (`formatBytes` + relative date). Reuses `MediaTile` visual for the thumb area but adds the labelled footer (spec §5.1 "Cartões").

- [ ] **Step 1: Add i18n.** In `src/features/media/i18n/pt-BR.ts`, add inside `MEDIA_STRINGS`:
  ```ts
    card: {
      unnamed: "Sem nome",
      noClassification: "Sem classificação",
    },
  ```
- [ ] **Step 2: Implement.** Create `src/features/media/components/MediaCardTile.tsx`:
  ```tsx
  // src/features/media/components/MediaCardTile.tsx
  import type { ReactNode } from "react";
  import type { IMediaAsset } from "@/shared/types";
  import { Icon } from "@/components/Icon";
  import { cn } from "@/lib/utils";
  import { mediaKindIcon, formatBytes } from "../utils/mediaDisplay";
  import { MEDIA_STRINGS } from "../i18n/pt-BR";

  interface IMediaCardTileProps {
    asset: IMediaAsset;
    onOpen: () => void;
    lockedOverlay?: ReactNode;
    className?: string;
  }

  export function MediaCardTile({ asset, onOpen, lockedOverlay, className }: IMediaCardTileProps) {
    const classLabel = asset.classification
      ? MEDIA_STRINGS.filters.classification[asset.classification]
      : MEDIA_STRINGS.card.noClassification;
    return (
      <div
        role="gridcell"
        className={cn("flex flex-col overflow-hidden rounded-lg border border-border bg-card", className)}
      >
        <button
          type="button"
          onClick={onOpen}
          aria-label={asset.fileName ?? MEDIA_STRINGS.card.unnamed}
          className="relative aspect-video w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {lockedOverlay ?? (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/60 text-muted-foreground">
              <Icon icon={mediaKindIcon(asset.kind)} size={32} />
            </div>
          )}
        </button>
        <div className="flex flex-col gap-1 p-2">
          <span className="inline-flex w-fit items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            <Icon icon={mediaKindIcon(asset.kind)} size={11} aria-hidden />
            {classLabel}
          </span>
          <p className="truncate text-xs font-medium text-foreground">
            {asset.fileName ?? MEDIA_STRINGS.card.unnamed}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {formatBytes(asset.sizeBytes)}
            {asset.sensitivity === "sensitive" && (
              <span className="ml-1 text-severity-warning">· sensível</span>
            )}
          </p>
        </div>
      </div>
    );
  }
  ```
- [ ] **Step 3: Build.** `bun run build` — Expected SUCCEEDS.
- [ ] **Step 4: Commit.**
  ```
  git add src/features/media/components/MediaCardTile.tsx src/features/media/i18n/pt-BR.ts
  git commit -m "feat(media): add MediaCardTile for Cartoes view — PRD-026

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 8: `MediaGrid` (virtualized, role=grid roving-tabindex)

**Files:**
- Create `src/features/media/components/MediaGrid.tsx`

Virtualize with `@tanstack/react-virtual` when items > 60 (D-7); below that render plainly (avoids measuring overhead). Proper `role="grid"` structure (RNF-004 / spec §7): the container is `role="grid"` with `aria-colcount`/`aria-rowcount`; cells are grouped into real **rows of `columns` gridcells** — `role="row"` wrappers each containing `role="gridcell"` children (the `MediaTile`s). Roving tabindex is coordinated at the gridcell level so **Tab enters the grid exactly once** (only the active cell has `tabIndex={0}`; all others `-1`), and arrow keys move focus between cells. Each cell renders a `MediaTile` (which is a plain `<div>`; the `role="gridcell"` lives on the grid's cell wrapper).

- [ ] **Step 1: Implement.** Create `src/features/media/components/MediaGrid.tsx`:
  ```tsx
  // src/features/media/components/MediaGrid.tsx
  import { useCallback, useRef, useState } from "react";
  import type { ReactNode } from "react";
  import { useVirtualizer } from "@tanstack/react-virtual";
  import type { IMediaAsset } from "@/shared/types";
  import type { IMockUserProfile } from "@/features/auth/mock-users";
  import { cn } from "@/lib/utils";
  import { MediaTile } from "./MediaTile";

  interface IMediaGridProps {
    assets: IMediaAsset[];
    columns: number; // 3 in drawer, responsive (2..6) for customer
    viewer: IMockUserProfile | null;
    onOpen: (asset: IMediaAsset) => void;
    onRetry?: (asset: IMediaAsset) => void;
    isLocked: (asset: IMediaAsset) => boolean;
    renderLockedOverlay: (asset: IMediaAsset) => ReactNode;
    className?: string;
  }

  const VIRTUALIZE_THRESHOLD = 60;

  export function MediaGrid({
    assets, columns, viewer, onOpen, onRetry, isLocked, renderLockedOverlay, className,
  }: IMediaGridProps) {
    const parentRef = useRef<HTMLDivElement | null>(null);
    const [active, setActive] = useState(0); // roving tabindex anchor (flat cell index)

    const focusCell = useCallback((idx: number) => {
      const cell = parentRef.current?.querySelectorAll<HTMLElement>("[data-cell]")[idx];
      cell?.querySelector<HTMLElement>("button")?.focus();
    }, []);

    const onKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        let next = active;
        if (e.key === "ArrowRight") next = Math.min(active + 1, assets.length - 1);
        else if (e.key === "ArrowLeft") next = Math.max(active - 1, 0);
        else if (e.key === "ArrowDown") next = Math.min(active + columns, assets.length - 1);
        else if (e.key === "ArrowUp") next = Math.max(active - columns, 0);
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = assets.length - 1;
        else return;
        e.preventDefault();
        setActive(next);
        focusCell(next);
      },
      [active, assets.length, columns, focusCell],
    );

    // A single gridcell. tabIndex roves so Tab enters the grid exactly once.
    const cell = (asset: IMediaAsset, idx: number) => (
      <div data-cell role="gridcell" key={asset.id} tabIndex={idx === active ? 0 : -1}>
        <MediaTile
          asset={asset}
          viewer={viewer}
          onOpen={() => { setActive(idx); onOpen(asset); }}
          onRetry={onRetry ? () => onRetry(asset) : undefined}
          lockedOverlay={isLocked(asset) ? renderLockedOverlay(asset) : undefined}
        />
      </div>
    );

    // A real grid row of up to `columns` cells.
    const rowStyle = { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` };
    const rowCount = Math.ceil(assets.length / columns);
    const renderRow = (rowIndex: number) => {
      const start = rowIndex * columns;
      const rowAssets = assets.slice(start, start + columns);
      return (
        <div role="row" className="grid gap-2" style={rowStyle}>
          {rowAssets.map((a, j) => cell(a, start + j))}
        </div>
      );
    };

    if (assets.length <= VIRTUALIZE_THRESHOLD) {
      return (
        <div
          ref={parentRef}
          role="grid"
          aria-label="Mídias"
          aria-colcount={columns}
          aria-rowcount={rowCount}
          onKeyDown={onKeyDown}
          className={cn("flex flex-col gap-2 p-3", className)}
        >
          {Array.from({ length: rowCount }, (_, r) => (
            <RowWrapper key={r}>{renderRow(r)}</RowWrapper>
          ))}
        </div>
      );
    }

    // Virtualized: each virtual item is one role="row".
    return (
      <div
        ref={parentRef}
        role="grid"
        aria-label="Mídias"
        aria-colcount={columns}
        aria-rowcount={rowCount}
        onKeyDown={onKeyDown}
        className={cn("overflow-auto p-3", className)}
      >
        <VirtualRows parentRef={parentRef} rowCount={rowCount} renderRow={renderRow} />
      </div>
    );
  }

  /** Keeps the row key stable without adding extra DOM (Fragment-like wrapper). */
  function RowWrapper({ children }: { children: ReactNode }) {
    return <>{children}</>;
  }

  function VirtualRows({
    parentRef, rowCount, renderRow,
  }: {
    parentRef: React.RefObject<HTMLDivElement | null>;
    rowCount: number;
    renderRow: (rowIndex: number) => ReactNode;
  }) {
    const rv = useVirtualizer({
      count: rowCount,
      getScrollElement: () => parentRef.current,
      estimateSize: () => 0, // measured below via aspect-square cells; height comes from measureElement
      overscan: 4,
    });
    return (
      <div style={{ height: rv.getTotalSize(), position: "relative" }}>
        {rv.getVirtualItems().map((vr) => (
          <div
            key={vr.key}
            ref={rv.measureElement}
            data-index={vr.index}
            className="pb-2"
            style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vr.start}px)` }}
          >
            {renderRow(vr.index)}
          </div>
        ))}
      </div>
    );
  }
  ```
  > NOTE: `useVirtualizer` with `measureElement` requires dynamic measurement; if Plan A's virtual version is pinned, confirm `useVirtualizer`/`measureElement` exist (they do in `@tanstack/react-virtual` v3). The `estimateSize: () => 0` plus `measureElement` lets row height come from the rendered aspect-square cells. The grid is now a real `role="grid"` → `role="row"` → `role="gridcell"` tree (both virtual and non-virtual paths) so AT announces rows/columns correctly; roving tabindex on the gridcells keeps Tab entering once.
- [ ] **Step 2: Build.** `bun run build` — Expected SUCCEEDS. If `@tanstack/react-virtual` is not yet installed, this fails — confirm Plan A added it (D-7); if missing, STOP and report (out of Plan B scope to add deps).
- [ ] **Step 3: Commit.**
  ```
  git add src/features/media/components/MediaGrid.tsx
  git commit -m "feat(media): add virtualized MediaGrid with roving tabindex (D-7, RNF-004) — PRD-026

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 9: `MediaTypeGroups` (Por tipo: images grid + docs/audio lists)

**Files:**
- Create `src/features/media/components/MediaTypeGroups.tsx`

Images → reuse `MediaGrid` (3 cols) — this is the **only** `role="grid"` in this view (it owns the single roving-tabindex group; Tab enters it once). Documents/Videos → list rows (icon/name/meta) — plain focusable buttons, not gridcells. Audios → list rows with a play affordance + transcription snippet (spec §5.1). Because only the Images section is a grid here, there are no competing grids stealing Tab order in "Por tipo".

- [ ] **Step 1: Add i18n.** In `src/features/media/i18n/pt-BR.ts`, add inside `MEDIA_STRINGS`:
  ```ts
    groups: {
      images: "Imagens",
      documents: "Documentos",
      audios: "Áudios",
      videos: "Vídeos",
      empty: "Nenhum item deste tipo.",
      playAudio: "Reproduzir áudio",
    },
  ```
- [ ] **Step 2: Implement.** Create `src/features/media/components/MediaTypeGroups.tsx`:
  ```tsx
  // src/features/media/components/MediaTypeGroups.tsx
  import type { ReactNode } from "react";
  import type { IMediaAsset } from "@/shared/types";
  import type { IMockUserProfile } from "@/features/auth/mock-users";
  import { Icon } from "@/components/Icon";
  import { mediaKindIcon, formatBytes } from "../utils/mediaDisplay";
  import { MediaGrid } from "./MediaGrid";
  import { MEDIA_STRINGS } from "../i18n/pt-BR";

  interface IMediaTypeGroupsProps {
    assets: IMediaAsset[];
    columns: number;
    viewer: IMockUserProfile | null;
    onOpen: (asset: IMediaAsset) => void;
    onRetry?: (asset: IMediaAsset) => void;
    isLocked: (asset: IMediaAsset) => boolean;
    renderLockedOverlay: (asset: IMediaAsset) => ReactNode;
  }

  function ListRow({ asset, onOpen, snippet, playable }: {
    asset: IMediaAsset; onOpen: () => void; snippet?: string; playable?: boolean;
  }) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
          <Icon icon={playable ? "mdi:play" : mediaKindIcon(asset.kind)} size={16} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-foreground">
            {asset.fileName ?? "—"}
          </span>
          {snippet ? (
            <span className="block truncate text-[11px] text-muted-foreground">{snippet}</span>
          ) : (
            <span className="block text-[11px] text-muted-foreground">{formatBytes(asset.sizeBytes)}</span>
          )}
        </span>
      </button>
    );
  }

  export function MediaTypeGroups({
    assets, columns, viewer, onOpen, onRetry, isLocked, renderLockedOverlay,
  }: IMediaTypeGroupsProps) {
    const g = MEDIA_STRINGS.groups;
    const images = assets.filter((a) => a.kind === "image" || a.kind === "video");
    const docs = assets.filter((a) => a.kind === "document");
    const audios = assets.filter((a) => a.kind === "audio");

    return (
      <div className="flex flex-col gap-4 p-3">
        <section aria-labelledby="media-grp-images">
          <h3 id="media-grp-images" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {g.images} · {images.length}
          </h3>
          {images.length === 0 ? (
            <p className="text-xs text-muted-foreground">{g.empty}</p>
          ) : (
            <MediaGrid
              assets={images} columns={columns} viewer={viewer} onOpen={onOpen} onRetry={onRetry}
              isLocked={isLocked} renderLockedOverlay={renderLockedOverlay}
              className="p-0"
            />
          )}
        </section>

        <section aria-labelledby="media-grp-docs">
          <h3 id="media-grp-docs" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {g.documents} · {docs.length}
          </h3>
          {docs.length === 0 ? (
            <p className="text-xs text-muted-foreground">{g.empty}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {docs.map((a) => <ListRow key={a.id} asset={a} onOpen={() => onOpen(a)} />)}
            </div>
          )}
        </section>

        <section aria-labelledby="media-grp-audios">
          <h3 id="media-grp-audios" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {g.audios} · {audios.length}
          </h3>
          {audios.length === 0 ? (
            <p className="text-xs text-muted-foreground">{g.empty}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {audios.map((a) => (
                <ListRow key={a.id} asset={a} onOpen={() => onOpen(a)} playable snippet={a.transcription} />
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }
  ```
- [ ] **Step 3: Build.** `bun run build` — Expected SUCCEEDS.
- [ ] **Step 4: Commit.**
  ```
  git add src/features/media/components/MediaTypeGroups.tsx src/features/media/i18n/pt-BR.ts
  git commit -m "feat(media): add MediaTypeGroups (Por tipo) layout — PRD-026

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 10: `SensitiveLock` (blurred placeholder + lock + "Solicitar acesso")

**Files:**
- Create `src/features/media/components/SensitiveLock.tsx`

Used as the `lockedOverlay` for tiles AND as the blocked body in the lightbox. The blur is on the **redacted placeholder** from the provider — never the real bytes (D-4). Clicking opens an explanation Dialog with "Solicitar acesso ao gestor"; the attempt is audited by the caller via `useMediaActions.auditSensitiveAttempt` (Task 16). `prefers-reduced-motion`: never animate the blur (spec §7) — the blur is a static class, no transition.

- [ ] **Step 1: Add i18n.** In `src/features/media/i18n/pt-BR.ts`, add inside `MEDIA_STRINGS`:
  ```ts
    sensitive: {
      caption: "Conteúdo sensível — acesso restrito",
      dialogTitle: "Conteúdo sensível",
      dialogBody:
        "Esta mídia contém dados sensíveis (ex.: CPF/CNPJ em nota fiscal). Apenas Owner e Gestor podem visualizá-la. Solicite acesso ao seu gestor se precisar abri-la.",
      requestAccess: "Solicitar acesso ao gestor",
      requestSent: "Solicitação enviada ao gestor.",
      close: "Fechar",
    },
  ```
- [ ] **Step 2: Implement.** Create `src/features/media/components/SensitiveLock.tsx`:
  ```tsx
  // src/features/media/components/SensitiveLock.tsx
  import { useState } from "react";
  import { toast } from "sonner";
  import { Icon } from "@/components/Icon";
  import { Button } from "@/components/ui/button";
  import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  } from "@/components/ui/dialog";
  import { cn } from "@/lib/utils";
  import { MEDIA_STRINGS } from "../i18n/pt-BR";

  interface ISensitiveLockProps {
    /** Variant: tile overlay (compact) or lightbox body (full). */
    variant?: "tile" | "full";
    /** Fired when the user attempts to view — caller audits it (PRD-006). */
    onAttempt?: () => void;
    /** Fired when the user requests access (caller may audit / notify). */
    onRequestAccess?: () => void;
    className?: string;
  }

  /** Redacted, statically-blurred placeholder + lock + access-request dialog (D-4/D-6). */
  export function SensitiveLock({ variant = "tile", onAttempt, onRequestAccess, className }: ISensitiveLockProps) {
    const [open, setOpen] = useState(false);
    const s = MEDIA_STRINGS.sensitive;

    const handleOpen = () => {
      onAttempt?.();
      setOpen(true);
    };
    const handleRequest = () => {
      onRequestAccess?.();
      toast.success(s.requestSent);
      setOpen(false);
    };

    return (
      <>
        <button
          type="button"
          onClick={handleOpen}
          aria-label={s.caption}
          className={cn(
            "group relative flex h-full w-full flex-col items-center justify-center gap-1",
            // NOTE: static blur — never transition/animate (prefers-reduced-motion safe, spec §7)
            "bg-[linear-gradient(135deg,var(--muted),color-mix(in_oklab,var(--muted),black_8%))] blur-[2px]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <span aria-hidden className="pointer-events-none select-none text-muted-foreground/40">
            {/* redacted bars — not the real content */}
            <span className="block h-2 w-24 rounded bg-muted-foreground/30" />
            <span className="mt-1 block h-2 w-16 rounded bg-muted-foreground/20" />
          </span>
        </button>
        {/* lock + caption overlaid sharp (not blurred) */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
          <Icon icon="mdi:lock" size={variant === "full" ? 40 : 22} className="text-severity-warning" aria-hidden />
          {variant === "full" && (
            <span className="px-4 text-center text-xs text-muted-foreground">{s.caption}</span>
          )}
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Icon icon="mdi:lock" size={18} className="text-severity-warning" />
                {s.dialogTitle}
              </DialogTitle>
              <DialogDescription>{s.dialogBody}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>{s.close}</Button>
              <Button onClick={handleRequest}>{s.requestAccess}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }
  ```
  > NOTE: The tile usage wraps this in a `relative` container; the lock overlay is `absolute inset-0`. When used as `lockedOverlay` in `MediaTile`, the tile's outer `div` is already `relative`. Confirm the `--muted`/`--severity-warning` tokens during Task 17 manual review.
- [ ] **Step 3: Build.** `bun run build` — Expected SUCCEEDS.
- [ ] **Step 4: Commit.**
  ```
  git add src/features/media/components/SensitiveLock.tsx src/features/media/i18n/pt-BR.ts
  git commit -m "feat(media): add SensitiveLock placeholder + access-request dialog (D-4/D-6) — PRD-026

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 11: `MediaAudioPlayer` (Slider + speed persisted across items + transcript highlight)

**Files:**
- Create `src/features/media/components/MediaAudioPlayer.tsx`

No real audio in Fase 1 — drive a simulated timeline with `requestAnimationFrame` over a mocked duration so the Slider/Space/play are interactive; speed (`1x/1.5x/2x`) persists in `localStorage["gallo-media-audio-speed"]` so it survives switching items (spec §5.4). Transcript highlights the search term using the engine `highlightSegments` (returns `{ text, isMatch }[]`).

- [ ] **Step 1: Add i18n.** In `src/features/media/i18n/pt-BR.ts`, add inside `MEDIA_STRINGS`:
  ```ts
    audio: {
      play: "Reproduzir",
      pause: "Pausar",
      speed: "Velocidade",
      noTranscription: "Sem transcrição disponível.",
      transcriptionLabel: "Transcrição",
    },
  ```
- [ ] **Step 2: Implement.** Create `src/features/media/components/MediaAudioPlayer.tsx`:
  ```tsx
  // src/features/media/components/MediaAudioPlayer.tsx
  import { useCallback, useEffect, useRef, useState } from "react";
  import type { IMediaAsset } from "@/shared/types";
  import { Icon } from "@/components/Icon";
  import { Button } from "@/components/ui/button";
  import { Slider } from "@/components/ui/slider";
  import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
  import { highlightSegments } from "../engine/mediaFiltering";
  import { MEDIA_STRINGS } from "../i18n/pt-BR";

  const SPEED_KEY = "gallo-media-audio-speed";
  const SPEEDS = ["1", "1.5", "2"] as const;
  type Speed = (typeof SPEEDS)[number];

  function readSpeed(): Speed {
    if (typeof window === "undefined") return "1";
    const raw = window.localStorage.getItem(SPEED_KEY);
    return (SPEEDS as readonly string[]).includes(raw ?? "") ? (raw as Speed) : "1";
  }

  interface IMediaAudioPlayerProps {
    asset: IMediaAsset;
    /** Search term to highlight in the transcript. */
    searchTerm?: string;
    /** Exposes play/pause so the lightbox Space key can toggle it. */
    registerToggle?: (toggle: () => void) => void;
  }

  /** Simulated audio player (no real bytes in Fase 1). Speed persists across items. */
  export function MediaAudioPlayer({ asset, searchTerm, registerToggle }: IMediaAudioPlayerProps) {
    const a = MEDIA_STRINGS.audio;
    // Mock duration derived from size for determinism (seconds).
    const duration = Math.max(8, Math.round(asset.sizeBytes / 4000));
    const [playing, setPlaying] = useState(false);
    const [pos, setPos] = useState(0); // seconds
    const [speed, setSpeed] = useState<Speed>(() => readSpeed());
    const raf = useRef<number | null>(null);
    const last = useRef<number>(0);

    useEffect(() => {
      try { window.localStorage.setItem(SPEED_KEY, speed); } catch { /* ignore */ }
    }, [speed]);

    // Reset position when the asset changes (speed intentionally kept).
    useEffect(() => { setPos(0); setPlaying(false); }, [asset.id]);

    const toggle = useCallback(() => setPlaying((p) => !p), []);
    useEffect(() => { registerToggle?.(toggle); }, [registerToggle, toggle]);

    useEffect(() => {
      if (!playing) return;
      last.current = performance.now();
      const step = (t: number) => {
        const dt = ((t - last.current) / 1000) * Number(speed);
        last.current = t;
        setPos((prev) => {
          const next = prev + dt;
          if (next >= duration) { setPlaying(false); return duration; }
          return next;
        });
        raf.current = requestAnimationFrame(step);
      };
      raf.current = requestAnimationFrame(step);
      return () => { if (raf.current) cancelAnimationFrame(raf.current); };
    }, [playing, speed, duration]);

    const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
    const segments = asset.transcription ? highlightSegments(asset.transcription, searchTerm ?? "") : [];

    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Button
            size="icon"
            variant="secondary"
            onClick={toggle}
            aria-label={playing ? a.pause : a.play}
            className="h-10 w-10 rounded-full"
          >
            <Icon icon={playing ? "mdi:pause" : "mdi:play"} size={20} />
          </Button>
          <div className="flex flex-1 items-center gap-2">
            <span className="w-9 text-[11px] tabular-nums text-muted-foreground">{fmt(pos)}</span>
            <Slider
              value={[pos]}
              max={duration}
              step={1}
              onValueChange={([v]) => setPos(v)}
              aria-label="Posição do áudio"
              className="flex-1"
            />
            <span className="w-9 text-[11px] tabular-nums text-muted-foreground">{fmt(duration)}</span>
          </div>
          <ToggleGroup
            type="single"
            value={speed}
            onValueChange={(v) => v && setSpeed(v as Speed)}
            aria-label={a.speed}
            className="rounded-md border border-border p-0.5"
          >
            {SPEEDS.map((sp) => (
              <ToggleGroupItem key={sp} value={sp} className="h-7 px-2 text-[11px]">
                {sp}x
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {a.transcriptionLabel}
          </p>
          {segments.length === 0 ? (
            <p className="text-xs text-muted-foreground">{a.noTranscription}</p>
          ) : (
            <p className="text-xs leading-relaxed text-foreground">
              {segments.map((seg, i) =>
                seg.isMatch ? (
                  <mark key={i} className="rounded bg-severity-info/25 px-0.5 text-foreground">
                    {seg.text}
                  </mark>
                ) : (
                  <span key={i}>{seg.text}</span>
                ),
              )}
            </p>
          )}
        </div>
      </div>
    );
  }
  ```
  > NOTE: `highlightSegments(text, term): { text: string; isMatch: boolean }[]` is Plan A's helper (built on `highlightRanges`). Map over it directly. The `<mark>` uses the `bg-severity-info/NN` Tailwind utility — never `var(--severity-info)`.
- [ ] **Step 3: Build.** `bun run build` — Expected SUCCEEDS.
- [ ] **Step 4: Commit.**
  ```
  git add src/features/media/components/MediaAudioPlayer.tsx src/features/media/i18n/pt-BR.ts
  git commit -m "feat(media): add MediaAudioPlayer with persisted speed + transcript highlight — PRD-026

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 12: `MediaLightbox` (Dialog full-screen + responsive aside + keymap)

**Files:**
- Create `src/features/media/components/AnnotationLayer.tsx`
- Create `src/features/media/components/MediaLightbox.tsx`

`Dialog` full-screen. Center = image (`object-contain`) with zoom + `‹ ›` + a **read-only annotation overlay** (`AnnotationLayer`) rendering `asset.annotations` over the image when present (spec §5.7 read-back); audio → `MediaAudioPlayer`; document → "Abrir/Baixar" only. Aside (desktop) → bottom `Sheet` (mobile) per D-12: render the aside inline on `lg+`, and a `Sheet side="bottom"` toggled by a button on small screens. The aside shows the classification chip (`severity-warning` Tailwind utilities when sensitive), metadata, the **suggested classification + link CTA** (Fase 4 assisted classify/link, surfaced via `renderActions` from the gallery), and — when `scope==='customer'` and `asset.conversationId` exists — a concrete **"Abrir conversa"** action that navigates to the origin conversation (spec §5.3/D-12). Keymap: `←/→` prev/next, `Esc` close, `Space` audio toggle, `+/-` zoom — the global handler ignores events from inputs/sliders/textarea (spec §5.4). Actions RBAC-gated via the `renderActions` slot injected by the gallery (computed from `useMediaActions` + `Can`). Sensitive + not-allowed → blocked body (`SensitiveLock variant="full"`), no preview/download.

The read-only `AnnotationLayer` is a small shared SVG overlay (extracted into `src/features/media/components/AnnotationLayer.tsx`) reused by `MediaAnnotator` (Task 14) in edit mode — single source of truth for rendering annotations from normalized coords.

- [ ] **Step 1: Add i18n.** In `src/features/media/i18n/pt-BR.ts`, add inside `MEDIA_STRINGS`:
  ```ts
    lightbox: {
      close: "Fechar",
      prev: "Anterior",
      next: "Próxima",
      zoomIn: "Aumentar zoom",
      zoomOut: "Reduzir zoom",
      openDoc: "Abrir documento",
      downloadDoc: "Baixar",
      details: "Detalhes e ações",
      meta: { author: "Autor", date: "Data", size: "Tamanho", classification: "Classificação", links: "Vínculos" },
      noLinks: "Sem vínculos.",
      openConversation: "Abrir conversa",
      counter: (i: number, total: number) => `${i} de ${total}`,
    },
  ```
- [ ] **Step 2: Extract the shared read-only annotation overlay.** Create `src/features/media/components/AnnotationLayer.tsx`. It maps `IMediaAnnotation[]` (normalized 0..1 coords) to SVG circles/lines/text over a `viewBox="0 0 100 100"` canvas. Colors are TOKEN NAMES on `IMediaAnnotation.color` (e.g. `'critical' | 'warning' | 'info'`) mapped to a `stroke`/`fill` class via a small map — never a raw CSS var. Reused read-only by `MediaLightbox` (here) and in edit mode by `MediaAnnotator` (Task 14).
  ```tsx
  // src/features/media/components/AnnotationLayer.tsx
  import type { IMediaAnnotation } from "@/shared/types";
  import { cn } from "@/lib/utils";

  /** IMediaAnnotation.color stores a severity TOKEN NAME → Tailwind text color class. */
  const ANNOTATION_TONE: Record<string, string> = {
    critical: "text-severity-critical",
    warning: "text-severity-warning",
    info: "text-severity-info",
    success: "text-severity-success",
  };

  /** Resolve a token name to its class; default to info if unknown. */
  export function annotationToneClass(color: string): string {
    return ANNOTATION_TONE[color] ?? ANNOTATION_TONE.info;
  }

  interface IAnnotationLayerProps {
    annotations: IMediaAnnotation[];
    /** Extra classes for the wrapping <svg> (e.g. "absolute inset-0"). */
    className?: string;
  }

  /**
   * Read-only SVG render of normalized annotations (point/arrow/text).
   * `currentColor` lets the token-name → text-color class drive stroke/fill,
   * so the actual hue resolves from the design-system severity tokens (D-14).
   */
  export function AnnotationLayer({ annotations, className }: IAnnotationLayerProps) {
    return (
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className={cn("pointer-events-none h-full w-full", className)}
        aria-hidden
      >
        <defs>
          <marker id="annlayer-arrowhead" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto">
            <path d="M0,0 L4,2 L0,4 Z" fill="currentColor" />
          </marker>
        </defs>
        {annotations.map((a) => (
          <g key={a.id} className={annotationToneClass(a.color)} stroke="currentColor" fill="currentColor">
            {a.type === "arrow" && a.x2 != null && a.y2 != null && (
              <line
                x1={a.x * 100} y1={a.y * 100} x2={a.x2 * 100} y2={a.y2 * 100}
                strokeWidth={0.8} markerEnd="url(#annlayer-arrowhead)"
              />
            )}
            <circle cx={a.x * 100} cy={a.y * 100} r={1.2} />
            {a.label && (
              <text x={a.x * 100 + 2} y={a.y * 100} fontSize={3} stroke="none">{a.label}</text>
            )}
          </g>
        ))}
      </svg>
    );
  }
  ```
- [ ] **Step 3: Implement.** Create `src/features/media/components/MediaLightbox.tsx`:
  ```tsx
  // src/features/media/components/MediaLightbox.tsx
  import { useCallback, useEffect, useRef, useState } from "react";
  import type { ReactNode } from "react";
  import type { IMediaAsset } from "@/shared/types";
  import { Icon } from "@/components/Icon";
  import { Button } from "@/components/ui/button";
  import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
  import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
  import { cn } from "@/lib/utils";
  import { formatBytes } from "../utils/mediaDisplay";
  import { MediaAudioPlayer } from "./MediaAudioPlayer";
  import { SensitiveLock } from "./SensitiveLock";
  import { AnnotationLayer } from "./AnnotationLayer";
  import { MEDIA_STRINGS } from "../i18n/pt-BR";

  interface IMediaLightboxProps {
    assets: IMediaAsset[];
    index: number | null;
    onIndexChange: (i: number | null) => void;
    /** Whether the current user may view the active asset (false → blocked body). */
    canView: (asset: IMediaAsset) => boolean;
    /** Right-aside actions (Anotar/Classificar/Vincular/Baixar/Excluir), RBAC-gated by the gallery. */
    renderActions: (asset: IMediaAsset) => ReactNode;
    /** Audited when a blocked sensitive asset is opened. */
    onSensitiveAttempt?: (asset: IMediaAsset) => void;
    /**
     * Navigate to the origin conversation (customer scope only). When provided
     * AND the asset has a conversationId, the aside renders an "Abrir conversa"
     * action (spec §5.3/D-12). The gallery wires this with TanStack Router navigate.
     */
    onOpenConversation?: (asset: IMediaAsset) => void;
    searchTerm?: string;
  }

  function isFormField(el: EventTarget | null): boolean {
    const node = el as HTMLElement | null;
    if (!node) return false;
    const tag = node.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || node.getAttribute("role") === "slider" || node.isContentEditable;
  }

  export function MediaLightbox({
    assets, index, onIndexChange, canView, renderActions, onSensitiveAttempt, onOpenConversation, searchTerm,
  }: IMediaLightboxProps) {
    const open = index !== null;
    const asset = open ? assets[index] : null;
    const [zoom, setZoom] = useState(1);
    const [asideOpen, setAsideOpen] = useState(false);
    const audioToggle = useRef<(() => void) | null>(null);
    const l = MEDIA_STRINGS.lightbox;

    const go = useCallback((delta: number) => {
      if (index === null) return;
      const next = index + delta;
      if (next >= 0 && next < assets.length) { onIndexChange(next); setZoom(1); }
    }, [index, assets.length, onIndexChange]);

    useEffect(() => {
      if (!open) return;
      const onKey = (e: KeyboardEvent) => {
        if (isFormField(e.target)) return;
        if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
        else if (e.key === "Escape") { onIndexChange(null); }
        else if (e.key === " ") { if (asset?.kind === "audio") { e.preventDefault(); audioToggle.current?.(); } }
        else if (e.key === "+" || e.key === "=") { e.preventDefault(); setZoom((z) => Math.min(z + 0.25, 3)); }
        else if (e.key === "-") { e.preventDefault(); setZoom((z) => Math.max(z - 0.25, 1)); }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [open, go, asset, onIndexChange]);

    if (!open || !asset) return null;
    const allowed = canView(asset);

    const Aside = (
      <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
        <h3 className="text-sm font-semibold text-foreground">{l.details}</h3>
        {allowed ? (
          <>
            <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">{l.meta.author}</dt>
              <dd className="text-foreground">{asset.authorType}</dd>
              <dt className="text-muted-foreground">{l.meta.date}</dt>
              <dd className="text-foreground">{new Date(asset.createdAt).toLocaleString("pt-BR")}</dd>
              <dt className="text-muted-foreground">{l.meta.size}</dt>
              <dd className="text-foreground">{formatBytes(asset.sizeBytes)}</dd>
              <dt className="text-muted-foreground">{l.meta.classification}</dt>
              <dd>
                <span className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px]",
                  asset.sensitivity === "sensitive"
                    ? "border-severity-warning/30 bg-severity-warning/15 text-severity-warning"
                    : "border-border bg-muted text-muted-foreground",
                )}>
                  {asset.classification ?? "—"}
                </span>
              </dd>
            </dl>
            {/* "Abrir conversa" — customer scope, origin conversation (spec §5.3/D-12) */}
            {onOpenConversation && asset.conversationId && (
              <Button
                variant="outline"
                size="sm"
                className="w-fit gap-1"
                onClick={() => onOpenConversation(asset)}
              >
                <Icon icon="mdi:message-text-outline" size={14} />
                {l.openConversation}
              </Button>
            )}
            <div className="border-t border-border pt-3">{renderActions(asset)}</div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{MEDIA_STRINGS.sensitive.caption}</p>
        )}
      </div>
    );

    return (
      <Dialog open={open} onOpenChange={(o) => !o && onIndexChange(null)}>
        <DialogContent className="h-[100dvh] w-screen max-w-none gap-0 border-0 bg-background/98 p-0 sm:rounded-none">
          <DialogTitle className="sr-only">{asset.fileName ?? "Mídia"}</DialogTitle>
          <div className="flex h-full min-h-0 flex-col lg:flex-row">
            {/* center */}
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
              <Button
                variant="ghost" size="icon"
                className="absolute right-3 top-3 z-10"
                aria-label={l.close}
                onClick={() => onIndexChange(null)}
              >
                <Icon icon="mdi:close" size={22} />
              </Button>
              <span className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-card/80 px-3 py-1 text-[11px] text-muted-foreground">
                {l.counter(index + 1, assets.length)}
              </span>

              {index > 0 && (
                <Button variant="ghost" size="icon" className="absolute left-3 top-1/2 z-10 -translate-y-1/2"
                        aria-label={l.prev} onClick={() => go(-1)}>
                  <Icon icon="mdi:chevron-left" size={28} />
                </Button>
              )}
              {index < assets.length - 1 && (
                <Button variant="ghost" size="icon" className="absolute right-3 top-1/2 z-10 -translate-y-1/2"
                        aria-label={l.next} onClick={() => go(1)}>
                  <Icon icon="mdi:chevron-right" size={28} />
                </Button>
              )}

              {!allowed ? (
                <div className="relative h-full w-full" onClickCapture={() => onSensitiveAttempt?.(asset)}>
                  <SensitiveLock variant="full" />
                </div>
              ) : asset.kind === "image" || asset.kind === "video" ? (
                <>
                  <div
                    className="relative flex h-full w-full items-center justify-center bg-muted/40 text-muted-foreground"
                    style={{ transform: `scale(${zoom})` }}
                  >
                    {/* Fase 1: placeholder thumbnail (no real bytes). */}
                    <Icon icon="mdi:image-outline" size={72} aria-hidden />
                    {/* read-only annotation read-back over the image (spec §5.7) */}
                    {asset.annotations && asset.annotations.length > 0 && (
                      <AnnotationLayer annotations={asset.annotations} className="absolute inset-0" />
                    )}
                  </div>
                  <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1 rounded-full bg-card/80 p-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={l.zoomOut}
                            onClick={() => setZoom((z) => Math.max(z - 0.25, 1))}>
                      <Icon icon="mdi:magnify-minus-outline" size={18} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={l.zoomIn}
                            onClick={() => setZoom((z) => Math.min(z + 0.25, 3))}>
                      <Icon icon="mdi:magnify-plus-outline" size={18} />
                    </Button>
                  </div>
                </>
              ) : asset.kind === "audio" ? (
                <div className="w-full max-w-xl px-6">
                  <MediaAudioPlayer
                    asset={asset}
                    searchTerm={searchTerm}
                    registerToggle={(t) => { audioToggle.current = t; }}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <Icon icon="mdi:file-document-outline" size={64} aria-hidden />
                  <p className="text-sm text-foreground">{asset.fileName ?? "—"}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm"><Icon icon="mdi:open-in-new" size={15} className="mr-1" />{l.openDoc}</Button>
                    <Button variant="secondary" size="sm"><Icon icon="mdi:download" size={15} className="mr-1" />{l.downloadDoc}</Button>
                  </div>
                </div>
              )}

              {/* mobile: open aside as bottom sheet (D-12) */}
              <Button
                variant="secondary" size="sm"
                className="absolute bottom-3 right-3 z-10 lg:hidden"
                onClick={() => setAsideOpen(true)}
              >
                <Icon icon="mdi:information-outline" size={15} className="mr-1" />
                {l.details}
              </Button>
            </div>

            {/* desktop aside */}
            <aside className="hidden w-80 shrink-0 border-l border-border bg-card lg:block">{Aside}</aside>
          </div>

          {/* mobile bottom sheet */}
          <Sheet open={asideOpen} onOpenChange={setAsideOpen}>
            <SheetContent side="bottom" className="max-h-[70vh] p-0 lg:hidden">
              <SheetHeader className="sr-only"><SheetTitle>{l.details}</SheetTitle></SheetHeader>
              {Aside}
            </SheetContent>
          </Sheet>
        </DialogContent>
      </Dialog>
    );
  }
  ```
- [ ] **Step 4: Build.** `bun run build` — Expected SUCCEEDS.
- [ ] **Step 5: Commit.**
  ```
  git add src/features/media/components/AnnotationLayer.tsx src/features/media/components/MediaLightbox.tsx src/features/media/i18n/pt-BR.ts
  git commit -m "feat(media): add MediaLightbox + shared AnnotationLayer read-back (D-12, §5.7) — PRD-026

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 13: `MediaActions` hook (classify/link/sensitivity/delete/annotate + audit)

**Files:**
- Create `src/features/media/hooks/useMediaActions.ts`

Wraps `provider.update`/`provider.delete` + `auditLog` (`@/features/rbac/utils/auditLog`) and invalidates the relevant queries. Annotation save sets `version: 2`. Also exposes `auditSensitiveAttempt` used by the lock/lightbox (spec §5.5).

Assisted classify + link (spec §3.3 / Fase 4): the hook exposes `suggestClassification(asset)` (delegates to engine `classifyMedia`) and `setClassification(asset, classification)` so the UI can **preselect the suggested classification** instead of hardcoding `'outro'`. It also exposes a link API — `linkVehicle`/`linkOrder`/`linkPart` (PRD-016 vehicle / Order / PRD-021 part) — each requiring explicit user confirmation at the call site and writing an `auditLog` entry. The generic `link(asset, patch)` remains for batched link patches; the three typed helpers are thin wrappers that audit the specific link kind.

- [ ] **Step 1: Add i18n.** In `src/features/media/i18n/pt-BR.ts`, add inside `MEDIA_STRINGS`:
  ```ts
    actions: {
      annotate: "Anotar",
      classify: "Classificar",
      link: "Vincular",
      download: "Baixar",
      delete: "Excluir",
      deleteTitle: "Excluir esta mídia?",
      deleteBody: "A mídia será removida da galeria. Esta ação fica registrada na auditoria.",
      deleteConfirm: "Excluir",
      cancel: "Cancelar",
      classifiedToast: "Classificação atualizada.",
      linkedToast: "Vínculo salvo.",
      sensitivityToast: "Sensibilidade atualizada.",
      deletedToast: "Mídia excluída.",
      annotatedToast: "Anotações salvas.",
      suggestedClassification: (label: string) => `Sugestão: ${label}`,
      applySuggestion: "Aplicar sugestão",
      linkVehicle: "Vincular veículo",
      linkOrder: "Vincular pedido",
      linkPart: "Vincular peça",
      linkConfirmTitle: "Confirmar vínculo?",
      linkConfirmBody: "O vínculo será registrado na auditoria.",
      linkConfirm: "Vincular",
    },
  ```
- [ ] **Step 2: Implement.** Create `src/features/media/hooks/useMediaActions.ts`:
  ```ts
  // src/features/media/hooks/useMediaActions.ts
  import { useCallback } from "react";
  import { useQueryClient } from "@tanstack/react-query";
  import { toast } from "sonner";
  import type { ID, IMediaAsset, IMediaAnnotation, IMediaClassification } from "@/shared/types";
  import { useMediaStorageProvider } from "@/providers/data";
  import { auditLog } from "@/features/rbac/utils/auditLog";
  import { classifyMedia } from "../engine/classifyMedia";
  import { MEDIA_STRINGS } from "../i18n/pt-BR";

  export interface IMediaLinkPatch {
    linkedVehicleId?: ID;
    linkedOrderId?: ID;
    linkedPartId?: ID;
  }

  export function useMediaActions() {
    const provider = useMediaStorageProvider();
    const qc = useQueryClient();
    const a = MEDIA_STRINGS.actions;

    const invalidate = useCallback(
      (asset: IMediaAsset) => {
        if (asset.conversationId)
          void qc.invalidateQueries({ queryKey: ["media", "conversation", asset.conversationId] });
        if (asset.customerId)
          void qc.invalidateQueries({ queryKey: ["media", "customer", asset.customerId] });
      },
      [qc],
    );

    /** Engine-derived suggestion to preselect in the classify picker (spec §3.3). */
    const suggestClassification = useCallback(
      (asset: IMediaAsset): IMediaClassification => classifyMedia(asset),
      [],
    );

    const setClassification = useCallback(
      async (asset: IMediaAsset, classification: IMediaClassification) => {
        const updated = await provider.update(asset.id, { classification });
        auditLog({ action: "media.classify", resource: "media", resourceId: asset.id,
          before: { classification: asset.classification }, after: { classification } });
        invalidate(asset);
        toast.success(a.classifiedToast);
        return updated;
      },
      [provider, invalidate, a.classifiedToast],
    );

    const link = useCallback(
      async (asset: IMediaAsset, patch: IMediaLinkPatch) => {
        const updated = await provider.update(asset.id, patch);
        auditLog({ action: "media.link", resource: "media", resourceId: asset.id, after: patch });
        invalidate(asset);
        toast.success(a.linkedToast);
        return updated;
      },
      [provider, invalidate, a.linkedToast],
    );

    /** Typed link helpers — each audits the specific link kind (PRD-016/Order/PRD-021). */
    const linkVehicle = useCallback(
      async (asset: IMediaAsset, linkedVehicleId: ID) => {
        const updated = await provider.update(asset.id, { linkedVehicleId });
        auditLog({ action: "media.link_vehicle", resource: "media", resourceId: asset.id, after: { linkedVehicleId } });
        invalidate(asset);
        toast.success(a.linkedToast);
        return updated;
      },
      [provider, invalidate, a.linkedToast],
    );

    const linkOrder = useCallback(
      async (asset: IMediaAsset, linkedOrderId: ID) => {
        const updated = await provider.update(asset.id, { linkedOrderId });
        auditLog({ action: "media.link_order", resource: "media", resourceId: asset.id, after: { linkedOrderId } });
        invalidate(asset);
        toast.success(a.linkedToast);
        return updated;
      },
      [provider, invalidate, a.linkedToast],
    );

    const linkPart = useCallback(
      async (asset: IMediaAsset, linkedPartId: ID) => {
        const updated = await provider.update(asset.id, { linkedPartId });
        auditLog({ action: "media.link_part", resource: "media", resourceId: asset.id, after: { linkedPartId } });
        invalidate(asset);
        toast.success(a.linkedToast);
        return updated;
      },
      [provider, invalidate, a.linkedToast],
    );

    const setSensitivity = useCallback(
      async (asset: IMediaAsset, sensitivity: IMediaAsset["sensitivity"]) => {
        const updated = await provider.update(asset.id, { sensitivity });
        auditLog({ action: "media.sensitivity_change", resource: "media", resourceId: asset.id,
          before: { sensitivity: asset.sensitivity }, after: { sensitivity } });
        invalidate(asset);
        toast.success(a.sensitivityToast);
        return updated;
      },
      [provider, invalidate, a.sensitivityToast],
    );

    const remove = useCallback(
      async (asset: IMediaAsset) => {
        await provider.delete(asset.id); // provider also audits deletion (D-4)
        auditLog({ action: "media.delete", resource: "media", resourceId: asset.id, before: asset });
        invalidate(asset);
        toast.success(a.deletedToast);
      },
      [provider, invalidate, a.deletedToast],
    );

    const annotate = useCallback(
      async (asset: IMediaAsset, annotations: IMediaAnnotation[]) => {
        const updated = await provider.update(asset.id, { annotations, version: 2 });
        auditLog({ action: "media.annotate", resource: "media", resourceId: asset.id,
          after: { count: annotations.length, version: 2 } });
        invalidate(asset);
        toast.success(a.annotatedToast);
        return updated;
      },
      [provider, invalidate, a.annotatedToast],
    );

    /** Fire-and-forget audit of a blocked sensitive view/open (spec §5.5). */
    const auditSensitiveAttempt = useCallback((asset: IMediaAsset, kind: "view" | "open" | "download") => {
      auditLog({ action: `media.sensitive_${kind}_blocked`, resource: "media", resourceId: asset.id });
    }, []);

    /** Audit a successful sensitive open/download by an authorized user. */
    const auditSensitiveAccess = useCallback((asset: IMediaAsset, kind: "open" | "download") => {
      if (asset.sensitivity !== "sensitive") return;
      auditLog({ action: `media.sensitive_${kind}`, resource: "media", resourceId: asset.id });
    }, []);

    return {
      suggestClassification, setClassification,
      link, linkVehicle, linkOrder, linkPart,
      setSensitivity, remove, annotate,
      auditSensitiveAttempt, auditSensitiveAccess,
    };
  }
  ```
  > NOTE: `auditLog` accepts `resource: string` (see `IAuditLogParams`) so `"media"` is valid because Plan A registers the `"media"` RESOURCE in the same task its mock provider first uses `scopedListParams("media")` (no Task6→Task10 window). `classifyMedia` is Plan A's engine — verify it accepts the asset/input shape; `suggestClassification` only reads, never writes.
- [ ] **Step 3: Build.** `bun run build` — Expected SUCCEEDS.
- [ ] **Step 4: Commit.**
  ```
  git add src/features/media/hooks/useMediaActions.ts src/features/media/i18n/pt-BR.ts
  git commit -m "feat(media): add useMediaActions (classify/link/sensitivity/delete/annotate + audit) — PRD-026

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 14: `MediaAnnotator` (SVG overlay + accessible list + save version 2)

**Files:**
- Create `src/features/media/components/MediaAnnotator.tsx`

SVG overlay with tools point/arrow/text; coords normalized 0..1 via Plan A's `normalizePoint({ x, y }, { width, height })` / `denormalizePoint`; parallel accessible list (each annotation focusable, labelled, editable, removable; arrow keys nudge ±1px / Shift ±10px). Save calls `useMediaActions().annotate(asset, list)` → version 2. `IMediaAnnotation.color` stores a TOKEN NAME (e.g. `'info'`/`'warning'`/`'critical'`) that the UI maps to a class — not a raw CSS var (D-14). The edit-mode SVG render reuses the shared `AnnotationLayer` rendering primitives where practical; the interactive edit canvas adds the click handler + tool state on top.

- [ ] **Step 1: Add i18n.** In `src/features/media/i18n/pt-BR.ts`, add inside `MEDIA_STRINGS`:
  ```ts
    annotator: {
      tools: { point: "Ponto", arrow: "Seta", text: "Texto", select: "Selecionar" },
      listTitle: "Anotações",
      empty: "Nenhuma anotação ainda. Selecione uma ferramenta e clique na imagem.",
      labelPlaceholder: "Descrição da anotação…",
      save: "Salvar anotações",
      cancel: "Cancelar",
      remove: "Remover anotação",
      nudgeHint: "Use as setas para mover (Shift = 10px)",
    },
  ```
- [ ] **Step 2: Implement.** Create `src/features/media/components/MediaAnnotator.tsx`:
  ```tsx
  // src/features/media/components/MediaAnnotator.tsx
  import { useRef, useState } from "react";
  import type { IMediaAnnotation, IMediaAsset } from "@/shared/types";
  import { Icon } from "@/components/Icon";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
  import { cn } from "@/lib/utils";
  import { normalizePoint } from "../engine/annotationCoords";
  import { annotationToneClass } from "./AnnotationLayer";
  import { useMediaActions } from "../hooks/useMediaActions";
  import { MEDIA_STRINGS } from "../i18n/pt-BR";

  type Tool = "select" | "point" | "arrow" | "text";

  interface IMediaAnnotatorProps {
    asset: IMediaAsset;
    currentUserId: string;
    onClose: () => void;
  }

  // IMediaAnnotation.color stores a TOKEN NAME (not a raw CSS var) — mapped to a class by annotationToneClass (D-14).
  const COLOR_TOKEN = "info";
  const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);

  export function MediaAnnotator({ asset, currentUserId, onClose }: IMediaAnnotatorProps) {
    const { annotate } = useMediaActions();
    const [tool, setTool] = useState<Tool>("select");
    const [items, setItems] = useState<IMediaAnnotation[]>(asset.annotations ?? []);
    const [saving, setSaving] = useState(false);
    const svgRef = useRef<SVGSVGElement | null>(null);
    const t = MEDIA_STRINGS.annotator;

    const addAt = (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (tool === "select") return;
      const { x, y } = normalizePoint(
        { x: clientX - rect.left, y: clientY - rect.top },
        { width: rect.width, height: rect.height },
      );
      const base: IMediaAnnotation = {
        id: `ann-${Date.now()}`,
        type: tool,
        x, y,
        color: COLOR_TOKEN,
        createdBy: currentUserId,
        createdAt: new Date().toISOString(),
        ...(tool === "arrow" ? { x2: Math.min(x + 0.1, 1), y2: Math.min(y + 0.1, 1) } : {}),
        ...(tool === "text" ? { label: "" } : {}),
      };
      setItems((prev) => [...prev, base]);
    };

    const update = (id: string, patch: Partial<IMediaAnnotation>) =>
      setItems((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    const remove = (id: string) => setItems((prev) => prev.filter((a) => a.id !== id));

    const nudge = (id: string, dx: number, dy: number) =>
      setItems((prev) => prev.map((a) =>
        a.id === id ? { ...a, x: clamp01(a.x + dx), y: clamp01(a.y + dy) } : a));

    const onListKey = (e: React.KeyboardEvent, id: string) => {
      const big = e.shiftKey ? 10 : 1;
      const step = big / 1000; // ~px→normalized on a ~1000px canvas; fine for mock
      if (e.key === "ArrowLeft") { e.preventDefault(); nudge(id, -step, 0); }
      else if (e.key === "ArrowRight") { e.preventDefault(); nudge(id, step, 0); }
      else if (e.key === "ArrowUp") { e.preventDefault(); nudge(id, 0, -step); }
      else if (e.key === "ArrowDown") { e.preventDefault(); nudge(id, 0, step); }
    };

    const save = async () => {
      setSaving(true);
      try { await annotate(asset, items); onClose(); } finally { setSaving(false); }
    };

    return (
      <div className="flex h-full flex-col gap-2">
        <ToggleGroup type="single" value={tool} onValueChange={(v) => v && setTool(v as Tool)}
                     aria-label="Ferramenta de anotação" className="rounded-md border border-border p-0.5">
          {(["select", "point", "arrow", "text"] as Tool[]).map((tl) => (
            <ToggleGroupItem key={tl} value={tl} className="h-7 px-2 text-xs">
              <Icon icon={
                tl === "select" ? "mdi:cursor-default-outline"
                  : tl === "point" ? "mdi:circle-small"
                  : tl === "arrow" ? "mdi:arrow-top-right"
                  : "mdi:format-text"
              } size={14} className="mr-1" />
              {t.tools[tl]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <div className="relative flex-1 overflow-hidden rounded-md bg-muted/40">
          <svg
            ref={svgRef}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            onClick={(e) => addAt(e.clientX, e.clientY)}
            role="application"
            aria-label="Camada de anotações"
          >
            {items.map((a) => (
              // color is a TOKEN NAME → text-color class; currentColor drives stroke/fill (D-14)
              <g key={a.id} className={annotationToneClass(a.color)} stroke="currentColor" fill="currentColor">
                {a.type === "arrow" && a.x2 != null && a.y2 != null && (
                  <line x1={a.x * 100} y1={a.y * 100} x2={a.x2 * 100} y2={a.y2 * 100}
                        strokeWidth={0.8} markerEnd="url(#annotator-arrowhead)" />
                )}
                <circle cx={a.x * 100} cy={a.y * 100} r={1.2} />
                {a.label && (
                  <text x={a.x * 100 + 2} y={a.y * 100} fontSize={3} stroke="none">{a.label}</text>
                )}
              </g>
            ))}
            <defs>
              <marker id="annotator-arrowhead" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto"
                      className={annotationToneClass(COLOR_TOKEN)}>
                <path d="M0,0 L4,2 L0,4 Z" fill="currentColor" />
              </marker>
            </defs>
          </svg>
        </div>

        {/* accessible parallel list */}
        <div className="max-h-40 overflow-y-auto">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t.listTitle} · {items.length}
          </p>
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t.empty}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {items.map((a) => (
                <li key={a.id} className="flex items-center gap-2 rounded border border-border bg-card px-2 py-1">
                  <span
                    tabIndex={0}
                    onKeyDown={(e) => onListKey(e, a.id)}
                    aria-label={`${t.tools[a.type]} ${a.label ?? ""} — ${t.nudgeHint}`}
                    className="cursor-grab rounded p-0.5 text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon icon="mdi:drag" size={14} />
                  </span>
                  <Input
                    value={a.label ?? ""}
                    onChange={(e) => update(a.id, { label: e.target.value })}
                    placeholder={t.labelPlaceholder}
                    className="h-7 flex-1 text-xs"
                  />
                  <button type="button" onClick={() => remove(a.id)} aria-label={t.remove}
                          className="rounded p-1 text-muted-foreground hover:text-severity-critical">
                    <Icon icon="mdi:trash-can-outline" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={cn("flex justify-end gap-2")}>
          <Button variant="outline" size="sm" onClick={onClose}>{t.cancel}</Button>
          <Button size="sm" onClick={save} disabled={saving}>{t.save}</Button>
        </div>
      </div>
    );
  }
  ```
  > NOTE: `normalizePoint(point: { x, y }, box: { width, height }): { x, y }` (0..1) is Plan A's helper — call it as shown (`{ x: clientX-rect.left, y: clientY-rect.top }`, `{ width: rect.width, height: rect.height }`). `nudge` is a clean `setItems` map with inline `clamp01` (no defensive no-op guard). `IMediaAnnotation.color` is a token name (`'info'`/`'warning'`/`'critical'`) rendered via `annotationToneClass` + `currentColor` — never a raw CSS var. Confirm `IMediaAnnotation.type` allows `'point' | 'arrow' | 'text'` (spec §4).
- [ ] **Step 3: Build.** `bun run build` — Expected SUCCEEDS.
- [ ] **Step 4: Commit.**
  ```
  git add src/features/media/components/MediaAnnotator.tsx src/features/media/i18n/pt-BR.ts
  git commit -m "feat(media): add MediaAnnotator SVG overlay + accessible list (RF-020) — PRD-026

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 15: `MediaGallery` shell (header + counters + filters + body-by-mode + states)

**Files:**
- Create `src/features/media/components/MediaGallery.tsx`

The shared shell. Owns: view-mode (`useMediaViewMode`), filters (`useMediaFilters`), filtered list (`applyMediaFilters`), lightbox index, RBAC predicates (via `canViewSensitive` + `useCurrentRole`/`useAuth`), and the actions slot (gated with `Can`). It receives `assets` + `scope` + loading/error from the parent (conversation or customer wrapper).

- [ ] **Step 1: Add i18n.** In `src/features/media/i18n/pt-BR.ts`, add inside `MEDIA_STRINGS`:
  ```ts
    gallery: {
      title: "Mídias",
      empty: "Nenhuma mídia ainda.",
      emptyFiltered: "Nenhuma mídia corresponde aos filtros.",
      loadError: "Não foi possível carregar as mídias.",
      retry: "Tentar novamente",
      loading: "Carregando mídias…",
    },
  ```
- [ ] **Step 2: Implement.** Create `src/features/media/components/MediaGallery.tsx`:
  ```tsx
  // src/features/media/components/MediaGallery.tsx
  import { useMemo, useState } from "react";
  import { useNavigate } from "@tanstack/react-router";
  import type { IMediaAsset, IMediaClassification } from "@/shared/types";
  import { Icon } from "@/components/Icon";
  import { Button } from "@/components/ui/button";
  import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  } from "@/components/ui/alert-dialog";
  import { useAuth } from "@/features/auth/useAuth";
  import { Can } from "@/features/rbac/components/Can";
  import { canViewSensitive } from "../engine/sensitiveAccess";
  import { applyMediaFilters } from "../engine/mediaFiltering";
  import { mediaCounterLabel } from "../utils/mediaDisplay";
  import { useMediaViewMode } from "../hooks/useMediaViewMode";
  import { useMediaFilters, type MediaFilterScope } from "../hooks/useMediaFilters";
  import { useMediaActions } from "../hooks/useMediaActions";
  import { MediaFilters } from "./MediaFilters";
  import { MediaGrid } from "./MediaGrid";
  import { MediaCardTile } from "./MediaCardTile";
  import { MediaTypeGroups } from "./MediaTypeGroups";
  import { MediaLightbox } from "./MediaLightbox";
  import { MediaAnnotator } from "./MediaAnnotator";
  import { SensitiveLock } from "./SensitiveLock";
  import { MEDIA_STRINGS } from "../i18n/pt-BR";

  interface IMediaGalleryProps {
    scope: MediaFilterScope;
    assets: IMediaAsset[];
    isLoading: boolean;
    isError: boolean;
    onRetryLoad: () => void;
    /** Grid columns for this scope (3 in drawer; 2..6 responsive for customer). */
    columns: number;
    /** Optional per-item "open conversation" affordance (customer scope). */
  }

  export function MediaGallery({ scope, assets, isLoading, isError, onRetryLoad, columns }: IMediaGalleryProps) {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [viewMode, setViewMode] = useMediaViewMode();
    const filtersApi = useMediaFilters(scope);
    const actions = useMediaActions();
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    const [annotating, setAnnotating] = useState<IMediaAsset | null>(null);
    const [classifying, setClassifying] = useState<IMediaAsset | null>(null);
    const [linking, setLinking] = useState<IMediaAsset | null>(null);
    const [pendingDelete, setPendingDelete] = useState<IMediaAsset | null>(null);
    const g = MEDIA_STRINGS.gallery;

    const filtered = useMemo(() => {
      // Map the period preset to a `from` ISO BEFORE filtering — applyMediaFilters
      // uses from?/to? (NOT a period enum); passing `period` is an excess-property error.
      const days = filtersApi.filters.period === "7d" ? 7
        : filtersApi.filters.period === "30d" ? 30
        : filtersApi.filters.period === "90d" ? 90
        : null;
      const from = days === null ? undefined : new Date(Date.now() - days * 86_400_000).toISOString();
      return applyMediaFilters(assets, {
        search: filtersApi.filters.search,
        kind: filtersApi.filters.kind === "all" ? undefined : filtersApi.filters.kind,
        authorType: filtersApi.filters.authorType === "all" ? undefined : filtersApi.filters.authorType,
        from,
        classification:
          scope === "customer" && filtersApi.filters.classification !== "all"
            ? (filtersApi.filters.classification as IMediaClassification)
            : undefined,
      });
    }, [assets, filtersApi.filters, scope]);

    // canViewSensitive takes ONE arg (the viewer) — role-based gate (contract).
    const isLocked = (a: IMediaAsset) => a.sensitivity === "sensitive" && !canViewSensitive(currentUser);
    const renderLockedOverlay = (a: IMediaAsset) => (
      <SensitiveLock variant="tile" onAttempt={() => actions.auditSensitiveAttempt(a, "view")} />
    );

    const openLightbox = (asset: IMediaAsset) => {
      const idx = filtered.findIndex((x) => x.id === asset.id);
      if (idx >= 0) setLightboxIndex(idx);
      if (asset.sensitivity === "sensitive") {
        if (canViewSensitive(currentUser)) actions.auditSensitiveAccess(asset, "open");
        else actions.auditSensitiveAttempt(asset, "open");
      }
    };

    const openConversation = (asset: IMediaAsset) => {
      if (!asset.conversationId) return;
      void navigate({ to: "/app/atendimento/$id", params: { id: asset.conversationId } });
      setLightboxIndex(null);
    };

    const renderActions = (asset: IMediaAsset) => {
      const suggestion = actions.suggestClassification(asset);
      const suggestionLabel = MEDIA_STRINGS.filters.classification[suggestion];
      return (
        <div className="flex flex-col gap-2">
          {/* Assisted classify: preselect the engine suggestion (spec §3.3) — not a hardcoded 'outro'. */}
          <Can resource="media" action="edit">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">
                {MEDIA_STRINGS.actions.suggestedClassification(suggestionLabel)}
              </span>
              <Button variant="secondary" size="sm" className="h-7 gap-1"
                      onClick={() => void actions.setClassification(asset, suggestion)}>
                <Icon icon="mdi:auto-fix" size={13} />{MEDIA_STRINGS.actions.applySuggestion}
              </Button>
            </div>
          </Can>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setAnnotating(asset)}>
              <Icon icon="mdi:pencil-outline" size={14} className="mr-1" />{MEDIA_STRINGS.actions.annotate}
            </Button>
            <Can resource="media" action="edit">
              <Button variant="outline" size="sm" onClick={() => setClassifying(asset)}>
                <Icon icon="mdi:tag-outline" size={14} className="mr-1" />{MEDIA_STRINGS.actions.classify}
              </Button>
            </Can>
            {/* Link picker (vehicle/order/part) with explicit confirmation + audit (spec §3.3/Fase 4). */}
            <Can resource="media" action="edit">
              <Button variant="outline" size="sm" onClick={() => setLinking(asset)}>
                <Icon icon="mdi:link-variant" size={14} className="mr-1" />{MEDIA_STRINGS.actions.link}
              </Button>
            </Can>
            <Button variant="outline" size="sm" onClick={() => { actions.auditSensitiveAccess(asset, "download"); }}>
              <Icon icon="mdi:download" size={14} className="mr-1" />{MEDIA_STRINGS.actions.download}
            </Button>
            <Can resource="media" action="delete">
              <Button variant="outline" size="sm" className="text-severity-critical"
                      onClick={() => setPendingDelete(asset)}>
                <Icon icon="mdi:trash-can-outline" size={14} className="mr-1" />{MEDIA_STRINGS.actions.delete}
              </Button>
            </Can>
          </div>
        </div>
      );
    };

    // ---- states ----
    if (isError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
          <Icon icon="mdi:alert-circle-outline" size={28} className="text-severity-critical" />
          <p className="text-sm text-foreground">{g.loadError}</p>
          <Button variant="outline" size="sm" onClick={onRetryLoad}>{g.retry}</Button>
        </div>
      );
    }

    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-between border-b border-border bg-card px-3 py-2">
          <h2 className="text-sm font-semibold text-foreground">{g.title}</h2>
        </div>
        <p className="px-3 pt-2 text-xs text-muted-foreground" aria-live="polite">
          {mediaCounterLabel(filtered)}
        </p>
        <MediaFilters filtersApi={filtersApi} viewMode={viewMode} onViewModeChange={setViewMode} />

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground" aria-busy="true">
              <Icon icon="mdi:loading" className="mr-2 animate-spin" size={16} />{g.loading}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
              <Icon icon="mdi:image-off-outline" size={28} />
              <p className="text-sm">{assets.length === 0 ? g.empty : g.emptyFiltered}</p>
            </div>
          ) : viewMode === "grade" ? (
            <MediaGrid assets={filtered} columns={columns} viewer={currentUser} onOpen={openLightbox}
                       onRetry={(a) => void actions.setClassification(a, a.classification ?? actions.suggestClassification(a))}
                       isLocked={isLocked} renderLockedOverlay={renderLockedOverlay} />
          ) : viewMode === "cartoes" ? (
            <div className="flex flex-col gap-2 p-3" role="grid" aria-label={g.title} aria-colcount={2}>
              {Array.from({ length: Math.ceil(filtered.length / 2) }, (_, r) => (
                <div key={r} role="row" className="grid gap-2" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                  {filtered.slice(r * 2, r * 2 + 2).map((a) => (
                    <MediaCardTile key={a.id} asset={a} onOpen={() => openLightbox(a)}
                                   lockedOverlay={isLocked(a) ? renderLockedOverlay(a) : undefined} />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <MediaTypeGroups assets={filtered} columns={columns} viewer={currentUser} onOpen={openLightbox}
                             onRetry={(a) => void actions.setClassification(a, a.classification ?? actions.suggestClassification(a))}
                             isLocked={isLocked} renderLockedOverlay={renderLockedOverlay} />
          )}
        </div>

        <MediaLightbox
          assets={filtered}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          canView={(a) => a.sensitivity !== "sensitive" || canViewSensitive(currentUser)}
          renderActions={renderActions}
          onSensitiveAttempt={(a) => actions.auditSensitiveAttempt(a, "open")}
          onOpenConversation={scope === "customer" ? openConversation : undefined}
          searchTerm={filtersApi.filters.search}
        />

        {annotating && currentUser && (
          <AlertDialog open onOpenChange={(o) => !o && setAnnotating(null)}>
            <AlertDialogContent className="max-w-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>{MEDIA_STRINGS.actions.annotate}</AlertDialogTitle>
              </AlertDialogHeader>
              <div className="h-[420px]">
                <MediaAnnotator asset={annotating} currentUserId={currentUser.id} onClose={() => setAnnotating(null)} />
              </div>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {/* Classify picker — suggestion preselected; user confirms (spec §3.3). */}
        {classifying && (
          <AlertDialog open onOpenChange={(o) => !o && setClassifying(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{MEDIA_STRINGS.actions.classify}</AlertDialogTitle>
                <AlertDialogDescription>
                  {MEDIA_STRINGS.actions.suggestedClassification(
                    MEDIA_STRINGS.filters.classification[actions.suggestClassification(classifying)],
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(MEDIA_STRINGS.filters.classification) as IMediaClassification[]).map((c) => (
                  <Button
                    key={c}
                    variant={c === actions.suggestClassification(classifying) ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => { void actions.setClassification(classifying, c); setClassifying(null); }}
                  >
                    {MEDIA_STRINGS.filters.classification[c]}
                  </Button>
                ))}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>{MEDIA_STRINGS.actions.cancel}</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {/* Link picker — vehicle (PRD-016) / order / part (PRD-021), explicit confirm + audit (spec §3.3). */}
        {linking && (
          <AlertDialog open onOpenChange={(o) => !o && setLinking(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{MEDIA_STRINGS.actions.linkConfirmTitle}</AlertDialogTitle>
                <AlertDialogDescription>{MEDIA_STRINGS.actions.linkConfirmBody}</AlertDialogDescription>
              </AlertDialogHeader>
              {/* Fase 1 mock: pick the first suggested entity id; real entity search arrives in Fase 2. */}
              <div className="flex flex-col gap-2">
                <Button variant="outline" size="sm" className="justify-start gap-2"
                        onClick={() => { void actions.linkVehicle(linking, `veh-${linking.id}`); setLinking(null); }}>
                  <Icon icon="mdi:truck-outline" size={14} />{MEDIA_STRINGS.actions.linkVehicle}
                </Button>
                <Button variant="outline" size="sm" className="justify-start gap-2"
                        onClick={() => { void actions.linkOrder(linking, `ord-${linking.id}`); setLinking(null); }}>
                  <Icon icon="mdi:clipboard-list-outline" size={14} />{MEDIA_STRINGS.actions.linkOrder}
                </Button>
                <Button variant="outline" size="sm" className="justify-start gap-2"
                        onClick={() => { void actions.linkPart(linking, `prt-${linking.id}`); setLinking(null); }}>
                  <Icon icon="mdi:cog-outline" size={14} />{MEDIA_STRINGS.actions.linkPart}
                </Button>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>{MEDIA_STRINGS.actions.cancel}</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{MEDIA_STRINGS.actions.deleteTitle}</AlertDialogTitle>
              <AlertDialogDescription>{MEDIA_STRINGS.actions.deleteBody}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{MEDIA_STRINGS.actions.cancel}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => { if (pendingDelete) void actions.remove(pendingDelete); setPendingDelete(null); setLightboxIndex(null); }}
              >
                {MEDIA_STRINGS.actions.deleteConfirm}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }
  ```
  > NOTE: `applyMediaFilters(assets, filters)` uses `from?`/`to?` ISO strings (NOT a `period` enum). The `period` preset is mapped to a `from` ISO here BEFORE the call; never pass a `period` key (excess-property error). `canViewSensitive(currentUser)` takes ONE arg (the viewer) — role-based gate; pass the `IMockUserProfile | null` from `useAuth`. Classify uses the engine suggestion (`actions.suggestClassification`) preselected in the picker — never a hardcoded `'outro'`. The link picker calls the typed `linkVehicle`/`linkOrder`/`linkPart` helpers (each audited); in Fase 1 the entity id is a deterministic mock — real entity search lands in Fase 2. Verify the conversation route path `"/app/atendimento/$id"` against `src/routeTree.gen.ts` (adjust to the real route id if it differs).
- [ ] **Step 3: Build.** `bun run build` — Expected SUCCEEDS.
- [ ] **Step 4: Commit.**
  ```
  git add src/features/media/components/MediaGallery.tsx src/features/media/i18n/pt-BR.ts
  git commit -m "feat(media): add MediaGallery shell (3 modes + filters + lightbox + states) — PRD-026

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 16: `ConversationMediaGallery` (Sheet) + `useMediaGallery` open-state hook

**Files:**
- Create `src/features/media/hooks/useMediaGallery.ts`
- Create `src/features/media/components/ConversationMediaGallery.tsx`

`useMediaGallery` mirrors `src/features/conversations/hooks/useConversationFiche.ts` (read it) with key `gallo-conversation-media-open`. `ConversationMediaGallery` = `Sheet side="right"` wrapping `MediaGallery scope="conversation" columns={3}` fed by `useConversationMedia`.

- [ ] **Step 1: Implement the open-state hook.** Create `src/features/media/hooks/useMediaGallery.ts`:
  ```ts
  // src/features/media/hooks/useMediaGallery.ts
  import { useCallback, useState } from "react";

  /** Open/close state for the conversation media Sheet (mirrors useConversationFiche). */
  export function useMediaGallery() {
    const [open, setOpen] = useState(false);
    const toggle = useCallback(() => setOpen((o) => !o), []);
    return { open, setOpen, toggle };
  }
  ```
- [ ] **Step 2: Implement the Sheet wrapper.** Create `src/features/media/components/ConversationMediaGallery.tsx`:
  ```tsx
  // src/features/media/components/ConversationMediaGallery.tsx
  import type { ID } from "@/shared/types";
  import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
  import { useConversationMedia } from "../hooks/useConversationMedia";
  import { MediaGallery } from "./MediaGallery";
  import { MEDIA_STRINGS } from "../i18n/pt-BR";

  interface IConversationMediaGalleryProps {
    conversationId: ID;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }

  /** Side sheet (scope=conversation) opened by the ConversationHeader "Mídias" button (PRD-011). */
  export function ConversationMediaGallery({ conversationId, open, onOpenChange }: IConversationMediaGalleryProps) {
    const media = useConversationMedia(conversationId, open); // only fetch when open
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full overflow-hidden p-0 sm:max-w-md">
          <SheetHeader className="sr-only">
            <SheetTitle>{MEDIA_STRINGS.gallery.title}</SheetTitle>
          </SheetHeader>
          <MediaGallery
            scope="conversation"
            assets={media.assets}
            isLoading={media.isLoading}
            isError={media.isError}
            onRetryLoad={media.refetch}
            columns={3}
          />
        </SheetContent>
      </Sheet>
    );
  }
  ```
- [ ] **Step 3: Build.** `bun run build` — Expected SUCCEEDS.
- [ ] **Step 4: Commit.**
  ```
  git add src/features/media/hooks/useMediaGallery.ts src/features/media/components/ConversationMediaGallery.tsx
  git commit -m "feat(media): add ConversationMediaGallery sheet + open-state hook — PRD-026

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 17: Wire the conversation header + page (entry point #1)

**Files:**
- Modify `src/features/conversations/i18n/pt-BR.ts` (add `toggleMedia`)
- Modify `src/features/conversations/components/ConversationHeader.tsx` (props + button before `menuSlot`, line ~124-145)
- Modify `src/features/conversations/pages/ConversationPage.tsx` (mount Sheet, open state)
- Modify `src/features/media/index.ts` (export `ConversationMediaGallery`, `useMediaGallery`, view-mode)

- [ ] **Step 1: Add the i18n string.** In `src/features/conversations/i18n/pt-BR.ts`, locate `CONVERSATION_STRINGS` and add a key near `toggleFiche`:
  ```ts
    toggleMedia: "Mídias",
  ```
  (If `CONVERSATION_STRINGS` is in a different file, search for `toggleFiche` and add it adjacent.)
- [ ] **Step 2: Extend `ConversationHeader` props.** In `src/features/conversations/components/ConversationHeader.tsx`, add to `IConversationHeaderProps` (after `onToggleFiche`):
  ```ts
    /** Whether the media gallery sheet is open. */
    mediaOpen?: boolean;
    /** Toggles the media gallery sheet. */
    onToggleMedia?: () => void;
  ```
  Destructure `mediaOpen` and `onToggleMedia` in the function signature alongside `ficheOpen`/`onToggleFiche`.
- [ ] **Step 3: Add the "Mídias" button before `{menuSlot}`.** In the `<div className="flex items-center gap-1">` action group, insert immediately before `{menuSlot}`:
  ```tsx
            {onToggleMedia && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={mediaOpen ? "secondary" : "ghost"}
                    size="sm"
                    className="gap-1.5"
                    onClick={onToggleMedia}
                    aria-pressed={mediaOpen}
                  >
                    <Icon icon="mdi:image-multiple-outline" size={14} />
                    <span className="hidden md:inline">{CONVERSATION_STRINGS.toggleMedia}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{CONVERSATION_STRINGS.toggleMedia}</TooltipContent>
              </Tooltip>
            )}
  ```
- [ ] **Step 4: Mount in `ConversationPage`.** In `src/features/conversations/pages/ConversationPage.tsx`:
  - Add import: `import { ConversationMediaGallery, useMediaGallery } from "@/features/media";`
  - After `const fiche = useConversationFiche();` add: `const media = useMediaGallery();`
  - On `<ConversationHeader ... />` add props: `mediaOpen={media.open}` and `onToggleMedia={media.toggle}` (next to `onToggleFiche`).
  - Inside the outer `<div className="flex h-full min-h-0 bg-background">`, after the `{conversation.customerId && (<CustomerProfileFiche … />)}` block, mount:
    ```tsx
            <ConversationMediaGallery
              conversationId={conversationId}
              open={media.open}
              onOpenChange={media.setOpen}
            />
    ```
- [ ] **Step 5: Update the barrel.** In `src/features/media/index.ts`, add (alongside existing Plan A exports):
  ```ts
  export { ConversationMediaGallery } from "./components/ConversationMediaGallery";
  export { CustomerMediaGallery } from "./components/CustomerMediaGallery"; // added in Task 18
  export { useMediaGallery } from "./hooks/useMediaGallery";
  export {
    useMediaViewMode, normalizeMediaViewMode, MEDIA_VIEW_MODES, type MediaViewMode,
  } from "./hooks/useMediaViewMode";
  ```
  > If `CustomerMediaGallery` does not exist yet at this step, add its export in Task 18 instead and keep this barrel edit limited to the conversation pieces.
- [ ] **Step 6: Build.** `bun run build` — Expected SUCCEEDS.
- [ ] **Step 7: Manual verification checklist** (user performs; the agent does NOT open a browser):
  1. `bun run dev`, open any conversation at `/app/atendimento/$id`.
  2. Confirm a **Mídias** button (image-multiple icon) appears in the header, left of the kebab menu.
  3. Click it → a right-side Sheet opens with title-less header, counters line ("N imagens · …"), filter bar with search + type toggles + the 3-mode switcher on the right.
  4. Toggle Grade/Cartões/Por tipo → body layout changes; reload the page → last mode persists (localStorage `gallo-media-viewmode`).
  5. Click a tile → lightbox opens full-screen; `←/→` navigate, `Esc` closes, focus returns to the page.
  6. Verify a sensitive tile (nota fiscal) shows a blurred placeholder + lock chip; clicking opens the "Solicitar acesso" dialog (when logged in as Vendedor/SDR).
  7. Toggle dark mode → chips/blur/lock remain legible.
- [ ] **Step 8: Commit.**
  ```
  git add src/features/conversations/components/ConversationHeader.tsx src/features/conversations/pages/ConversationPage.tsx src/features/conversations/i18n/pt-BR.ts src/features/media/index.ts
  git commit -m "feat(conversations): add Midias button + mount conversation media gallery — PRD-026

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Phase 4 — Cliente (entry point #2)

### Task 18: `CustomerMediaGallery` + Ficha "Mídias" tab

**Files:**
- Create `src/features/media/components/CustomerMediaGallery.tsx`
- Modify `src/features/customers/components/ProfileTabs.tsx` (`TabKey`, `TAB_ORDER`, content — lines 27-44, 100-131)
- Modify `src/features/customers/i18n/pt-BR.ts` (`tabs.midias`, line ~47-55)

`CustomerMediaGallery` = responsive panel fed by `useCustomerMedia`, `scope="customer"`, columns responsive (`2` on small, more via grid CSS — pass `columns={4}` as the base; the customer scope grid lets CSS clamp). Spec §5.3: each item indicates origin conversation; the **"Abrir conversa"** shortcut lives **inside the lightbox aside** and is already wired in Task 12/15 — the `MediaGallery` passes `onOpenConversation` (TanStack Router `navigate` to `/app/atendimento/$id`) to `MediaLightbox` when `scope === "customer"`, and the lightbox renders the action whenever `asset.conversationId` is present. No further work is needed here for that affordance (it is NOT deferred).

- [ ] **Step 1: Implement the customer panel.** Create `src/features/media/components/CustomerMediaGallery.tsx`:
  ```tsx
  // src/features/media/components/CustomerMediaGallery.tsx
  import type { ID } from "@/shared/types";
  import { useCustomerMedia } from "../hooks/useCustomerMedia";
  import { MediaGallery } from "./MediaGallery";

  interface ICustomerMediaGalleryProps {
    customerId: ID;
  }

  /** Aggregated media across all the customer's conversations (Ficha tab, PRD-012). */
  export function CustomerMediaGallery({ customerId }: ICustomerMediaGalleryProps) {
    const media = useCustomerMedia(customerId);
    return (
      <div className="h-[70vh] min-h-[420px]">
        <MediaGallery
          scope="customer"
          assets={media.assets}
          isLoading={media.isLoading}
          isError={media.isError}
          onRetryLoad={media.refetch}
          columns={4}
        />
      </div>
    );
  }
  ```
- [ ] **Step 2: Add the i18n tab label.** In `src/features/customers/i18n/pt-BR.ts`, inside `tabs`, add `midias` after `conversations`:
  ```ts
      conversations: "Conversas",
      midias: "Mídias",
  ```
- [ ] **Step 3: Extend `ProfileTabs` type + order.** In `src/features/customers/components/ProfileTabs.tsx`:
  - Add `"midias"` to `TabKey` union (after `"conversations"`):
    ```ts
      | "conversations"
      | "midias"
    ```
  - Add `"midias"` to `TAB_ORDER` right after `"conversations"`:
    ```ts
      "conversations",
      "midias",
    ```
  - Add the import at the top: `import { CustomerMediaGallery } from "@/features/media";`
  - Add a `TabsContent` block after the `conversations` one:
    ```tsx
            <TabsContent value="midias" className="m-0 p-0 focus-visible:outline-none">
              {activeString === "midias" && <CustomerMediaGallery customerId={customer.id} />}
            </TabsContent>
    ```
- [ ] **Step 4: Ensure barrel export.** Confirm `src/features/media/index.ts` exports `CustomerMediaGallery` (added in Task 17 Step 5; if it errored there because the file didn't exist, add it now).
- [ ] **Step 5: Build.** `bun run build` — Expected SUCCEEDS.
- [ ] **Step 6: Manual verification checklist:**
  1. `bun run dev`, open a customer Ficha (`/app/clientes/$id`) or the in-conversation fiche.
  2. Confirm a **Mídias** tab appears right after **Conversas** in the tab strip.
  3. Click it → the aggregated gallery renders with the classification filter present (customer scope only).
  4. Set a classification filter → the grid narrows; clear it → restores.
  5. Switch view modes and confirm the same persistence as the conversation gallery.
  6. Resize the window 360 → 1920 → grid columns reflow without overflow.
- [ ] **Step 7: Commit.**
  ```
  git add src/features/media/components/CustomerMediaGallery.tsx src/features/media/index.ts src/features/customers/components/ProfileTabs.tsx src/features/customers/i18n/pt-BR.ts
  git commit -m "feat(customers): add Midias tab with aggregated customer media gallery — PRD-026

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Phase 5 — Governance + Polish

### Task 19: RBAC — VERIFY the `media` resource + matrix (Plan A owns registration)

**Files:**
- READ ONLY: `src/features/rbac/permissions/resources.ts`, `src/features/rbac/permissions/matrix.ts`

> **Plan A is the single source of truth for RBAC registration.** It adds `"media"` to the `RESOURCES` tuple and the per-role matrix entries in the SAME task its mock provider first uses `scopedListParams("media")` (so the provider never ships scoped to a wrong resource — no Task6→Task10 window). Plan B does **NOT** edit `RESOURCES` or the matrix. This task is **verification only**: confirm what Plan A shipped matches the contract that the `<Can resource="media" action="edit|delete">` gates in `MediaGallery.renderActions` rely on.

Contract the matrix must satisfy (sensitivity is gated **separately** by `canViewSensitive`, role-based, at the data layer per D-4/D-6 — it is NOT a matrix row):

| Role | Actions | Scope |
|------|---------|-------|
| Owner | CRUD (all) | all |
| Gestor | view, edit, delete | store |
| Vendedor | view | own |
| SDR | view | own |
| VendedorExterno | view | own |

(Cliente/Financeiro: no media access.)

- [ ] **Step 1: Verify the resource is registered.** `Grep` `"media"` in `src/features/rbac/permissions/resources.ts` — confirm `"media"` is present in `RESOURCES`. If it is missing, **STOP and report** (Plan A task is incomplete — do not add it here; that would create a divergent second registration).
- [ ] **Step 2: Verify the matrix entries.** `Grep` `p("media"` in `src/features/rbac/permissions/matrix.ts` — confirm one entry per role exactly matching the table above (`OWNER_ENTRIES` CRUD/all; `GESTOR_ENTRIES` [view, edit, delete]/store; `VENDEDOR_ENTRIES`/`SDR_ENTRIES`/`VENDEDOR_EXTERNO_ENTRIES` [view]/own). If any entry is missing or wrong, **STOP and report** (fix belongs in Plan A).
- [ ] **Step 3: Build.** `bun run build` — Expected SUCCEEDS. `ResourceName` already includes `"media"` (Plan A), so `<Can resource="media" …>` type-checks. No file changes expected in this task.
- [ ] **Step 4: Manual verification checklist:**
  1. Sign in as **Vendedor** → open a sensitive media tile → blurred + locked; the lightbox shows no preview/download; the attempt logs an audit entry (verify in `/app/configuracoes` → auditoria or the audit list, if surfaced).
  2. Sign in as **Gestor/Owner** → the same tile is viewable; **Excluir/Classificar/Vincular** actions are visible in the lightbox aside.
  3. As Vendedor, confirm **Excluir/Classificar/Vincular** are hidden (gated by `<Can action="delete|edit">`).
- [ ] **Step 5: No commit** unless Step 1/2 surfaced a discrepancy that the user asks Plan B to patch. If everything matches, this task produces no diff — record the verification result in the PR description instead.

---

### Task 20: Retention placeholder in Configurações (D-5)

**Files:**
- Locate the Settings/PRD-019 page that lists configuration cards (search: `Grep` for `Configurações` page or `settings` route). Modify it to add a read-only retention card.

Spec D-5: placeholder, no real purge — **365 dias** normal / **1825 dias (5 anos)** sensível, shown in Configurações.

- [ ] **Step 1: Locate the settings page.** Run: `Grep` for `"PRD-019"` and for a settings page component under `src/features/settings/` or `src/routes/app/configuracoes`. Open the page that renders configuration sections.
- [ ] **Step 2: Add a retention card.** Insert a read-only card (match the existing card markup in that page). Example content (adapt classes to the page's card component):
  ```tsx
  <section className="rounded-lg border border-border bg-card p-4">
    <div className="mb-2 flex items-center gap-2">
      <Icon icon="mdi:database-clock-outline" size={18} className="text-muted-foreground" />
      <h3 className="text-sm font-semibold text-foreground">Retenção de mídia (LGPD)</h3>
    </div>
    <p className="mb-3 text-xs text-muted-foreground">
      Períodos de retenção das mídias arquivadas. Placeholder de configuração — o expurgo
      automático entra na Fase 2.
    </p>
    <dl className="grid grid-cols-2 gap-3 text-xs">
      <div>
        <dt className="text-muted-foreground">Mídia comum</dt>
        <dd className="text-foreground">365 dias</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Mídia sensível</dt>
        <dd className="text-foreground">1825 dias (5 anos)</dd>
      </div>
    </dl>
  </section>
  ```
  Add a `MEDIA_STRINGS.retention` block in `src/features/media/i18n/pt-BR.ts` and reference it instead of inline strings if the page imports media i18n; otherwise keep the literals (they are correct pt-BR with accents).
- [ ] **Step 3: Build.** `bun run build` — Expected SUCCEEDS.
- [ ] **Step 4: Manual verification:** Open `/app/configuracoes` (PRD-019) → confirm the **Retenção de mídia (LGPD)** card shows `365 dias` and `1825 dias (5 anos)`.
- [ ] **Step 5: Commit.**
  ```
  git add src/features/settings src/features/media/i18n/pt-BR.ts
  git commit -m "feat(settings): add media retention placeholder card (D-5) — PRD-026

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 21: Polish — states, light/dark, responsive, severity-token audit

**Files:**
- Touch-ups across `src/features/media/components/*` as needed (no new files expected).

- [ ] **Step 1: Verify severity utilities (D-14).** The media components use the Tailwind `severity-*` utilities ONLY — `text-severity-{info|success|warning|critical}`, `bg-severity-*/NN`, `border-severity-*/NN`. `Grep` `var(--severity-` across `src/features/media/**` and confirm **zero** matches (the bare `--severity-*` vars are undefined; the design system exposes `--color-severity-*` via `@theme inline` in `src/styles.css`, mirrored by `src/features/notifications/lib/severity.ts`). If any `var(--severity-*)` slipped in, replace it with the matching `text-/bg-/border-severity-*` utility. Also confirm `IMediaAnnotation.color` stores a TOKEN NAME (e.g. `'info'`/`'warning'`/`'critical'`) mapped to a class by `annotationToneClass` — never a raw CSS var.
- [ ] **Step 2: Empty/error/loading parity.** Confirm each gallery state renders: loading spinner, `g.empty` vs `g.emptyFiltered`, and `g.loadError` + retry. (Already wired in Task 15 — just verify visually.)
- [ ] **Step 3: Reduced-motion.** Confirm no `transition`/`animate` is applied to the blur of `SensitiveLock` (spec §7). Confirm chips/tiles do not pulse. The global `prefers-reduced-motion` rule in `styles.css` covers the rest.
- [ ] **Step 4: Responsive sweep.** Manual at 360 / 768 / 1280 / 1920: conversation Sheet stays full-width on mobile, `sm:max-w-md` on desktop; customer grid reflows; lightbox aside collapses to bottom Sheet < `lg`.
- [ ] **Step 5: Run the engine tests + build (final gate).**
  ```
  bun run test
  bun run build
  ```
  Expected: all media engine tests (Plan A) + `useMediaViewMode` test PASS; build SUCCEEDS. Note the ~315 pre-existing `tsc` errors are unrelated — the vite build is the gate.
- [ ] **Step 6: Manual verification checklist (full pass):**
  1. Conversation gallery: open/close, 3 modes, filters, lightbox keymap, sensitive lock (as Vendedor vs Gestor).
  2. Customer gallery: classification filter, aggregation across conversations, view-mode persistence shared with conversation gallery.
  3. Annotator: add point/arrow/text, edit a label, nudge with arrow keys, save → reopening shows the saved annotations.
  4. Audio: play/pause via button and Space (in lightbox), speed 1x/1.5x/2x persists when navigating `←/→` to another audio.
  5. Delete (as Gestor): confirm AlertDialog, item disappears, audit logged.
  6. Light/dark on all of the above.
- [ ] **Step 7: Commit.**
  ```
  git add src/features/media
  git commit -m "polish(media): severity-token audit, states, responsive + reduced-motion checks — PRD-026

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Self-check — spec coverage by Plan B

Plan B (Fases 3-5; D-8..D-14) covers, by spec section:

- **§3.2 components** — `MediaGallery`, `MediaGrid`, `MediaTile`, `MediaCardTile`, `MediaTypeGroups`, `MediaFilters`, `MediaViewSwitcher`, `MediaLightbox`, `MediaAudioPlayer`, `MediaAnnotator`, `SensitiveLock`, `ConversationMediaGallery`, `CustomerMediaGallery` → Tasks 4-18. (engine/ + Plan-A hooks consumed, not redefined.)
- **§3.2 hooks** — `useMediaViewMode` (T1), `useMediaFilters` (T2), `useConversationMedia`/`useCustomerMedia` (T3), `useMediaActions` (T13). `useEnsureInboundMedia` is Plan A (consumed, not built here).
- **§3.3 integration** — ConversationHeader "Mídias" button + `onToggleMedia` + ConversationPage Sheet (T17); ProfileTabs `midias` after `conversations` + customers i18n (T18); RBAC `media` resource + matrix **registered by Plan A**, VERIFIED by Plan B (T19); Settings retention placeholder (T20); assisted classify (engine suggestion) + link picker (vehicle/order/part, audited) in the lightbox aside (T13/T15). Composer untouched (per §3.3/§10).
- **§5.1 multi-visualização (D-8..D-11)** — 3 modes, switcher in the filter bar (right), `localStorage["gallo-media-viewmode"]` default `grade` → T1, T4, T15.
- **§5.2 / §5.3** — conversation Sheet from header (T16/17); customer aggregated tab with classification filter (T18); "Abrir conversa" in the lightbox aside (customer scope, TanStack Router navigate) → T12/T15.
- **§5.4 lightbox (D-12)** — full-screen Dialog, image/audio/document, desktop aside → mobile bottom Sheet, keymap `←/→/Esc/Space/+/-` ignoring form fields, RBAC-gated actions, Excluir → AlertDialog, read-only `AnnotationLayer` overlay → T12, T15.
- **§5.5 sensitive governance (D-4/D-6)** — `SensitiveLock` blurred placeholder + lock + request dialog; locked lightbox without preview/download; audited attempts → T10, T13, T15. RBAC matrix verified (registration is Plan A's) → T19. (Data-layer redaction is Plan A's `getSignedUrl`; UI blurs only the placeholder.)
- **§5.6 persistence indicators (D-13/RF-007/008)** — one priority chip per tile (`failure` > `sensitive` > `expiring` > `none` via `statusChipPriority(asset, viewer, now?)`), focusable retry, urgency tiers (`soft`/`strong`/`critical`) mapped to distinct tones via `sourceExpiry(asset).tier` → T6 (consumes Plan A `statusChipPriority`/`sourceExpiry`).
- **§5.7 annotation (RF-020)** — interactive SVG overlay point/arrow/text (`MediaAnnotator`) + shared read-only `AnnotationLayer` read-back; normalized coords via `normalizePoint`/`denormalizePoint`; accessible list with nudge; color is a severity TOKEN NAME; save as version 2 → T12, T14, T13.
- **§7 accessibility** — `role=grid` roving tabindex (T8), counters `aria-live` (T15), lightbox `role=dialog`/keymap/focus return (T12), color never the only signal (icon+text+ARIA in tiles/chips/lock — T6/T10), reduced-motion-safe blur (T10/T21).
- **§9 Fases 3-5 + D-14 (severity color)** — phased across T1-T21; severity-token audit in T21.

**Explicitly NOT in Plan B (per assumptions / §10):** types `media.ts`, `IMediaStorageProvider` (mock/stub/factory/hook), generators/bootstrap/VOLUMES, `engine/*`, `useEnsureInboundMedia`, `utils/mediaDisplay`, adding `@tanstack/react-virtual`, **RBAC `media` resource + matrix registration** — all delivered by **Plan A** (Plan B verifies RBAC only). Real Storage/OCR/AI/outbound (PRD-027)/N-version history — Fase 2 / other PRDs.

**Plan A signatures Plan B consumes (canonical contract — already fixed throughout this plan):** `IPaginatedResult<T>` array key is `data` (`query.data?.data ?? []`); `statusChipPriority(asset, viewer, now?): 'failure' | 'sensitive' | 'expiring' | 'none'`; `sourceExpiry(asset)` returns `{ daysLeft, label, tier: 'soft' | 'strong' | 'critical' }`; `applyMediaFilters(assets, filters)` uses `from?`/`to?` (NOT `period`); `highlightSegments(text, term): { text, isMatch }[]` (on `highlightRanges`); `canViewSensitive(viewer)` (ONE arg, role-based); `normalizePoint({ x, y }, { width, height }) → { x, y }` / `denormalizePoint`; `mediaKindIcon(kind)` / `mediaCounterLabel(...)`; severity colors via Tailwind `text-/bg-/border-severity-*` utilities (the design system exposes `--color-severity-*`; bare `--severity-*` is undefined).
