# What's New Version Modal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an auto-opening "what's new" modal once per new minor/major release, in the internal app shell, reusing the existing changelog data layer.

**Architecture:** New feature `src/features/whats-new/` with a pure, unit-tested `engine/` (semver gate), a thin orchestration hook (`useChangelog` + `localStorage` + open state), and presentational components (shadcn `Dialog`). Mounted once in `AppLayout`, covering both restored-session and fresh-login flows. Frontend-only; no migration, no backend.

**Tech Stack:** React 19, TypeScript (strict), TanStack Query (via `useChangelog`), TanStack Router (`useNavigate`), Tailwind CSS v4, shadcn/ui `Dialog`, Iconify (`@/components/Icon`), Vitest (engine tests).

## Global Constraints

Copied verbatim from the spec and project conventions — every task implicitly includes these:

- **Semantic tokens only.** Components consume only semantic tokens (`bg-background`, `text-foreground`, `text-primary`, `text-info`, `text-success`, `border-border`, `border-info`, `border-primary`). Never `--gallo-*` primitives or raw hex.
- **Language split.** Code/comments in English; all user-facing copy in Brazilian Portuguese with correct accents (ã, ç, é, …).
- **Naming.** `camelCase` vars/functions, `PascalCase` components/types, `kebab-case` files, `UPPER_SNAKE_CASE` constants. Domain interfaces prefixed `I`.
- **TypeScript strict.** No `any`. No new `tsc` errors in created files (evaluate by delta).
- **Data access.** Features never import `@/mocks`. This feature reads changelog via the existing `@/features/about/hooks/useChangelog` (cross-feature import, allowed — same pattern as `AppFooter`).
- **Accessibility & motion.** Let shadcn `Dialog` manage focus/`aria`. Respect `prefers-reduced-motion`. No emoji as icons (Iconify only). `cursor-pointer` on clickables. Contrast ≥ 4.5:1.
- **Commits.** Conventional Commits in English, atomic, ending with the `Co-Authored-By` trailer.
- **CI gate.** `bun run build` + `bun run test` must pass. Type-check via `bunx tsc --noEmit`, evaluated by delta on new files.

---

### Task 1: Pure semver gate (`engine/versionGate.ts`)

**Files:**
- Create: `src/features/whats-new/engine/versionGate.ts`
- Test: `src/features/whats-new/engine/versionGate.test.ts`

**Interfaces:**
- Consumes: `IRelease` from `@/shared/types/about` (fields used: `version: string`, `kind: "major"|"minor"|"patch"`).
- Produces:
  - `MAX_RELEASES_IN_MODAL: number` (= 5)
  - `interface VersionGateResult { shouldOpen: boolean; newReleases: IRelease[]; overflowCount: number }`
  - `compareSemver(a: string, b: string): number`
  - `selectNewReleases(releases: IRelease[], lastSeen: string | null, maxReleases?: number): VersionGateResult`
  - `latestVersionToMark(releases: IRelease[]): string | null`

- [ ] **Step 1: Write the failing test**

Create `src/features/whats-new/engine/versionGate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { IRelease } from "@/shared/types/about";
import {
  compareSemver,
  selectNewReleases,
  latestVersionToMark,
  MAX_RELEASES_IN_MODAL,
} from "./versionGate";

function rel(version: string, kind: IRelease["kind"]): IRelease {
  return {
    version,
    codename: null,
    date: "2026-01-01",
    kind,
    summary: "",
    block: null,
    categories: [],
    totalItems: 0,
    raw: "",
  };
}

describe("compareSemver", () => {
  it("orders numerically, not lexically (0.10.0 > 0.9.0)", () => {
    expect(compareSemver("0.10.0", "0.9.0")).toBeGreaterThan(0);
  });
  it("returns 0 for equal versions", () => {
    expect(compareSemver("1.2.3", "1.2.3")).toBe(0);
  });
  it("compares the patch segment", () => {
    expect(compareSemver("0.1.1", "0.1.0")).toBeGreaterThan(0);
    expect(compareSemver("0.1.0", "0.1.1")).toBeLessThan(0);
  });
});

describe("selectNewReleases", () => {
  it("baseline: lastSeen null → does not open", () => {
    const res = selectNewReleases([rel("0.110.0", "minor")], null);
    expect(res).toEqual({ shouldOpen: false, newReleases: [], overflowCount: 0 });
  });

  it("skips patches and releases not newer than lastSeen", () => {
    const releases = [rel("0.111.0", "minor"), rel("0.110.1", "patch"), rel("0.110.0", "minor")];
    const res = selectNewReleases(releases, "0.110.0");
    expect(res.shouldOpen).toBe(true);
    expect(res.newReleases.map((r) => r.version)).toEqual(["0.111.0"]);
    expect(res.overflowCount).toBe(0);
  });

  it("rollback: nothing newer → does not open", () => {
    const res = selectNewReleases([rel("0.100.0", "minor")], "0.200.0");
    expect(res.shouldOpen).toBe(false);
    expect(res.newReleases).toHaveLength(0);
  });

  it("caps at maxReleases and reports overflow", () => {
    const releases = Array.from({ length: 7 }, (_, i) => rel(`0.${200 - i}.0`, "minor"));
    const res = selectNewReleases(releases, "0.100.0");
    expect(res.newReleases).toHaveLength(MAX_RELEASES_IN_MODAL);
    expect(res.overflowCount).toBe(2);
    expect(res.shouldOpen).toBe(true);
  });
});

describe("latestVersionToMark", () => {
  it("returns the highest version including patch", () => {
    const releases = [rel("0.110.1", "patch"), rel("0.110.0", "minor")];
    expect(latestVersionToMark(releases)).toBe("0.110.1");
  });
  it("returns null for empty input", () => {
    expect(latestVersionToMark([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/whats-new/engine/versionGate.test.ts`
Expected: FAIL — cannot resolve `./versionGate` (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `src/features/whats-new/engine/versionGate.ts`:

```ts
import type { IRelease } from "@/shared/types/about";

/** Max releases listed inside the modal; the rest collapse into an overflow note. */
export const MAX_RELEASES_IN_MODAL = 5;

export interface VersionGateResult {
  shouldOpen: boolean;
  newReleases: IRelease[];
  overflowCount: number;
}

/**
 * Compares two "major.minor.patch" strings numerically.
 * Returns >0 if a > b, 0 if equal, <0 if a < b. Missing/NaN segments count as 0.
 */
export function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Selects the minor/major releases newer than `lastSeen` that warrant the modal.
 * `releases` is expected most-recent-first (useChangelog/parseChangelog order).
 *
 * - lastSeen === null → silent baseline (no modal)
 * - keeps version > lastSeen AND kind !== "patch"
 * - caps to `maxReleases`; remainder → overflowCount
 */
export function selectNewReleases(
  releases: IRelease[],
  lastSeen: string | null,
  maxReleases: number = MAX_RELEASES_IN_MODAL,
): VersionGateResult {
  if (lastSeen === null) {
    return { shouldOpen: false, newReleases: [], overflowCount: 0 };
  }
  const fresh = releases.filter(
    (r) => r.kind !== "patch" && compareSemver(r.version, lastSeen) > 0,
  );
  const newReleases = fresh.slice(0, maxReleases);
  const overflowCount = Math.max(0, fresh.length - newReleases.length);
  return { shouldOpen: newReleases.length > 0, newReleases, overflowCount };
}

/** Version to persist as "seen" — the highest absolute release (patch included). */
export function latestVersionToMark(releases: IRelease[]): string | null {
  if (releases.length === 0) return null;
  return releases.reduce(
    (max, r) => (compareSemver(r.version, max) > 0 ? r.version : max),
    releases[0].version,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/features/whats-new/engine/versionGate.test.ts`
Expected: PASS (all 9 assertions green).

- [ ] **Step 5: Commit**

```bash
git add src/features/whats-new/engine/versionGate.ts src/features/whats-new/engine/versionGate.test.ts
git commit -m "feat(whats-new): add pure semver gate for the version modal

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Constants — localStorage key + i18n

**Files:**
- Modify: `src/config/themes.ts` (add one key to `LOCALSTORAGE_KEYS`)
- Create: `src/features/whats-new/i18n/pt-BR.ts`

**Interfaces:**
- Consumes: `ReleaseKind` from `@/shared/types/about`.
- Produces:
  - `LOCALSTORAGE_KEYS.lastSeenVersion: "gallo-last-seen-version"`
  - `WHATS_NEW_I18N` object with keys: `title`, `subtitleTemplate`, `badge.minor`, `badge.major`, `codenamePrefix`, `addedHeading`, `overflowTemplate`, `escHint`, `seeAll`, `dismiss`.

- [ ] **Step 1: Add the localStorage key**

In `src/config/themes.ts`, inside the `LOCALSTORAGE_KEYS` object (currently starts at line 22 with `theme`/`mode`/`schedulingViewMode`), add a new entry:

```ts
  lastSeenVersion: "gallo-last-seen-version",
```

(Place it alongside the existing keys; keep the trailing comma style of the file.)

- [ ] **Step 2: Create the i18n file**

Create `src/features/whats-new/i18n/pt-BR.ts`:

```ts
import type { ReleaseKind } from "@/shared/types/about";

/** User-facing copy for the what's-new modal (Brazilian Portuguese). */
export const WHATS_NEW_I18N = {
  title: "Novidades da plataforma",
  /** {{count}} replaced at render time. */
  subtitleTemplate: "{{count}} novidade(s) desde sua última visita",
  badge: {
    minor: "Novidades",
    major: "Grande atualização",
  } satisfies Record<Exclude<ReleaseKind, "patch">, string>,
  codenamePrefix: "Codinome",
  addedHeading: "Novidades desta versão",
  /** {{count}} replaced at render time. */
  overflowTemplate: "e mais {{count}} versão(ões) — toque em “Ver tudo” para o histórico completo",
  escHint: "Esc também fecha",
  seeAll: "Ver tudo",
  dismiss: "Entendi",
} as const;
```

- [ ] **Step 3: Verify it type-checks and builds**

Run: `bunx tsc --noEmit`
Expected: no NEW errors mentioning `src/config/themes.ts` or `src/features/whats-new/i18n/pt-BR.ts` (baseline pre-existing errors elsewhere are acceptable).

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/config/themes.ts src/features/whats-new/i18n/pt-BR.ts
git commit -m "feat(whats-new): add last-seen-version storage key and i18n copy

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Orchestration hook (`hooks/useWhatsNew.ts`)

**Files:**
- Create: `src/features/whats-new/hooks/useWhatsNew.ts`

**Interfaces:**
- Consumes:
  - `selectNewReleases`, `latestVersionToMark` from `../engine/versionGate` (Task 1)
  - `LOCALSTORAGE_KEYS.lastSeenVersion` from `@/config/themes` (Task 2)
  - `useChangelog` from `@/features/about/hooks/useChangelog` → `{ data: IRelease[] | undefined }`
  - `useNavigate` from `@tanstack/react-router`
  - `ROUTES.CONFIG_SOBRE` from `@/features/shell/config/routes` (= `/app/configuracoes/sobre`)
- Produces:
  - `interface UseWhatsNewResult { open: boolean; releases: IRelease[]; overflowCount: number; dismiss: () => void; seeAll: () => void }`
  - `useWhatsNew(): UseWhatsNewResult`

- [ ] **Step 1: Write the hook**

Create `src/features/whats-new/hooks/useWhatsNew.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { IRelease } from "@/shared/types/about";
import { useChangelog } from "@/features/about/hooks/useChangelog";
import { ROUTES } from "@/features/shell/config/routes";
import { LOCALSTORAGE_KEYS } from "@/config/themes";
import { latestVersionToMark, selectNewReleases } from "../engine/versionGate";

/** Small settle delay so the modal does not flash mid-login. */
const OPEN_DELAY_MS = 500;

function readLastSeen(): string | null {
  try {
    return localStorage.getItem(LOCALSTORAGE_KEYS.lastSeenVersion);
  } catch {
    return null;
  }
}

function writeLastSeen(version: string): void {
  try {
    localStorage.setItem(LOCALSTORAGE_KEYS.lastSeenVersion, version);
  } catch {
    // localStorage unavailable (private mode / disabled) — no-op.
  }
}

export interface UseWhatsNewResult {
  open: boolean;
  releases: IRelease[];
  overflowCount: number;
  dismiss: () => void;
  seeAll: () => void;
}

/**
 * Decides whether the what's-new modal should open after login and exposes the
 * releases to show plus close handlers. Evaluated once per mount, after the
 * changelog query resolves. Never throws — a changelog failure simply keeps the
 * modal closed.
 */
export function useWhatsNew(): UseWhatsNewResult {
  const { data } = useChangelog();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [gate, setGate] = useState<{ releases: IRelease[]; overflowCount: number }>({
    releases: [],
    overflowCount: 0,
  });
  // One-shot guard so the gate is evaluated a single time per mount.
  const evaluatedRef = useRef(false);

  useEffect(() => {
    if (!data || data.length === 0 || evaluatedRef.current) return;
    evaluatedRef.current = true;

    const lastSeen = readLastSeen();

    // First visit → silent baseline: record current version, do not open.
    if (lastSeen === null) {
      const mark = latestVersionToMark(data);
      if (mark) writeLastSeen(mark);
      return;
    }

    const result = selectNewReleases(data, lastSeen);
    if (!result.shouldOpen) return;

    setGate({ releases: result.newReleases, overflowCount: result.overflowCount });
    const timer = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [data]);

  const markSeen = useCallback(() => {
    if (!data) return;
    const mark = latestVersionToMark(data);
    if (mark) writeLastSeen(mark);
  }, [data]);

  const dismiss = useCallback(() => {
    markSeen();
    setOpen(false);
  }, [markSeen]);

  const seeAll = useCallback(() => {
    markSeen();
    setOpen(false);
    navigate({ to: ROUTES.CONFIG_SOBRE });
  }, [markSeen, navigate]);

  return { open, releases: gate.releases, overflowCount: gate.overflowCount, dismiss, seeAll };
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `bunx tsc --noEmit`
Expected: no NEW errors mentioning `src/features/whats-new/hooks/useWhatsNew.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/features/whats-new/hooks/useWhatsNew.ts
git commit -m "feat(whats-new): add useWhatsNew orchestration hook

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Release card (`components/WhatsNewReleaseCard.tsx`)

**Files:**
- Create: `src/features/whats-new/components/WhatsNewReleaseCard.tsx`

**Interfaces:**
- Consumes:
  - `IRelease` from `@/shared/types/about`
  - `renderInlineMarkdown` from `@/features/about/parser/renderInlineMarkdown`
  - `WHATS_NEW_I18N` from `../i18n/pt-BR` (Task 2)
  - `Icon` from `@/components/Icon`, `cn` from `@/lib/utils`
- Produces: `WhatsNewReleaseCard({ release, highlighted }: { release: IRelease; highlighted?: boolean }): JSX.Element`

- [ ] **Step 1: Write the component**

Create `src/features/whats-new/components/WhatsNewReleaseCard.tsx`:

```tsx
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { IRelease } from "@/shared/types/about";
import { renderInlineMarkdown } from "@/features/about/parser/renderInlineMarkdown";
import { WHATS_NEW_I18N } from "../i18n/pt-BR";

interface IProps {
  release: IRelease;
  /** The current release renders highlighted with full bullets. */
  highlighted?: boolean;
}

/** Max "Added" bullets shown in the highlighted card. */
const HIGHLIGHT_BULLETS = 5;

function formatDateBr(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** First paragraph of a (possibly multi-paragraph) summary. */
function firstParagraph(summary: string): string {
  return summary.split(/\n{2,}/)[0]?.trim() ?? "";
}

export function WhatsNewReleaseCard({ release, highlighted = false }: IProps) {
  const isMajor = release.kind === "major";
  const badgeLabel = isMajor ? WHATS_NEW_I18N.badge.major : WHATS_NEW_I18N.badge.minor;
  const summary = firstParagraph(release.summary);
  const added = release.categories.find((c) => c.category === "added")?.items ?? [];
  const bullets = highlighted ? added.slice(0, HIGHLIGHT_BULLETS) : [];

  return (
    <div
      className={cn(
        "rounded-lg p-4",
        highlighted
          ? isMajor
            ? "border-2 border-primary"
            : "border-2 border-info"
          : "border border-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded px-2 py-0.5 text-[11px] font-semibold",
            isMajor ? "bg-primary/10 text-primary" : "bg-info/10 text-info",
          )}
        >
          {badgeLabel}
        </span>
        <span className="font-mono text-sm font-semibold text-foreground">v{release.version}</span>
        {release.codename && (
          <span className="text-sm font-semibold text-success">{release.codename}</span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{formatDateBr(release.date)}</span>
      </div>

      {summary && (
        <p
          className={cn(
            "mt-2.5 text-sm leading-relaxed text-muted-foreground",
            highlighted ? "line-clamp-4" : "line-clamp-2",
          )}
        >
          {renderInlineMarkdown(summary)}
        </p>
      )}

      {bullets.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {bullets.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-foreground">
              <Icon
                icon="mdi:plus-circle"
                size={15}
                className="mt-0.5 shrink-0 text-success"
              />
              <span className="leading-snug line-clamp-2">{renderInlineMarkdown(item)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks and builds**

Run: `bunx tsc --noEmit`
Expected: no NEW errors mentioning `WhatsNewReleaseCard.tsx`.

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/features/whats-new/components/WhatsNewReleaseCard.tsx
git commit -m "feat(whats-new): add release card component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Modal + barrel (`components/WhatsNewModal.tsx`, `index.ts`)

**Files:**
- Create: `src/features/whats-new/components/WhatsNewModal.tsx`
- Create: `src/features/whats-new/index.ts`

**Interfaces:**
- Consumes:
  - `useWhatsNew` from `../hooks/useWhatsNew` (Task 3)
  - `WhatsNewReleaseCard` from `./WhatsNewReleaseCard` (Task 4)
  - `WHATS_NEW_I18N` from `../i18n/pt-BR` (Task 2)
  - `Dialog`, `DialogContent`, `DialogTitle`, `DialogDescription` from `@/components/ui/dialog`
  - `Button` from `@/components/ui/button`, `Icon` from `@/components/Icon`
- Produces: `WhatsNewModal(): JSX.Element | null`, re-exported from the feature barrel.

> **Note on the close "X":** the project's `DialogContent` always renders a Radix
> `Close` button as its only direct `<button>` child. The class `[&>button]:hidden`
> hides it (our own buttons live nested inside footer `<div>`s, so they are not
> targeted). `Esc` still closes via `onOpenChange`. `onPointerDownOutside` /
> `onInteractOutside` `preventDefault()` make clicking the overlay a no-op
> (semi-blocking). `motion-reduce:animate-none` drops the entrance animation under
> reduced-motion.

- [ ] **Step 1: Write the modal**

Create `src/features/whats-new/components/WhatsNewModal.tsx`:

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useWhatsNew } from "../hooks/useWhatsNew";
import { WhatsNewReleaseCard } from "./WhatsNewReleaseCard";
import { WHATS_NEW_I18N } from "../i18n/pt-BR";

/**
 * Auto-opening "what's new" modal. Renders nothing until the gate selects
 * releases to show. Semi-blocking: closes via the footer buttons or Esc only.
 */
export function WhatsNewModal() {
  const { open, releases, overflowCount, dismiss, seeAll } = useWhatsNew();

  if (releases.length === 0) return null;

  const subtitle = WHATS_NEW_I18N.subtitleTemplate.replace("{{count}}", String(releases.length));
  const overflowNote = WHATS_NEW_I18N.overflowTemplate.replace("{{count}}", String(overflowCount));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <DialogContent
        className="max-w-lg gap-0 overflow-hidden p-0 [&>button]:hidden motion-reduce:animate-none"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-3 border-b border-border bg-background/90 px-5 py-4 backdrop-blur">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-success/10">
            <Icon icon="mdi:party-popper" size={22} className="text-success" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-base">{WHATS_NEW_I18N.title}</DialogTitle>
            <DialogDescription className="mt-0.5 text-xs">{subtitle}</DialogDescription>
          </div>
        </div>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 py-4">
          {releases.map((release, i) => (
            <WhatsNewReleaseCard key={release.version} release={release} highlighted={i === 0} />
          ))}
          {overflowCount > 0 && (
            <p className="pt-1 text-center text-xs text-muted-foreground">{overflowNote}</p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border bg-muted/30 px-5 py-3">
          <span className="mr-auto hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
            <Icon icon="mdi:information-outline" size={14} />
            {WHATS_NEW_I18N.escHint}
          </span>
          <Button variant="outline" size="sm" onClick={seeAll}>
            {WHATS_NEW_I18N.seeAll}
          </Button>
          <Button size="sm" onClick={dismiss}>
            {WHATS_NEW_I18N.dismiss}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Write the barrel**

Create `src/features/whats-new/index.ts`:

```ts
export { WhatsNewModal } from "./components/WhatsNewModal";
```

- [ ] **Step 3: Verify it type-checks and builds**

Run: `bunx tsc --noEmit`
Expected: no NEW errors mentioning `WhatsNewModal.tsx` or the barrel.

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/features/whats-new/components/WhatsNewModal.tsx src/features/whats-new/index.ts
git commit -m "feat(whats-new): add the version modal and feature barrel

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Mount in the app shell (`AppLayout.tsx`)

**Files:**
- Modify: `src/features/shell/layouts/AppLayout.tsx`

**Interfaces:**
- Consumes: `WhatsNewModal` from `@/features/whats-new` (Task 5).

- [ ] **Step 1: Add the import**

In `src/features/shell/layouts/AppLayout.tsx`, add to the import block (near the other shell-component imports, e.g. after the `OutsideHoursBanner` import on line 10):

```tsx
import { WhatsNewModal } from "@/features/whats-new";
```

- [ ] **Step 2: Render the modal**

Inside the layout's outer `<div className="flex h-screen ...">`, add `<WhatsNewModal />` next to the other portal-based overlays — place it immediately after `<UrgentBroadcastClaim />` (currently the last child before the closing `</div>`):

```tsx
        <BottomNav />
        <UrgentBroadcastClaim />
        <WhatsNewModal />
      </div>
```

- [ ] **Step 3: Verify it type-checks and builds**

Run: `bunx tsc --noEmit`
Expected: no NEW errors mentioning `AppLayout.tsx`.

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 4: Run the full test + lint gate**

Run: `bun run test`
Expected: PASS (including the new `versionGate.test.ts`).

Run: `bun run lint`
Expected: no new errors in `src/features/whats-new/**` or `AppLayout.tsx`.

- [ ] **Step 5: Manual smoke (performed by the user — do not use browser preview)**

Provide the user these steps:
1. Open the app at `/app/...` with `bun run dev`. On first load nothing pops (silent baseline writes `gallo-last-seen-version`).
2. In DevTools console, set an older version and reload:
   `localStorage.setItem("gallo-last-seen-version", "0.100.0"); location.reload();`
   → modal opens ~0.5s after the app loads, listing the minor/major releases since 0.100.0 (capped at 5, overflow note if more).
3. Verify: clicking the dark overlay does **not** close it; `Esc` closes it; "Entendi" closes it; "Ver tudo" navigates to `/app/configuracoes/sobre`. After any close, reloading does **not** reopen it.
4. Verify a patch-only gap does not open it:
   `localStorage.setItem("gallo-last-seen-version", "<current minor>"); location.reload();` → no modal.
5. (Optional) Toggle "Reduce motion" in the OS → reopen → entrance animation is suppressed.

- [ ] **Step 6: Commit**

```bash
git add src/features/shell/layouts/AppLayout.tsx
git commit -m "feat(whats-new): mount the version modal in the app shell

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Deferred / optional polish (not in this plan)

- `ScrollProgressBar` on the modal's scroll divider (UX-guideline). Deferred: the body is capped at 5 short cards and rarely scrolls; add later if desired.
- Cross-device persistence (DB), other surfaces (portal/PWA), and a per-user "don't show again" toggle — all explicitly out of scope per the spec.

## Self-review (author checklist — completed)

- **Spec coverage:** gatilho minor/major → Task 1 `selectNewReleases`; localStorage → Task 2 + Task 3; escopo `/app/*` → Task 6; conteúdo resumo+Added+"Ver tudo" → Task 4/5; semi-bloqueante → Task 5; baseline 1º acesso → Task 3; glass/badge/codinome/reduced-motion → Task 4/5; testes → Task 1. All covered.
- **Placeholder scan:** none — every code step contains full code and exact commands.
- **Type consistency:** `VersionGateResult`, `selectNewReleases`, `latestVersionToMark`, `UseWhatsNewResult`, `WHATS_NEW_I18N` keys and `WhatsNewReleaseCard`/`WhatsNewModal` props match across tasks.
