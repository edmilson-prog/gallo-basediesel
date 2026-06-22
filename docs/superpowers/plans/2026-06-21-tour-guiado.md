# Tour Guiado (Compass) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar um tour guiado que dispara na primeira visita de cada item do sidebar — tour rico (holofote) no Atendimento e card de boas-vindas nas demais telas — com controles de pular/rever/resetar/opt-out, sem nenhuma dependência nova.

**Architecture:** Feature `src/features/tour/` com engines puros (navegação, resolução de rota→tour, posicionamento do balão), persistência isolada em `tourStorage.ts` (localStorage por usuário), store Zustand para o runtime (tour ativo/passo) e componentes de UI renderizados via portal a partir de um `TourProvider` montado no `AppLayout`. O Atendimento ganha âncoras `data-tour`; as demais telas usam cards centralizados resolvidos por pathname.

**Tech Stack:** React 19, TanStack Router (file-based), Tailwind v4 + shadcn/ui, Zustand, Iconify (`@/components/Icon`), Vitest (env `node`).

**Spec de referência:** [docs/superpowers/specs/2026-06-21-tour-guiado-design.md](../specs/2026-06-21-tour-guiado-design.md)

## Global Constraints

- **Zero dependência nova.** `bunfig.toml` impõe guard de 24h; adicionar pacote exige confirmação do dono. Tudo é construído sobre React + Tailwind + portal.
- **Tokens semânticos apenas** (`bg-popover`, `text-foreground`, `text-muted-foreground`, `ring-primary`, `border-border`). Nunca `--gallo-*` nem hex — exceção única: o scrim escuro do holofote usa `rgba(2,6,23,0.55)` (cor de overlay, não de marca).
- **`prefers-reduced-motion`** respeitado via `motion-reduce:transition-none` em toda transição.
- **UI em português do Brasil com acentos corretos**; código (identificadores, comentários) em inglês.
- **Chaves localStorage com prefixo `gallo-`**: `gallo-tour-seen:<userId>` e `gallo-tour-optout:<userId>`.
- **Vitest env = `node`** (sem jsdom; sem `@testing-library`). Testes que tocam `localStorage`/`window` usam `vi.stubGlobal`. Componentes de UI **não** têm teste unitário — são verificados por `bun run build` + smoke manual.
- **Gate de CI prático:** `bun run build` e `bun run test` devem passar. `bunx tsc --noEmit` tem baseline de erros pré-existentes — avalie código novo por delta.
- **NUNCA** rodar `git add` em `.claude/launch.json` (tem mudança local de porta para o dev em 5174) nem em `src/routeTree.gen.ts` (gerado). Sempre `git add` os caminhos exatos da task.
- **Commits:** Conventional Commits em inglês, terminando com a linha `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Não mergear.** Integração só via PR, com autorização do dono. Este plano termina na implementação + verificação.

## File Structure

```
src/features/tour/
├── types.ts                       # TourKey, TourStep, TourSide, TourDef
├── storage/tourStorage.ts         # persistência localStorage (única abstração)
├── engine/
│   ├── tourNavigation.ts          # clamp/next/prev/isFirst/isLast
│   ├── tourResolution.ts          # normalizePath/resolveTourForPath/shouldAutoStart
│   └── popoverPlacement.ts        # computePlacement (rect+viewport → side/top/left)
├── config/tours.ts                # TOURS (2 ricos + 33 welcome) + getTourByKey
├── i18n/pt-BR.ts                  # TOUR_STRINGS (chrome: botões, settings, aria)
├── store/useTourStore.ts          # runtime: activeTour/stepIndex + start/next/prev/close
├── hooks/useTargetRect.ts         # mede + acompanha o alvo data-tour (rAF + timeout)
├── components/
│   ├── Spotlight.tsx              # overlay holofote com recorte
│   ├── TourStepCard.tsx           # balão do passo (anatomia + posicionamento)
│   ├── WelcomeCard.tsx            # card centralizado de boas-vindas
│   ├── TourProvider.tsx           # orquestrador: auto-start + portal + teclado
│   └── TourHelpButton.tsx         # "?" context-aware para o TopBar
├── pages/ToursSettingsPage.tsx    # central em Configurações
└── index.ts                       # barrel (TourProvider, TourHelpButton, ToursSettingsPage)

src/routes/app.configuracoes.tours.tsx   # rota da central

# Modificações em arquivos existentes:
src/features/shell/layouts/AppLayout.tsx          # monta <TourProvider>
src/features/shell/components/TopBar.tsx          # insere <TourHelpButton/>
src/features/shell/config/routes.ts               # + CONFIG_TOURS
src/features/shell/config/navigation.ts           # + item "Tours & Ajuda"
src/features/conversations/components/InboxHeader.tsx        # data-tour="inbox-header"
src/features/conversations/components/InboxFilters.tsx       # data-tour="inbox-filters"
src/features/conversations/pages/InboxPage.tsx              # data-tour="inbox-list"
src/features/conversations/components/ConversationHeader.tsx # data-tour="conversation-header"
src/features/conversations/components/MessageList.tsx        # data-tour="message-list"
src/features/conversations/components/MessageInput.tsx       # data-tour="composer"

docs/dev/guided-tour.md                            # documentação
```

> **Desvios conscientes do spec** (refinados pelo que existe no código real):
> - O tour `atendimento-inbox` aponta `inbox-header` (em vez de um botão "nova conversa" isolado, que vive dentro do header). Passos: boas-vindas → header → filtros → lista.
> - O tour `atendimento-conversa` dobra "ações da conversa" dentro do passo do cabeçalho (o menu kebab vive no `ConversationHeader`, que é um `<header>` ancorável; `ConversationMenu` retorna um Fragment, não ancorável). Passos: cabeçalho → mensagens → composer → conclusão.

---

### Task 1: Persistência (`tourStorage`)

**Files:**
- Create: `src/features/tour/storage/tourStorage.ts`
- Test: `src/features/tour/storage/tourStorage.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `getSeen(userId: string): Set<string>`
  - `isSeen(userId: string, key: string): boolean`
  - `markSeen(userId: string, key: string): void`
  - `getOptOut(userId: string): boolean`
  - `setOptOut(userId: string, value: boolean): void`
  - `resetAll(userId: string): void` — limpa APENAS o seen; não toca no opt-out

- [ ] **Step 1: Write the failing test**

```ts
// src/features/tour/storage/tourStorage.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSeen,
  isSeen,
  markSeen,
  getOptOut,
  setOptOut,
  resetAll,
} from "./tourStorage";

function makeMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", makeMemoryStorage());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("tourStorage", () => {
  it("marks and reads seen tours per user", () => {
    expect(isSeen("u1", "welcome-clientes")).toBe(false);
    markSeen("u1", "welcome-clientes");
    expect(isSeen("u1", "welcome-clientes")).toBe(true);
    expect(getSeen("u1").has("welcome-clientes")).toBe(true);
  });

  it("scopes seen tours by user", () => {
    markSeen("u1", "welcome-leads");
    expect(isSeen("u2", "welcome-leads")).toBe(false);
  });

  it("is idempotent on repeated markSeen", () => {
    markSeen("u1", "x");
    markSeen("u1", "x");
    expect(getSeen("u1").size).toBe(1);
  });

  it("stores and reads the global opt-out per user", () => {
    expect(getOptOut("u1")).toBe(false);
    setOptOut("u1", true);
    expect(getOptOut("u1")).toBe(true);
    setOptOut("u1", false);
    expect(getOptOut("u1")).toBe(false);
  });

  it("resetAll clears seen but keeps opt-out", () => {
    markSeen("u1", "a");
    setOptOut("u1", true);
    resetAll("u1");
    expect(getSeen("u1").size).toBe(0);
    expect(getOptOut("u1")).toBe(true);
  });

  it("returns an empty set on corrupted JSON", () => {
    localStorage.setItem("gallo-tour-seen:u1", "{not json");
    expect(getSeen("u1").size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/tour/storage/tourStorage.test.ts`
Expected: FAIL — cannot find module `./tourStorage`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/tour/storage/tourStorage.ts
//
// Persistence boundary for the guided tour. ALL localStorage access lives here
// so promoting to Supabase later means reimplementing only this file.
// Keys are per-user: `gallo-tour-seen:<userId>` (JSON string[]) and
// `gallo-tour-optout:<userId>` ("1" | "0").

const SEEN_PREFIX = "gallo-tour-seen:";
const OPTOUT_PREFIX = "gallo-tour-optout:";

function ls(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function getSeen(userId: string): Set<string> {
  const store = ls();
  if (!store || !userId) return new Set();
  try {
    const raw = store.getItem(SEEN_PREFIX + userId);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((k) => typeof k === "string")) : new Set();
  } catch {
    return new Set();
  }
}

export function isSeen(userId: string, key: string): boolean {
  return getSeen(userId).has(key);
}

export function markSeen(userId: string, key: string): void {
  const store = ls();
  if (!store || !userId) return;
  const seen = getSeen(userId);
  if (seen.has(key)) return;
  seen.add(key);
  try {
    store.setItem(SEEN_PREFIX + userId, JSON.stringify([...seen]));
  } catch {
    // ignore quota / unavailable storage
  }
}

export function getOptOut(userId: string): boolean {
  const store = ls();
  if (!store || !userId) return false;
  try {
    return store.getItem(OPTOUT_PREFIX + userId) === "1";
  } catch {
    return false;
  }
}

export function setOptOut(userId: string, value: boolean): void {
  const store = ls();
  if (!store || !userId) return;
  try {
    store.setItem(OPTOUT_PREFIX + userId, value ? "1" : "0");
  } catch {
    // ignore
  }
}

export function resetAll(userId: string): void {
  const store = ls();
  if (!store || !userId) return;
  try {
    store.removeItem(SEEN_PREFIX + userId);
  } catch {
    // ignore
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/features/tour/storage/tourStorage.test.ts`
Expected: PASS — 6 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/features/tour/storage/tourStorage.ts src/features/tour/storage/tourStorage.test.ts
git commit -m "$(cat <<'EOF'
feat(tour): add localStorage persistence boundary

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Engine de navegação (`tourNavigation`)

**Files:**
- Create: `src/features/tour/engine/tourNavigation.ts`
- Test: `src/features/tour/engine/tourNavigation.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `clampStep(index: number, stepCount: number): number`
  - `nextStep(index: number, stepCount: number): number` — para no último
  - `prevStep(index: number, stepCount: number): number` — para no 0
  - `isFirstStep(index: number): boolean`
  - `isLastStep(index: number, stepCount: number): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/tour/engine/tourNavigation.test.ts
import { describe, expect, it } from "vitest";
import { clampStep, nextStep, prevStep, isFirstStep, isLastStep } from "./tourNavigation";

describe("tourNavigation", () => {
  it("clamps an index into [0, stepCount-1]", () => {
    expect(clampStep(-5, 4)).toBe(0);
    expect(clampStep(10, 4)).toBe(3);
    expect(clampStep(2, 4)).toBe(2);
  });

  it("advances but stops at the last step", () => {
    expect(nextStep(0, 4)).toBe(1);
    expect(nextStep(3, 4)).toBe(3);
  });

  it("goes back but stops at the first step", () => {
    expect(prevStep(2, 4)).toBe(1);
    expect(prevStep(0, 4)).toBe(0);
  });

  it("knows the boundaries", () => {
    expect(isFirstStep(0)).toBe(true);
    expect(isFirstStep(1)).toBe(false);
    expect(isLastStep(3, 4)).toBe(true);
    expect(isLastStep(2, 4)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/tour/engine/tourNavigation.test.ts`
Expected: FAIL — cannot find module `./tourNavigation`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/tour/engine/tourNavigation.ts
// Pure step-index math for the tour runtime.

export function clampStep(index: number, stepCount: number): number {
  if (stepCount <= 0) return 0;
  return Math.min(Math.max(index, 0), stepCount - 1);
}

export function nextStep(index: number, stepCount: number): number {
  return clampStep(index + 1, stepCount);
}

export function prevStep(index: number, stepCount: number): number {
  return clampStep(index - 1, stepCount);
}

export function isFirstStep(index: number): boolean {
  return index <= 0;
}

export function isLastStep(index: number, stepCount: number): boolean {
  return index >= stepCount - 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/features/tour/engine/tourNavigation.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/features/tour/engine/tourNavigation.ts src/features/tour/engine/tourNavigation.test.ts
git commit -m "$(cat <<'EOF'
feat(tour): add pure step navigation engine

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Tipos + resolução de rota (`types` + `tourResolution`)

**Files:**
- Create: `src/features/tour/types.ts`
- Create: `src/features/tour/engine/tourResolution.ts`
- Test: `src/features/tour/engine/tourResolution.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - Types: `TourKey`, `TourSide`, `TourStep`, `TourDef`
  - `normalizePath(pathname: string): string`
  - `resolveTourForPath(pathname: string, tours: TourDef[]): TourDef | null` — exato primeiro, depois `matchPrefix`
  - `shouldAutoStart(ctx: { optOut: boolean; seen: boolean }): boolean`

- [ ] **Step 1: Create the types file**

```ts
// src/features/tour/types.ts
export type TourKey = string;
export type TourSide = "top" | "bottom" | "left" | "right";

export interface TourStep {
  /** data-tour id of the target element; absent => centered step. */
  target?: string;
  /** Iconify name (mdi:*). */
  icon: string;
  title: string;
  body: string;
  /** Preferred side for the popover relative to the target. Default "auto" (bottom-first). */
  placement?: TourSide;
}

export interface TourDef {
  key: TourKey;
  kind: "rich" | "welcome";
  /** Display name in the tours settings hub. */
  label: string;
  /** Exact pathname that auto-starts this tour (welcome + inbox). */
  route?: string;
  /** Prefix match for dynamic routes (e.g. "/app/atendimento/"). Checked after exact. */
  matchPrefix?: string;
  /** welcome => exactly one step. */
  steps: TourStep[];
}
```

- [ ] **Step 2: Write the failing test**

```ts
// src/features/tour/engine/tourResolution.test.ts
import { describe, expect, it } from "vitest";
import { normalizePath, resolveTourForPath, shouldAutoStart } from "./tourResolution";
import type { TourDef } from "../types";

const TOURS: TourDef[] = [
  { key: "atendimento-inbox", kind: "rich", label: "Atendimento", route: "/app/atendimento", steps: [] },
  { key: "atendimento-conversa", kind: "rich", label: "Conversa", matchPrefix: "/app/atendimento/", steps: [] },
  { key: "welcome-clientes", kind: "welcome", label: "Clientes", route: "/app/clientes", steps: [] },
];

describe("normalizePath", () => {
  it("strips a single trailing slash but keeps root", () => {
    expect(normalizePath("/app/clientes/")).toBe("/app/clientes");
    expect(normalizePath("/app/clientes")).toBe("/app/clientes");
    expect(normalizePath("/")).toBe("/");
  });
});

describe("resolveTourForPath", () => {
  it("matches an exact route", () => {
    expect(resolveTourForPath("/app/clientes", TOURS)?.key).toBe("welcome-clientes");
  });

  it("prefers exact over prefix for the inbox landing", () => {
    expect(resolveTourForPath("/app/atendimento", TOURS)?.key).toBe("atendimento-inbox");
  });

  it("uses the prefix for an open conversation", () => {
    expect(resolveTourForPath("/app/atendimento/abc123", TOURS)?.key).toBe("atendimento-conversa");
  });

  it("normalizes trailing slashes before matching", () => {
    expect(resolveTourForPath("/app/atendimento/", TOURS)?.key).toBe("atendimento-inbox");
  });

  it("returns null when nothing matches", () => {
    expect(resolveTourForPath("/app/clientes/42", TOURS)).toBeNull();
  });
});

describe("shouldAutoStart", () => {
  it("starts only when not seen and not opted out", () => {
    expect(shouldAutoStart({ optOut: false, seen: false })).toBe(true);
    expect(shouldAutoStart({ optOut: true, seen: false })).toBe(false);
    expect(shouldAutoStart({ optOut: false, seen: true })).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bunx vitest run src/features/tour/engine/tourResolution.test.ts`
Expected: FAIL — cannot find module `./tourResolution`.

- [ ] **Step 4: Write minimal implementation**

```ts
// src/features/tour/engine/tourResolution.ts
import type { TourDef } from "../types";

export function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

export function resolveTourForPath(pathname: string, tours: TourDef[]): TourDef | null {
  const path = normalizePath(pathname);
  const exact = tours.find((t) => t.route && normalizePath(t.route) === path);
  if (exact) return exact;
  const prefixed = tours.find((t) => t.matchPrefix && path.startsWith(t.matchPrefix));
  return prefixed ?? null;
}

export function shouldAutoStart(ctx: { optOut: boolean; seen: boolean }): boolean {
  return !ctx.optOut && !ctx.seen;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bunx vitest run src/features/tour/engine/tourResolution.test.ts`
Expected: PASS — all tests passed.

- [ ] **Step 6: Commit**

```bash
git add src/features/tour/types.ts src/features/tour/engine/tourResolution.ts src/features/tour/engine/tourResolution.test.ts
git commit -m "$(cat <<'EOF'
feat(tour): add tour types and route resolution engine

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Engine de posicionamento (`popoverPlacement`)

**Files:**
- Create: `src/features/tour/engine/popoverPlacement.ts`
- Test: `src/features/tour/engine/popoverPlacement.test.ts`

**Interfaces:**
- Consumes: `TourSide` from `../types`.
- Produces:
  - `interface Rect { top; left; width; height }`
  - `interface Size { width; height }`
  - `interface Placement { side: TourSide; top: number; left: number }`
  - `computePlacement(target: Rect, card: Size, viewport: Size, preferred?: TourSide, gap?: number): Placement`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/tour/engine/popoverPlacement.test.ts
import { describe, expect, it } from "vitest";
import { computePlacement } from "./popoverPlacement";

const viewport = { width: 1000, height: 800 };
const card = { width: 300, height: 160 };

describe("computePlacement", () => {
  it("places below the target by default when there is room", () => {
    const target = { top: 100, left: 400, width: 200, height: 40 };
    const p = computePlacement(target, card, viewport);
    expect(p.side).toBe("bottom");
    expect(p.top).toBeGreaterThan(target.top + target.height);
  });

  it("flips above when there is no room below", () => {
    const target = { top: 700, left: 400, width: 200, height: 40 };
    const p = computePlacement(target, card, viewport, "bottom");
    expect(p.side).toBe("top");
    expect(p.top).toBeLessThan(target.top);
  });

  it("clamps horizontally so the card stays on screen", () => {
    const target = { top: 100, left: 960, width: 30, height: 30 };
    const p = computePlacement(target, card, viewport);
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.left + card.width).toBeLessThanOrEqual(viewport.width - 8);
  });

  it("honors a 'right' preference when it fits", () => {
    const target = { top: 300, left: 100, width: 40, height: 40 };
    const p = computePlacement(target, card, viewport, "right");
    expect(p.side).toBe("right");
    expect(p.left).toBeGreaterThanOrEqual(target.left + target.width);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/tour/engine/popoverPlacement.test.ts`
Expected: FAIL — cannot find module `./popoverPlacement`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/tour/engine/popoverPlacement.ts
import type { TourSide } from "../types";

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}
export interface Size {
  width: number;
  height: number;
}
export interface Placement {
  side: TourSide;
  top: number;
  left: number;
}

const MARGIN = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function fits(side: TourSide, t: Rect, c: Size, vp: Size, gap: number): boolean {
  switch (side) {
    case "bottom":
      return t.top + t.height + gap + c.height <= vp.height - MARGIN;
    case "top":
      return t.top - gap - c.height >= MARGIN;
    case "right":
      return t.left + t.width + gap + c.width <= vp.width - MARGIN;
    case "left":
      return t.left - gap - c.width >= MARGIN;
  }
}

const OPPOSITE: Record<TourSide, TourSide> = {
  bottom: "top",
  top: "bottom",
  right: "left",
  left: "right",
};

export function computePlacement(
  target: Rect,
  card: Size,
  viewport: Size,
  preferred: TourSide = "bottom",
  gap = 12,
): Placement {
  let side = preferred;
  if (!fits(side, target, card, viewport, gap) && fits(OPPOSITE[side], target, card, viewport, gap)) {
    side = OPPOSITE[side];
  }

  let top: number;
  let left: number;
  if (side === "bottom" || side === "top") {
    top = side === "bottom" ? target.top + target.height + gap : target.top - gap - card.height;
    left = target.left + target.width / 2 - card.width / 2;
  } else {
    left = side === "right" ? target.left + target.width + gap : target.left - gap - card.width;
    top = target.top + target.height / 2 - card.height / 2;
  }

  top = clamp(top, MARGIN, viewport.height - card.height - MARGIN);
  left = clamp(left, MARGIN, viewport.width - card.width - MARGIN);
  return { side, top, left };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/features/tour/engine/popoverPlacement.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/features/tour/engine/popoverPlacement.ts src/features/tour/engine/popoverPlacement.test.ts
git commit -m "$(cat <<'EOF'
feat(tour): add popover placement engine

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Conteúdo dos tours + strings (`config/tours` + `i18n/pt-BR`)

**Files:**
- Create: `src/features/tour/config/tours.ts`
- Create: `src/features/tour/i18n/pt-BR.ts`
- Test: `src/features/tour/config/tours.test.ts`

**Interfaces:**
- Consumes: `TourDef` from `../types`; `resolveTourForPath` from `../engine/tourResolution`.
- Produces:
  - `TOURS: TourDef[]`
  - `getTourByKey(key: string): TourDef | undefined`
  - `TOUR_STRINGS` (objeto `as const`)

- [ ] **Step 1: Write the failing test**

```ts
// src/features/tour/config/tours.test.ts
import { describe, expect, it } from "vitest";
import { TOURS, getTourByKey } from "./tours";
import { resolveTourForPath } from "../engine/tourResolution";

describe("TOURS registry", () => {
  it("has unique keys", () => {
    const keys = TOURS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("welcome tours have exactly one step and an exact route", () => {
    for (const t of TOURS.filter((x) => x.kind === "welcome")) {
      expect(t.steps.length, t.key).toBe(1);
      expect(t.route, t.key).toBeTruthy();
    }
  });

  it("rich tours have at least two steps", () => {
    for (const t of TOURS.filter((x) => x.kind === "rich")) {
      expect(t.steps.length, t.key).toBeGreaterThanOrEqual(2);
    }
  });

  it("resolves the Atendimento tours by path", () => {
    expect(resolveTourForPath("/app/atendimento", TOURS)?.key).toBe("atendimento-inbox");
    expect(resolveTourForPath("/app/atendimento/xyz", TOURS)?.key).toBe("atendimento-conversa");
  });

  it("resolves a welcome tour by path", () => {
    expect(resolveTourForPath("/app/clientes", TOURS)?.key).toBe("welcome-clientes");
  });

  it("getTourByKey finds a known tour", () => {
    expect(getTourByKey("welcome-pedidos")?.label).toBe("Pedidos");
    expect(getTourByKey("nope")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/tour/config/tours.test.ts`
Expected: FAIL — cannot find module `./tours`.

- [ ] **Step 3: Write the i18n strings**

```ts
// src/features/tour/i18n/pt-BR.ts
// UI chrome strings for the guided tour (pt-BR). Tour step content lives in
// config/tours.ts; this file holds buttons, the settings hub and a11y labels.

export const TOUR_STRINGS = {
  back: "Voltar",
  skip: "Pular",
  next: "Próximo",
  finish: "Concluir",
  gotIt: "Entendi",
  stepProgress: (current: number, total: number) => `${current} de ${total}`,
  helpButtonLabel: "Rever o tour desta tela",
  dialogLabel: "Tour guiado",
  nav: "Tours & Ajuda",
  settings: {
    title: "Tours & Ajuda",
    subtitle:
      "Reveja os tours guiados de cada tela ou desligue os avisos automáticos. As preferências ficam salvas neste navegador.",
    optOutLabel: "Tours automáticos",
    optOutOn: "Ligados — aparecem na primeira visita de cada tela",
    optOutOff: "Desligados — você ainda pode rever pelo ícone ?",
    enable: "Ligar",
    disable: "Desligar",
    resetTitle: "Resetar todos os tours",
    resetHint: "Faz todos os tours aparecerem de novo na próxima visita.",
    reset: "Resetar",
    listTitle: "Tours disponíveis",
    seen: "Visto",
    notSeen: "Novo",
    replay: "Rever",
  },
} as const;
```

- [ ] **Step 4: Write the tours registry**

```ts
// src/features/tour/config/tours.ts
import type { TourDef } from "../types";

// Rich tours (holofote) — Atendimento has two states (inbox vs open conversation).
const ATENDIMENTO_INBOX: TourDef = {
  key: "atendimento-inbox",
  kind: "rich",
  label: "Atendimento — caixa de conversas",
  route: "/app/atendimento",
  steps: [
    {
      icon: "mdi:hand-wave",
      title: "Bem-vindo ao Atendimento",
      body: "Em 1 minuto você aprende a receber, responder e organizar suas conversas.",
    },
    {
      target: "inbox-header",
      icon: "mdi:inbox",
      title: "O topo da caixa",
      body: "Aqui ficam o total de conversas, a busca e o botão para iniciar um atendimento novo.",
      placement: "bottom",
    },
    {
      target: "inbox-filters",
      icon: "mdi:filter-variant",
      title: "Encontre conversas",
      body: "Filtre por status, não lidas ou número da conta.",
      placement: "bottom",
    },
    {
      target: "inbox-list",
      icon: "mdi:message-text",
      title: "Sua caixa de conversas",
      body: "Cada conversa mostra o contato, a última mensagem e o status. As não lidas ficam no topo.",
      placement: "right",
    },
  ],
};

const ATENDIMENTO_CONVERSA: TourDef = {
  key: "atendimento-conversa",
  kind: "rich",
  label: "Atendimento — dentro da conversa",
  matchPrefix: "/app/atendimento/",
  steps: [
    {
      target: "conversation-header",
      icon: "mdi:account",
      title: "Quem é o cliente",
      body: "No topo aparece o contato, por qual número você responde e as ações: transferir, notas e a ficha.",
      placement: "bottom",
    },
    {
      target: "message-list",
      icon: "mdi:message-text-outline",
      title: "O histórico",
      body: "Todas as mensagens ficam aqui. Cada uma mostra se foi enviada, entregue ou lida.",
      placement: "left",
    },
    {
      target: "composer",
      icon: "mdi:send",
      title: "Responda por aqui",
      body: "Digite e envie. Use o anexo para mandar foto da peça ou o PDF do orçamento.",
      placement: "top",
    },
    {
      icon: "mdi:check-circle",
      title: "Pronto!",
      body: "Você pode rever este tour quando quiser no ícone ? no topo da tela.",
    },
  ],
};

// Welcome cards (estilo C) — one per sidebar item. Single centered step.
function welcome(key: string, label: string, route: string, icon: string, body: string): TourDef {
  return { key, kind: "welcome", label, route, steps: [{ icon, title: label, body }] };
}

const WELCOME_TOURS: TourDef[] = [
  welcome("welcome-inicio", "Início", "/app/inicio", "mdi:home-variant", "Seu ponto de partida: resumo do dia, conversas recentes e atalhos rápidos."),
  welcome("welcome-clientes", "Clientes", "/app/clientes", "mdi:account-multiple", "Sua base B2B e B2C: busque, filtre e abra a ficha completa de cada cliente."),
  welcome("welcome-leads", "Leads", "/app/leads", "mdi:account-question", "Oportunidades em andamento: acompanhe o funil e mova os leads entre etapas."),
  welcome("welcome-veiculos", "Veículos", "/app/veiculos", "mdi:truck", "A frota dos clientes: cadastre caminhões e use o modelo para achar a peça certa."),
  welcome("welcome-carteira", "Carteira", "/app/carteira", "mdi:briefcase-account", "Sua carteira de clientes: quem é seu, responsáveis e transferências."),
  welcome("welcome-catalogo", "Catálogo", "/app/catalogo", "mdi:cog", "Catálogo de peças: busque por código, aplicação ou modelo de veículo."),
  welcome("welcome-kits", "Kits por modelo", "/app/kits", "mdi:truck-outline", "Kits prontos por modelo de caminhão para montar orçamentos mais rápido."),
  welcome("welcome-orcamentos", "Orçamentos", "/app/orcamentos", "mdi:file-document-outline", "Monte orçamentos com peças do catálogo e envie direto pelo WhatsApp."),
  welcome("welcome-pedidos", "Pedidos", "/app/pedidos", "mdi:clipboard-list", "Acompanhe seus pedidos do rascunho até a entrega."),
  welcome("welcome-storefront-admin", "Admin da Loja", "/app/storefront-admin", "mdi:storefront", "Configure a loja online: produtos, categorias e destaques da vitrine."),
  welcome("welcome-sdr", "Painel SDR", "/app/sdr", "mdi:robot", "Qualificação automática de leads: acompanhe sessões e escalações."),
  welcome("welcome-copiloto", "Copiloto", "/app/gestao/copiloto", "mdi:robot-happy-outline", "Seu assistente de IA: peça resumos, análises e ajuda nas conversas."),
  welcome("welcome-gestao", "Visão executiva", "/app/gestao", "mdi:view-dashboard", "Panorama do negócio: os principais números da operação num só lugar."),
  welcome("welcome-vendas", "Vendas", "/app/gestao/vendas", "mdi:chart-line", "Análise de vendas: evolução, ranking e desempenho por período."),
  welcome("welcome-forecast", "Forecast", "/app/gestao/forecast", "mdi:chart-timeline", "Projeção de vendas: o que está previsto para fechar no período."),
  welcome("welcome-metas", "Metas", "/app/gestao/metas", "mdi:target", "Metas da equipe: defina, acompanhe e bata os objetivos do mês."),
  welcome("welcome-indicadores", "Indicadores", "/app/gestao/indicadores", "mdi:chart-line", "Indicadores de desempenho da operação comercial."),
  welcome("welcome-ranking", "Ranking", "/app/gestao/ranking", "mdi:trophy", "Ranking dos vendedores: gamificação e disputa saudável."),
  welcome("welcome-positivacao", "Positivação", "/app/gestao/positivacao", "mdi:account-check", "Clientes que compraram no período: acompanhe a positivação da carteira."),
  welcome("welcome-abc", "Curva ABC", "/app/gestao/abc", "mdi:chart-arc", "Classifique clientes e produtos por relevância (A, B e C)."),
  welcome("welcome-carteira-analitica", "Carteira Analítica", "/app/gestao/carteira-analitica", "mdi:heart-pulse", "Saúde da carteira: quem está ativo, em risco ou inativo."),
  welcome("welcome-comissoes", "Comissões", "/app/gestao/comissoes", "mdi:cash-multiple", "Apuração de comissões por vendedor e período."),
  welcome("welcome-dre", "DRE Gerencial", "/app/gestao/dre", "mdi:file-chart", "Demonstração de resultados: receitas, custos e lucro."),
  welcome("welcome-rentabilidade", "Rentabilidade", "/app/gestao/rentabilidade", "mdi:scale-balance", "Margem e rentabilidade por produto, cliente e venda."),
  welcome("welcome-despesas", "Despesas", "/app/gestao/despesas", "mdi:cash-remove", "Lance e acompanhe as despesas da operação."),
  welcome("welcome-caixa", "Fluxo de Caixa", "/app/gestao/caixa", "mdi:cash-flow", "Entradas e saídas: a saúde financeira ao longo do tempo."),
  welcome("welcome-estoque", "Estoque", "/app/gestao/estoque", "mdi:warehouse", "Posição de estoque: o que tem, onde e quanto."),
  welcome("welcome-estoque-mov", "Movimentação", "/app/gestao/estoque-movimentacao", "mdi:swap-vertical-variant", "Entradas e saídas de estoque, item a item."),
  welcome("welcome-insights", "Insights", "/app/insights", "mdi:brain", "Recomendações automáticas para agir sobre clientes e vendas."),
  welcome("welcome-saude", "Saúde do Sistema", "/app/gestao/saude", "mdi:pulse", "Status técnico da plataforma: integrações, WhatsApp e serviços."),
  welcome("welcome-config", "Admin", "/app/configuracoes", "mdi:cog-outline", "Configurações gerais da loja, equipe e plataforma."),
  welcome("welcome-perfil", "Perfil", "/app/configuracoes/perfil", "mdi:account", "Seus dados, disponibilidade e preferências de conta."),
  welcome("welcome-aparencia", "Aparência", "/app/configuracoes/aparencia", "mdi:palette", "Tema, cores e modo claro/escuro."),
];

export const TOURS: TourDef[] = [ATENDIMENTO_INBOX, ATENDIMENTO_CONVERSA, ...WELCOME_TOURS];

export function getTourByKey(key: string): TourDef | undefined {
  return TOURS.find((t) => t.key === key);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bunx vitest run src/features/tour/config/tours.test.ts`
Expected: PASS — 6 tests passed.

- [ ] **Step 6: Commit**

```bash
git add src/features/tour/config/tours.ts src/features/tour/config/tours.test.ts src/features/tour/i18n/pt-BR.ts
git commit -m "$(cat <<'EOF'
feat(tour): add tour registry content and pt-BR chrome strings

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Store de runtime (`useTourStore`)

**Files:**
- Create: `src/features/tour/store/useTourStore.ts`
- Test: `src/features/tour/store/useTourStore.test.ts`

**Interfaces:**
- Consumes: `TourDef` from `../types`; `nextStep`/`prevStep`/`isLastStep` from `../engine/tourNavigation`; `markSeen` from `../storage/tourStorage`.
- Produces:
  - `useTourStore` (Zustand) com estado `{ activeTour: TourDef | null; stepIndex: number; userId: string | null }`
  - Ações: `start(def: TourDef, userId: string): void`, `next(): void`, `prev(): void`, `close(): void`
  - `close()` marca o tour ativo como visto (via `markSeen`) e limpa o estado; `next()` no último passo chama `close()`.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/tour/store/useTourStore.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTourStore } from "./useTourStore";
import { getSeen } from "../storage/tourStorage";
import type { TourDef } from "../types";

function makeMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

const DEF: TourDef = {
  key: "rich-x",
  kind: "rich",
  label: "X",
  route: "/x",
  steps: [
    { icon: "a", title: "1", body: "b1" },
    { icon: "a", title: "2", body: "b2" },
    { icon: "a", title: "3", body: "b3" },
  ],
};

beforeEach(() => {
  vi.stubGlobal("localStorage", makeMemoryStorage());
  useTourStore.setState({ activeTour: null, stepIndex: 0, userId: null });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useTourStore", () => {
  it("starts a tour at step 0", () => {
    useTourStore.getState().start(DEF, "u1");
    expect(useTourStore.getState().activeTour?.key).toBe("rich-x");
    expect(useTourStore.getState().stepIndex).toBe(0);
  });

  it("advances and goes back within bounds", () => {
    useTourStore.getState().start(DEF, "u1");
    useTourStore.getState().next();
    expect(useTourStore.getState().stepIndex).toBe(1);
    useTourStore.getState().prev();
    expect(useTourStore.getState().stepIndex).toBe(0);
  });

  it("next() on the last step closes and marks the tour seen", () => {
    useTourStore.getState().start(DEF, "u1");
    useTourStore.getState().next();
    useTourStore.getState().next();
    expect(useTourStore.getState().stepIndex).toBe(2); // last
    useTourStore.getState().next(); // past last => close
    expect(useTourStore.getState().activeTour).toBeNull();
    expect(getSeen("u1").has("rich-x")).toBe(true);
  });

  it("close() marks seen and clears state", () => {
    useTourStore.getState().start(DEF, "u1");
    useTourStore.getState().close();
    expect(useTourStore.getState().activeTour).toBeNull();
    expect(getSeen("u1").has("rich-x")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/tour/store/useTourStore.test.ts`
Expected: FAIL — cannot find module `./useTourStore`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/tour/store/useTourStore.ts
import { create } from "zustand";
import type { TourDef } from "../types";
import { isLastStep, nextStep, prevStep } from "../engine/tourNavigation";
import { markSeen } from "../storage/tourStorage";

interface TourRuntimeState {
  activeTour: TourDef | null;
  stepIndex: number;
  userId: string | null;
  start: (def: TourDef, userId: string) => void;
  next: () => void;
  prev: () => void;
  close: () => void;
}

export const useTourStore = create<TourRuntimeState>((set, get) => ({
  activeTour: null,
  stepIndex: 0,
  userId: null,
  start: (def, userId) => set({ activeTour: def, stepIndex: 0, userId }),
  next: () => {
    const { activeTour, stepIndex } = get();
    if (!activeTour) return;
    if (isLastStep(stepIndex, activeTour.steps.length)) {
      get().close();
      return;
    }
    set({ stepIndex: nextStep(stepIndex, activeTour.steps.length) });
  },
  prev: () => {
    const { activeTour, stepIndex } = get();
    if (!activeTour) return;
    set({ stepIndex: prevStep(stepIndex, activeTour.steps.length) });
  },
  close: () => {
    const { activeTour, userId } = get();
    if (activeTour && userId) markSeen(userId, activeTour.key);
    set({ activeTour: null, stepIndex: 0 });
  },
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/features/tour/store/useTourStore.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/features/tour/store/useTourStore.ts src/features/tour/store/useTourStore.test.ts
git commit -m "$(cat <<'EOF'
feat(tour): add runtime store (active tour + step navigation)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Componentes do holofote (`useTargetRect` + `Spotlight` + `TourStepCard`)

**Files:**
- Create: `src/features/tour/hooks/useTargetRect.ts`
- Create: `src/features/tour/components/Spotlight.tsx`
- Create: `src/features/tour/components/TourStepCard.tsx`

**Interfaces:**
- Consumes: `computePlacement` from `../engine/popoverPlacement`; `isFirstStep`/`isLastStep` from `../engine/tourNavigation`; `TOUR_STRINGS` from `../i18n/pt-BR`; `TourDef` from `../types`; `Icon` from `@/components/Icon`; `Button` from `@/components/ui/button`.
- Produces:
  - `useTargetRect(targetId: string | undefined, active: boolean): DOMRect | null`
  - `Spotlight({ rect }: { rect: DOMRect | null })`
  - `TourStepCard({ def, stepIndex, rect, onNext, onPrev, onClose })`

> No unit tests (DOM-bound; Vitest env is `node` and there is no testing-library). Verified by `bun run build` + manual smoke.

- [ ] **Step 1: Create `useTargetRect`**

```ts
// src/features/tour/hooks/useTargetRect.ts
import { useEffect, useState } from "react";

// Measures and tracks a [data-tour="<id>"] element. Polls with rAF until the
// element exists (screens load async), then follows it on resize/scroll.
// Returns null when there is no target id, the tour is inactive, or the
// element never appeared within the timeout (caller treats null as "centered").
export function useTargetRect(targetId: string | undefined, active: boolean): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!active || !targetId) {
      setRect(null);
      return;
    }
    const selector = `[data-tour="${targetId}"]`;
    const TIMEOUT = 3000;
    const start = performance.now();
    let raf = 0;
    let cancelled = false;

    const read = (): boolean => {
      const el = document.querySelector(selector);
      if (el) {
        setRect(el.getBoundingClientRect());
        return true;
      }
      return false;
    };

    const poll = () => {
      if (cancelled) return;
      if (read()) return;
      if (performance.now() - start > TIMEOUT) {
        setRect(null);
        return;
      }
      raf = requestAnimationFrame(poll);
    };
    poll();

    const onChange = () => {
      const el = document.querySelector(selector);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [targetId, active]);

  return rect;
}
```

- [ ] **Step 2: Create `Spotlight`**

```tsx
// src/features/tour/components/Spotlight.tsx

// Dimmed overlay with a cutout over the target. The inset-0 container captures
// clicks (blocks the app during a step). The dark scrim is painted by a huge
// box-shadow on the cutout box; when there is no target, the whole screen dims.
export function Spotlight({ rect }: { rect: DOMRect | null }) {
  const pad = 6;
  return (
    <div className="fixed inset-0 z-50" aria-hidden="true">
      {rect ? (
        <div
          className="absolute rounded-md ring-2 ring-primary transition-all duration-200 motion-reduce:transition-none"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(2,6,23,0.55)",
          }}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: "rgba(2,6,23,0.55)" }} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `TourStepCard`**

```tsx
// src/features/tour/components/TourStepCard.tsx
import { useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import type { TourDef } from "../types";
import { computePlacement } from "../engine/popoverPlacement";
import { isFirstStep, isLastStep } from "../engine/tourNavigation";
import { TOUR_STRINGS as S } from "../i18n/pt-BR";

interface TourStepCardProps {
  def: TourDef;
  stepIndex: number;
  rect: DOMRect | null;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

const CARD_WIDTH = 300;

export function TourStepCard({ def, stepIndex, rect, onNext, onPrev, onClose }: TourStepCardProps) {
  const step = def.steps[stepIndex];
  const total = def.steps.length;
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!rect) {
      setPos(null);
      return;
    }
    const el = cardRef.current;
    if (!el) return;
    const placement = computePlacement(
      { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      { width: el.offsetWidth, height: el.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
      step.placement ?? "bottom",
    );
    setPos({ top: placement.top, left: placement.left });
  }, [rect, stepIndex, step.placement]);

  const centered = !rect || !pos;
  const wrapperClass = centered
    ? "fixed inset-0 z-[51] flex items-center justify-center p-4"
    : "fixed z-[51]";
  const wrapperStyle = centered ? undefined : { top: pos!.top, left: pos!.left, width: CARD_WIDTH };

  return (
    <div className={wrapperClass} style={wrapperStyle}>
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={S.dialogLabel}
        style={centered ? { width: CARD_WIDTH } : undefined}
        className="rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg duration-200 animate-in fade-in zoom-in-95 motion-reduce:animate-none"
      >
        <div className="mb-2 flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon icon={step.icon} size={18} />
          </span>
          <h2 className="text-sm font-medium text-foreground">{step.title}</h2>
        </div>
        <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
          {step.body}
        </p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex gap-1" aria-hidden="true">
              {def.steps.map((_, i) => (
                <span
                  key={i}
                  className={
                    i === stepIndex
                      ? "h-1.5 w-3.5 rounded-full bg-primary transition-all"
                      : "h-1.5 w-1.5 rounded-full bg-border"
                  }
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">{S.stepProgress(stepIndex + 1, total)}</span>
          </div>
          <div className="flex items-center gap-1">
            {!isFirstStep(stepIndex) && (
              <Button variant="ghost" size="sm" onClick={onPrev}>
                {S.back}
              </Button>
            )}
            {!isLastStep(stepIndex, total) && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                {S.skip}
              </Button>
            )}
            <Button size="sm" onClick={onNext}>
              {isLastStep(stepIndex, total) ? S.finish : S.next}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `bun run build`
Expected: build completes without errors referencing the new files.

- [ ] **Step 5: Commit**

```bash
git add src/features/tour/hooks/useTargetRect.ts src/features/tour/components/Spotlight.tsx src/features/tour/components/TourStepCard.tsx
git commit -m "$(cat <<'EOF'
feat(tour): add spotlight overlay, step card and target tracker

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Card de boas-vindas + Provider + barrel (`WelcomeCard` + `TourProvider` + `index`)

**Files:**
- Create: `src/features/tour/components/WelcomeCard.tsx`
- Create: `src/features/tour/components/TourProvider.tsx`
- Create: `src/features/tour/index.ts`

**Interfaces:**
- Consumes: `useAuth` from `@/features/auth/useAuth`; `useLocation` from `@tanstack/react-router`; `useTourStore` from `../store/useTourStore`; `resolveTourForPath`/`shouldAutoStart` from `../engine/tourResolution`; `TOURS` from `../config/tours`; `getOptOut`/`isSeen` from `../storage/tourStorage`; `Spotlight`, `TourStepCard`, `WelcomeCard`; `useTargetRect`; `Icon`, `Button`, `TOUR_STRINGS`.
- Produces:
  - `WelcomeCard({ def, onClose })`
  - `TourProvider({ children }: { children: React.ReactNode })`
  - barrel exports: `TourProvider`, `TourHelpButton` (criado na Task 10), `ToursSettingsPage` (criado na Task 11)

> The barrel will reference `TourHelpButton` and `ToursSettingsPage` created in later tasks. To keep this task self-contained and the build green, export only what exists now; later tasks add their exports. (See each task's barrel step.)

- [ ] **Step 1: Create `WelcomeCard`**

```tsx
// src/features/tour/components/WelcomeCard.tsx
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import type { TourDef } from "../types";
import { TOUR_STRINGS as S } from "../i18n/pt-BR";

export function WelcomeCard({ def, onClose }: { def: TourDef; onClose: () => void }) {
  const step = def.steps[0];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(2,6,23,0.45)" }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={S.dialogLabel}
        className="w-full max-w-sm rounded-lg border border-border bg-popover p-5 text-popover-foreground shadow-lg duration-200 animate-in fade-in zoom-in-95 motion-reduce:animate-none"
      >
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon icon={step.icon} size={20} />
          </span>
          <h2 className="text-base font-medium text-foreground">{step.title}</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground" aria-live="polite">
          {step.body}
        </p>
        <div className="flex justify-end">
          <Button size="sm" onClick={onClose}>
            {S.gotIt}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `TourProvider`**

```tsx
// src/features/tour/components/TourProvider.tsx
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "@tanstack/react-router";
import { useAuth } from "@/features/auth/useAuth";
import { useTourStore } from "../store/useTourStore";
import { resolveTourForPath, shouldAutoStart } from "../engine/tourResolution";
import { TOURS } from "../config/tours";
import { getOptOut, isSeen } from "../storage/tourStorage";
import { useTargetRect } from "../hooks/useTargetRect";
import type { TourDef } from "../types";
import { Spotlight } from "./Spotlight";
import { TourStepCard } from "./TourStepCard";
import { WelcomeCard } from "./WelcomeCard";

export function TourProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const pathname = useLocation({ select: (l) => l.pathname });
  const activeTour = useTourStore((s) => s.activeTour);
  const stepIndex = useTourStore((s) => s.stepIndex);
  const start = useTourStore((s) => s.start);
  const next = useTourStore((s) => s.next);
  const prev = useTourStore((s) => s.prev);
  const close = useTourStore((s) => s.close);
  const userId = currentUser?.id ?? null;
  const lastPathRef = useRef<string | null>(null);

  // Close an active tour when the route changes (marks it seen).
  useEffect(() => {
    if (lastPathRef.current !== null && lastPathRef.current !== pathname) {
      if (useTourStore.getState().activeTour) close();
    }
    lastPathRef.current = pathname;
  }, [pathname, close]);

  // Auto-start the registered tour on first visit.
  useEffect(() => {
    if (!userId) return;
    const def = resolveTourForPath(pathname, TOURS);
    if (!def) return;
    if (shouldAutoStart({ optOut: getOptOut(userId), seen: isSeen(userId, def.key) })) {
      start(def, userId);
    }
  }, [pathname, userId, start]);

  // Keyboard controls.
  useEffect(() => {
    if (!activeTour) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTour, next, prev, close]);

  return (
    <>
      {children}
      {activeTour &&
        createPortal(
          <TourLayer def={activeTour} stepIndex={stepIndex} onNext={next} onPrev={prev} onClose={close} />,
          document.body,
        )}
    </>
  );
}

interface TourLayerProps {
  def: TourDef;
  stepIndex: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

function TourLayer({ def, stepIndex, onNext, onPrev, onClose }: TourLayerProps) {
  // useTargetRect must run unconditionally (hooks rule); it returns null for
  // welcome tours / centered steps.
  const step = def.steps[stepIndex];
  const rect = useTargetRect(def.kind === "rich" ? step.target : undefined, def.kind === "rich");

  if (def.kind === "welcome") {
    return <WelcomeCard def={def} onClose={onClose} />;
  }
  return (
    <>
      <Spotlight rect={rect} />
      <TourStepCard def={def} stepIndex={stepIndex} rect={rect} onNext={onNext} onPrev={onPrev} onClose={onClose} />
    </>
  );
}
```

- [ ] **Step 3: Create the barrel**

```ts
// src/features/tour/index.ts
//
// Public surface of the guided tour feature. Mount <TourProvider> once in the
// app shell; drop <TourHelpButton/> in the TopBar; route to <ToursSettingsPage>.
export { TourProvider } from "./components/TourProvider";
```

- [ ] **Step 4: Verify build**

Run: `bun run build`
Expected: build completes without errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/tour/components/WelcomeCard.tsx src/features/tour/components/TourProvider.tsx src/features/tour/index.ts
git commit -m "$(cat <<'EOF'
feat(tour): add welcome card and tour provider orchestrator

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Âncoras `data-tour` no Atendimento

**Files:**
- Modify: `src/features/conversations/components/InboxHeader.tsx` (tag raiz ~linha 30)
- Modify: `src/features/conversations/components/InboxFilters.tsx` (`<Collapsible>` ~linha 132)
- Modify: `src/features/conversations/pages/InboxPage.tsx` (container da lista ~linha 322)
- Modify: `src/features/conversations/components/ConversationHeader.tsx` (`<header>` ~linha 112)
- Modify: `src/features/conversations/components/MessageList.tsx` (`<div>` ~linha 203)
- Modify: `src/features/conversations/components/MessageInput.tsx` (`<footer>` ~linha 569)

**Interfaces:**
- Consumes: nada (atributos HTML aditivos).
- Produces: os data-attributes que o `useTargetRect` consulta — `inbox-header`, `inbox-filters`, `inbox-list`, `conversation-header`, `message-list`, `composer`.

> Atributos `data-*` são aditivos e não mudam comportamento. Use o Edit tool casando o trecho exato da tag de abertura atual. Os números de linha são aproximados — case pelo conteúdo da tag, não pela linha.

- [ ] **Step 1: InboxHeader — add `data-tour="inbox-header"`**

Localize a tag raiz (atualmente `<div className="flex flex-col gap-1 border-b border-border px-3 py-2">`) e adicione o atributo:

```tsx
<div data-tour="inbox-header" className="flex flex-col gap-1 border-b border-border px-3 py-2">
```

- [ ] **Step 2: InboxFilters — add `data-tour="inbox-filters"`**

Na tag raiz `<Collapsible open={!collapsed} onOpenChange={(open) => setCollapsed(!open)}>`, adicione (Radix Collapsible repassa props ao elemento raiz):

```tsx
<Collapsible data-tour="inbox-filters" open={!collapsed} onOpenChange={(open) => setCollapsed(!open)}>
```

- [ ] **Step 3: InboxPage — add `data-tour="inbox-list"`**

No container da lista (`<div ref={listContainerRef} className="min-h-0 flex-1 overflow-y-auto" role="listbox" ...>`), adicione:

```tsx
<div data-tour="inbox-list" ref={listContainerRef} className="min-h-0 flex-1 overflow-y-auto" role="listbox" aria-label={INBOX_STRINGS.ariaList} tabIndex={-1}>
```

- [ ] **Step 4: ConversationHeader — add `data-tour="conversation-header"`**

Na tag `<header className="shrink-0 border-b border-border bg-card">`:

```tsx
<header data-tour="conversation-header" className="shrink-0 border-b border-border bg-card">
```

- [ ] **Step 5: MessageList — add `data-tour="message-list"`**

Na tag raiz `<div className="flex h-full flex-col">`:

```tsx
<div data-tour="message-list" className="flex h-full flex-col">
```

- [ ] **Step 6: MessageInput — add `data-tour="composer"`**

Na tag raiz `<footer className="border-t border-border bg-card">`:

```tsx
<footer data-tour="composer" className="border-t border-border bg-card">
```

- [ ] **Step 7: Verify build**

Run: `bun run build`
Expected: build completes without errors.

- [ ] **Step 8: Commit**

```bash
git add src/features/conversations/components/InboxHeader.tsx src/features/conversations/components/InboxFilters.tsx src/features/conversations/pages/InboxPage.tsx src/features/conversations/components/ConversationHeader.tsx src/features/conversations/components/MessageList.tsx src/features/conversations/components/MessageInput.tsx
git commit -m "$(cat <<'EOF'
feat(tour): add data-tour anchors to Atendimento screens

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Botão "?" no TopBar (`TourHelpButton`)

**Files:**
- Create: `src/features/tour/components/TourHelpButton.tsx`
- Modify: `src/features/tour/index.ts` (export)
- Modify: `src/features/shell/components/TopBar.tsx` (inserir antes de `<ThemeSwitcher />`)

**Interfaces:**
- Consumes: `useAuth`; `useLocation`; `useTourStore.start`; `resolveTourForPath`; `TOURS`; `Icon`; `Button`; `TOUR_STRINGS`.
- Produces: `TourHelpButton()` — render nulo quando a rota atual não tem tour.

> DOM/UI — sem teste unitário; verificado por build + smoke manual.

- [ ] **Step 1: Create `TourHelpButton`**

```tsx
// src/features/tour/components/TourHelpButton.tsx
import { useLocation } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/useAuth";
import { useTourStore } from "../store/useTourStore";
import { resolveTourForPath } from "../engine/tourResolution";
import { TOURS } from "../config/tours";
import { TOUR_STRINGS as S } from "../i18n/pt-BR";

// Context-aware help button for the TopBar: reopens the current screen's tour.
// Renders nothing when the current route has no registered tour.
export function TourHelpButton() {
  const { currentUser } = useAuth();
  const pathname = useLocation({ select: (l) => l.pathname });
  const start = useTourStore((s) => s.start);
  const def = resolveTourForPath(pathname, TOURS);
  if (!def || !currentUser) return null;
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={S.helpButtonLabel}
      title={S.helpButtonLabel}
      onClick={() => start(def, currentUser.id)}
    >
      <Icon icon="mdi:help-circle-outline" size={20} />
    </Button>
  );
}
```

- [ ] **Step 2: Export it from the barrel**

Edit `src/features/tour/index.ts` — add the line:

```ts
export { TourHelpButton } from "./components/TourHelpButton";
```

- [ ] **Step 3: Insert into TopBar**

In `src/features/shell/components/TopBar.tsx`, add the import near the other feature imports:

```ts
import { TourHelpButton } from "@/features/tour";
```

Then render it immediately before `<ThemeSwitcher />` in the right-side button cluster:

```tsx
<TourHelpButton />
<ThemeSwitcher />
```

- [ ] **Step 4: Verify build**

Run: `bun run build`
Expected: build completes without errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/tour/components/TourHelpButton.tsx src/features/tour/index.ts src/features/shell/components/TopBar.tsx
git commit -m "$(cat <<'EOF'
feat(tour): add context-aware help button to the top bar

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Central de tours em Configurações (`ToursSettingsPage` + rota + nav)

**Files:**
- Create: `src/features/tour/pages/ToursSettingsPage.tsx`
- Modify: `src/features/tour/index.ts` (export)
- Create: `src/routes/app.configuracoes.tours.tsx`
- Modify: `src/features/shell/config/routes.ts` (+ `CONFIG_TOURS`)
- Modify: `src/features/shell/config/navigation.ts` (+ item no grupo Configurações)

**Interfaces:**
- Consumes: `useAuth`; `useTourStore.start`; `getSeen`/`getOptOut`/`setOptOut`/`resetAll` from `../storage/tourStorage`; `TOURS` from `../config/tours`; `TOUR_STRINGS`; `Icon`; `Button`; `SettingsLayout` from `@/features/shell/layouts`; `ROUTES` from `@/features/shell/config/routes`.
- Produces: `ToursSettingsPage()`; rota `/app/configuracoes/tours`; `ROUTES.CONFIG_TOURS`; item de nav "Tours & Ajuda".

> DOM/UI — sem teste unitário; verificado por build + smoke manual.

- [ ] **Step 1: Add the route constant**

In `src/features/shell/config/routes.ts`, in the Configurações section, add:

```ts
CONFIG_TOURS: "/app/configuracoes/tours",
```

- [ ] **Step 2: Create `ToursSettingsPage`**

```tsx
// src/features/tour/pages/ToursSettingsPage.tsx
import { useReducer, useState } from "react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { SettingsLayout } from "@/features/shell/layouts";
import { useAuth } from "@/features/auth/useAuth";
import { useTourStore } from "../store/useTourStore";
import { TOURS } from "../config/tours";
import { getOptOut, getSeen, resetAll, setOptOut } from "../storage/tourStorage";
import { TOUR_STRINGS as S } from "../i18n/pt-BR";

export function ToursSettingsPage() {
  const { currentUser } = useAuth();
  const userId = currentUser?.id ?? "";
  const start = useTourStore((s) => s.start);
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [optOut, setOptOutState] = useState(() => getOptOut(userId));

  const seen = getSeen(userId);

  const replay = (key: string) => {
    const def = TOURS.find((t) => t.key === key);
    if (def && currentUser) start(def, currentUser.id);
  };
  const onReset = () => {
    resetAll(userId);
    force();
  };
  const toggleOptOut = () => {
    const next = !optOut;
    setOptOut(userId, next);
    setOptOutState(next);
  };

  return (
    <SettingsLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{S.settings.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{S.settings.subtitle}</p>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
          <div>
            <p className="text-sm font-semibold">{S.settings.optOutLabel}</p>
            <p className="text-xs text-muted-foreground">
              {optOut ? S.settings.optOutOff : S.settings.optOutOn}
            </p>
          </div>
          <Button variant={optOut ? "default" : "outline"} size="sm" onClick={toggleOptOut}>
            {optOut ? S.settings.enable : S.settings.disable}
          </Button>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
          <div>
            <p className="text-sm font-semibold">{S.settings.resetTitle}</p>
            <p className="text-xs text-muted-foreground">{S.settings.resetHint}</p>
          </div>
          <Button variant="outline" size="sm" onClick={onReset}>
            {S.settings.reset}
          </Button>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold text-foreground">{S.settings.listTitle}</h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {TOURS.map((t) => (
              <li key={t.key} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Icon icon={t.steps[0]?.icon ?? "mdi:compass"} size={18} className="shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm">{t.label}</span>
                  <span
                    className={
                      seen.has(t.key)
                        ? "shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                        : "shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                    }
                  >
                    {seen.has(t.key) ? S.settings.seen : S.settings.notSeen}
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => replay(t.key)}>
                  {S.settings.replay}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SettingsLayout>
  );
}
```

- [ ] **Step 3: Export it from the barrel**

Edit `src/features/tour/index.ts` — add:

```ts
export { ToursSettingsPage } from "./pages/ToursSettingsPage";
```

- [ ] **Step 4: Create the route file**

```tsx
// src/routes/app.configuracoes.tours.tsx
import { createFileRoute } from "@tanstack/react-router";
import { ToursSettingsPage } from "@/features/tour";

export const Route = createFileRoute("/app/configuracoes/tours")({
  component: ToursSettingsPage,
});
```

- [ ] **Step 5: Add the nav item**

In `src/features/shell/config/navigation.ts`, inside the "Configurações" group's `items` array, add (uses the role allowlist so every logged-in app role sees it):

```ts
{
  label: "Tours & Ajuda",
  icon: "mdi:help-circle-outline",
  to: ROUTES.CONFIG_TOURS,
  roles: ["Owner", "Gestor", "Vendedor", "VendedorExterno", "SDR", "Financeiro"],
},
```

- [ ] **Step 6: Verify build (also regenerates the route tree)**

Run: `bun run build`
Expected: build completes; the new route `/app/configuracoes/tours` is included. Do NOT `git add src/routeTree.gen.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/features/tour/pages/ToursSettingsPage.tsx src/features/tour/index.ts src/routes/app.configuracoes.tours.tsx src/features/shell/config/routes.ts src/features/shell/config/navigation.ts
git commit -m "$(cat <<'EOF'
feat(tour): add tours settings hub, route and nav entry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Montar o `TourProvider` no shell

**Files:**
- Modify: `src/features/shell/layouts/AppLayout.tsx`

**Interfaces:**
- Consumes: `TourProvider` from `@/features/tour`.
- Produces: tour ativo em todas as rotas logadas (`app.*`).

> Esta é a task que "liga" tudo: depois dela os tours disparam de verdade. Verificada por build + smoke manual completo.

- [ ] **Step 1: Import the provider**

In `src/features/shell/layouts/AppLayout.tsx`, add near the other imports:

```ts
import { TourProvider } from "@/features/tour";
```

- [ ] **Step 2: Wrap the layout**

Wrap the existing tree with `<TourProvider>` immediately inside `<TooltipProvider>`:

```tsx
return (
  <TooltipProvider delayDuration={200}>
    <TourProvider>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        {/* ...existing content unchanged... */}
      </div>
    </TourProvider>
  </TooltipProvider>
);
```

- [ ] **Step 3: Verify build**

Run: `bun run build`
Expected: build completes without errors.

- [ ] **Step 4: Manual smoke (dono testa; o dev server já roda em http://localhost:5174)**

Roteiro de verificação manual:
1. Limpar estado: no DevTools → Application → Local Storage, remover chaves `gallo-tour-*` (ou usar "Resetar todos os tours" depois).
2. Entrar em **Atendimento** pela primeira vez → holofote dispara (boas-vindas → topo → filtros → lista). Testar `Próximo`, `Voltar`, `Pular`, `Esc`, setas do teclado.
3. Abrir uma **conversa** → tour da conversa dispara (cabeçalho → mensagens → composer → conclusão).
4. Visitar **Clientes**, **Leads**, **Pedidos** etc. → card de boas-vindas centralizado, uma vez cada.
5. Revisitar uma tela já vista → não dispara sozinho; clicar no **?** no TopBar reabre o tour da tela.
6. Em **Configurações → Tours & Ajuda**: ver lista com badges Visto/Novo, "Rever", "Resetar todos os tours" e ligar/desligar tours automáticos.
7. Alternar tema (parts/service/industrial/diesel) e light/dark → o anel/realce e o balão acompanham os tokens.

- [ ] **Step 5: Commit**

```bash
git add src/features/shell/layouts/AppLayout.tsx
git commit -m "$(cat <<'EOF'
feat(tour): mount TourProvider in the app shell

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Documentação + verificação final

**Files:**
- Create: `docs/dev/guided-tour.md`

**Interfaces:**
- Consumes: tudo.
- Produces: documentação de dev da feature.

- [ ] **Step 1: Write the doc**

```markdown
# Tour guiado (Compass)

Onboarding client-side que dispara na primeira visita de cada tela. Tour rico
(holofote) no Atendimento; card de boas-vindas nas demais. Sem dependência nova.

## Como funciona
- `TourProvider` (montado no `AppLayout`) resolve a rota atual em um tour via
  `resolveTourForPath(pathname, TOURS)` e auto-inicia se `shouldAutoStart`
  (não visto e sem opt-out).
- Persistência por usuário em `localStorage`, isolada em
  `src/features/tour/storage/tourStorage.ts` (chaves `gallo-tour-seen:<userId>`
  e `gallo-tour-optout:<userId>`).
- Estado de runtime (tour ativo / passo) no Zustand `useTourStore`.

## Adicionar/editar um tour
- Edite `src/features/tour/config/tours.ts`.
- Welcome card: use `welcome(key, label, route, icon, body)`.
- Tour rico: defina passos com `target` (id `data-tour`) e `placement`.
- Para um passo apontar um elemento, adicione `data-tour="<id>"` no componente
  alvo (ver os exemplos no Atendimento).

## Controles
- Pular: botão + `Esc`. Setas/Enter navegam.
- "?" no TopBar (`TourHelpButton`) reabre o tour da tela atual.
- Central em `Configurações → Tours & Ajuda`: rever, resetar tudo, opt-out global.

## Limitações conhecidas
- Persistência é local (não sincroniza entre dispositivos). Promover a Supabase
  = reimplementar apenas `tourStorage.ts` (ver o spec, §15).
- Holofote é desktop-first; passos sem alvo caem para card centralizado.
- Navegar para outra rota durante um tour o marca como visto.

## Testes
`bun run test` cobre os engines puros (`tourNavigation`, `tourResolution`,
`popoverPlacement`), o `tourStorage` e o `useTourStore`. Componentes de UI são
verificados por `bun run build` + smoke manual (Vitest roda em env `node`).
```

- [ ] **Step 2: Run the full test suite**

Run: `bun run test`
Expected: PASS — all tour test files green, no regressions in the existing suite.

- [ ] **Step 3: Run the build gate**

Run: `bun run build`
Expected: build completes without errors.

- [ ] **Step 4: Commit**

```bash
git add docs/dev/guided-tour.md
git commit -m "$(cat <<'EOF'
docs(tour): add guided tour developer guide

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review (preenchido)

**1. Spec coverage:**
- §2 decisões (caseiro/localStorage/controles/visual) → Tasks 1–13. ✓
- §4 arquitetura/pastas → File Structure + todas as tasks. ✓
- §5 modelo de dados/persistência → Task 1 (storage) + Task 3 (types). ✓
- §6 disparo first-visit (espera de alvo, timeout, anti-duplo) → Task 7 (useTargetRect) + Task 8 (TourProvider). ✓
- §7.1/§7.2 tours do Atendimento → Task 5 (conteúdo) + Task 9 (âncoras). ✓
- §7.3 welcome em todos os itens → Task 5 (33 welcome). ✓
- §8 controles (pular/?/central/opt-out) → Task 7/8 (pular+teclado), Task 10 (?), Task 11 (central+opt-out). ✓
- §9 visual/a11y/movimento → Tasks 7/8 (tokens, ring, motion-reduce, role=dialog, aria-live, foco). ✓
- §10 âncoras data-tour → Task 9. ✓
- §11 z-index/portal → Tasks 7/8 (createPortal, z-50/z-[51]). ✓
- §12 riscos → tratados em useTargetRect (timeout/null), tourStorage (parse defensivo), resolução (RBAC via nav), TourProvider (anti-duplo via lastPathRef + isSeen). ✓
- §13 testes → Tasks 1–6 com Vitest. ✓
- §14 escopo 1º release → coberto. ✓
- §15 migração Supabase → documentada (Task 13) + isolada em tourStorage. ✓

**2. Placeholder scan:** sem TBD/TODO; todo passo de código tem o código completo. ✓

**3. Type consistency:** `TourDef`/`TourStep`/`TourSide` definidos na Task 3 e usados consistentemente; `start(def,userId)`/`next`/`prev`/`close` idênticos entre store (Task 6) e consumidores (Tasks 8/10/11); `useTargetRect(targetId, active)` idêntico entre Task 7 e Task 8; `computePlacement(target, card, viewport, preferred?, gap?)` idêntico entre Task 4 e Task 7. ✓

> Desvio documentado vs spec: passos do Atendimento ajustados às âncoras reais (inbox-header em vez de inbox-new; menu da conversa dobrado no cabeçalho). Sem impacto nos requisitos.
