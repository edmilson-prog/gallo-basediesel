# PRD-213 — Rodízio / Fila de Atendimento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar uma fila de atendimento (rodízio) por loja — participantes ordenáveis (drag-and-drop), liga/desliga por usuário, pulo de offline/fora-de-horário — que substitui o revezamento do PRD-013 num ponto de consulta único em `conversations.create()`, sem tocar o webhook real.

**Architecture:** Lógica de seleção **pura** (engines testáveis, sem `Math.random()`), I/O nos **providers** (mock + Supabase drop-in), UI via **hooks**. A fila integra com o motor de distribuição (PRD-013) por contrato de fronteira: carteira/especialidade a montante (precedência), a fila como fonte do revezamento, fallback do 013 a jusante. Uma atribuição por conversa.

**Tech Stack:** React 19 + Vite, TanStack Router/Query, Zustand (mock store), Tailwind v4 + shadcn/ui, `@dnd-kit`, Vitest, Supabase (`public`, RLS).

**Spec:** `docs/superpowers/specs/2026-06-16-prd-213-rodizio-fila-atendimento-design.md`

## Global Constraints

- **Branch:** todo o trabalho em `feat/prd-213-rodizio` (parte da `main` atualizada). Nunca commitar em `main` direto.
- **Nunca** `git add -A` / `git add .` — adicionar arquivos por nome. **Nunca** commitar `vite.config.ts` nem `src/routeTree.gen.ts` (gerado; descartar se sujar: `git checkout -- src/routeTree.gen.ts`).
- **`.env.local` aponta para o Supabase de PRODUÇÃO** (ref `njizaasajkdqptlxddqn`). Qualquer migration/SQL atinge produção e exige **autorização nominal explícita do dono** por operação. A migration deste plano é **versionada em arquivo**; aplicar em prod é um passo manual destacado (Task 8), só sob OK do dono.
- **Provider Pattern:** features acessam dados só via `@/providers/data` (hooks). ESLint proíbe importar `@/mocks`, `@/providers/data/factory`, `@/providers/data/impl/*` fora das camadas.
- **Convenções:** camelCase (vars/fns), PascalCase (componentes/tipos), kebab-case (arquivos), snake_case plural (tabelas), `I` em interfaces de domínio. Comentários em inglês; UI em pt-BR com acentos corretos.
- **TypeScript `strict` + `noUncheckedIndexedAccess`:** indexar array/`Record` rende `T | undefined`. Guardar com `const x = arr[i]; if (!x) ...` antes de usar. Evitar `any`.
- **Gate de CI prático:** `bun run build` + `bun run test`. `tsc --noEmit` tem ~315 erros de baseline pré-existentes — avaliar **só o delta** do código novo. Se `bun run build` falhar com "Bun failed to remap this bin", usar `node scripts/copy-changelog.mjs && node node_modules/vite/bin/vite.js build`.
- **Timezone:** Brasil sem DST desde 2019 → São Paulo é offset fixo −03:00. Reutilizar `isWithinWorkSchedule` do PRD-212 (não reimplementar timezone).
- **UX (telas novas):** seguir `docs/dev/ux-guidelines.md` (header glass, tokens semânticos, `max-w-[1600px]` nas Configurações). Sem emoji como ícone — usar Iconify (`@/components/Icon`). `cursor-pointer` em clicáveis; `aria-label` em ícones-botão.
- **Commits:** Conventional Commits em inglês, atômicos, terminando com:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **Não tocar o webhook real** (`src/providers/whatsapp/webhook/core.ts`). A fila só atua em `conversations.create()`.

---

## File Structure

**Tipos (`src/shared/types/`)**
- `rotation.ts` (criar) — `RotationTargetMode`, `IRotationQueue`, `IRotationParticipant`, `RotationSkipReason`, `IRotationCandidate`, `IRotationSelectionInput`, `IRotationSelectionResult`, `IRotationQueueState`.
- `index.ts` (modificar) — exportar os tipos novos.

**Feature (`src/features/rotation/`)**
- `engine/eligibility.ts` (+ `.test.ts`) — `isSellerEligible`.
- `engine/selectNextFromRotation.ts` (+ `.test.ts`) — seleção pura (direct + department).
- `engine/applyRotationOverride.ts` (+ `.test.ts`) — decide se a fila sobrescreve a decisão do 013.
- `components/RotationTab.tsx` — aba controlada na ficha do usuário.
- `components/RotationQueueManager.tsx` — tela: modo + lista DnD + toggle + dois níveis.
- `components/SortableParticipantRow.tsx` — linha arrastável (@dnd-kit/sortable).
- `components/RotationLiveView.tsx` — "quem é o próximo" + estados/pulados.
- `hooks/useRotationQueueState.ts` — lê o estado da fila via provider (query).
- `hooks/useRotationLivePreview.ts` — roda o engine em runtime para a visão ao vivo.
- `pages/RotationQueuePage.tsx` — container da rota.
- `index.ts` — barrel.

**Providers (`src/providers/data/`)**
- `contracts/rotationQueues.ts`, `contracts/rotationParticipants.ts` (criar) + `contracts/index.ts` (modificar).
- `impl/mock/rotationQueues.ts`, `impl/mock/rotationParticipants.ts` (criar).
- `impl/supabase/rotationQueues.ts`, `impl/supabase/rotationParticipants.ts` (criar).
- `impl/supabase/sellers.ts` (modificar — mapear `rotation`).
- `hooks/useRotationQueuesProvider.ts`, `hooks/useRotationParticipantsProvider.ts` (criar).
- `factory.ts` (modificar — registrar nos dois bundles).

**Mock (`src/mocks/`)**
- `api/rotationQueues.ts`, `api/rotationParticipants.ts` (criar).
- `data/seedRotation.ts` (criar) — fila + participantes seed.
- `generators/bootstrap.ts` (modificar — incluir as 2 coleções).
- `store/selectors.ts` (modificar — selectors).
- `index.ts` (modificar — exportar as APIs).
- `api/conversations.ts` (modificar — integração).

**Supabase**
- `supabase/migrations/20260616XXXXXX_rotation_queues.sql` (criar; aplicar em prod só sob OK).

**Distribuição (`src/providers/data/impl/supabase/conversations.ts`, `src/mocks/api/conversations.ts`)** — integração.

**Rota / UI shell**
- `src/routes/app.configuracoes.rodizio.tsx` (criar).
- `src/features/admin-settings/components/SellerFormDialog.tsx` (modificar — destravar aba).
- Tela de Distribuição (link cruzado) — `src/features/distribution/pages/DistributionRulesPanel.tsx` (modificar).

**Docs/Release**
- `docs/dev/rotation-queue.md` (criar). `CHANGELOG.md`, `CLAUDE.md`, `package.json`, PRD `_DONE`.

---

## Task 1: Modelo de domínio (tipos)

**Files:**
- Create: `src/shared/types/rotation.ts`
- Modify: `src/shared/types/index.ts`

**Interfaces:**
- Produces: `RotationTargetMode`, `IRotationQueue`, `IRotationParticipant`, `RotationSkipReason`, `IRotationCandidate`, `IRotationSelectionInput`, `IRotationSelectionResult`, `IRotationQueueState` — consumidos por todas as tasks seguintes.

- [ ] **Step 1: Criar `src/shared/types/rotation.ts`**

```ts
import type { ID, ISO8601 } from "./common";
import type { ISeller } from "./people";

/** Direcionamento da fila por loja (PRD-213). */
export type RotationTargetMode = "direct" | "department";

/**
 * Fila de atendimento — uma por loja (1:1 com IStore). A própria fila é a
 * config por loja (o targetMode NÃO é duplicado em IPlatformSettings).
 */
export interface IRotationQueue {
  id: ID;
  storeId: ID;
  targetMode: RotationTargetMode;
  /** Ponteiro do topo (justiça temporal). null = começar do início. */
  lastAssignedRefId?: ID | null;
  /** Sempre true (decisão 8-A); exposto para flexibilização futura. */
  skipOffline: boolean;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

/**
 * Participante de uma fila. Dois escopos:
 *  - TOPO: scopeDepartmentId null (refType 'seller' no modo direct,
 *    'department' no modo department).
 *  - INTERNO: scopeDepartmentId preenchido → membro do rodízio interno daquele
 *    departamento (refType 'seller').
 */
export interface IRotationParticipant {
  id: ID;
  queueId: ID;
  scopeDepartmentId?: ID | null;
  refType: "seller" | "department";
  refId: ID;
  order: number;
  enabled: boolean;
  /** Ponteiro INTERNO do departamento (só quando refType='department'). */
  lastAssignedMemberId?: ID | null;
}

/** Motivo pelo qual um participante foi pulado na seleção (RF-023). */
export type RotationSkipReason =
  | "skipped_disabled"
  | "skipped_offline"
  | "skipped_inactive"
  | "skipped_off_hours";

/** Um participante avaliado na seleção (trace + visão ao vivo). */
export interface IRotationCandidate {
  refId: ID;
  refType: "seller" | "department";
  reason: RotationSkipReason | "selected";
  selected: boolean;
}

/** Entrada da seleção pura. */
export interface IRotationSelectionInput {
  queue: IRotationQueue;
  /** Participantes do topo (scopeDepartmentId null). */
  participants: IRotationParticipant[];
  /** Rodízio interno por departamento (chave = departmentId). */
  membersByDepartment: Record<ID, IRotationParticipant[]>;
  /** Sellers indexados por id (availability, workSchedule, active, role). */
  sellersById: Record<ID, ISeller>;
  now: Date;
}

/** Resultado da seleção pura. */
export interface IRotationSelectionResult {
  /** null = ninguém elegível → fluxo segue o fallback do PRD-013. */
  selectedSellerId: ID | null;
  /** Departamento vencedor (só no modo department). */
  selectedDepartmentId: ID | null;
  candidates: IRotationCandidate[];
  /** Novo last_assigned_ref_id (null = inalterado). */
  nextTopPointer: ID | null;
  /** Novos last_assigned_member_id por departamento (modo department). */
  nextMemberPointerByDept: Record<ID, ID>;
}

/** Estado agregado da fila (usado pela UI e pela integração). */
export interface IRotationQueueState {
  queue: IRotationQueue;
  topParticipants: IRotationParticipant[];
  membersByDepartment: Record<ID, IRotationParticipant[]>;
}
```

- [ ] **Step 2: Exportar no barrel `src/shared/types/index.ts`**

Adicionar, logo após o bloco `// People & permissions` (após a linha que fecha `} from "./people";`):

```ts
// Rotation queue (PRD-213)
export type {
  RotationTargetMode,
  IRotationQueue,
  IRotationParticipant,
  RotationSkipReason,
  IRotationCandidate,
  IRotationSelectionInput,
  IRotationSelectionResult,
  IRotationQueueState,
} from "./rotation";
```

- [ ] **Step 3: Verificar tipos**

Run: `bunx tsc --noEmit 2>&1 | grep -i rotation` → Expected: nenhuma linha (sem erro novo em `rotation.ts`).
Run: `node node_modules/vite/bin/vite.js build` → Expected: build conclui.

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/rotation.ts src/shared/types/index.ts
git commit -m "feat(rotation): domain model for attendance queue (PRD-213)"
```

---

## Task 2: Engine de elegibilidade (TDD)

**Files:**
- Create: `src/features/rotation/engine/eligibility.ts`
- Test: `src/features/rotation/engine/eligibility.test.ts`

**Interfaces:**
- Consumes: `ISeller`, `RotationSkipReason` (Task 1); `isWithinWorkSchedule` de `@/features/access`.
- Produces: `isSellerEligible(seller, participant, now)` — consumido pela Task 3.

- [ ] **Step 1: Escrever o teste que falha — `eligibility.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import type { ISeller } from "@/shared/types";
import { isSellerEligible } from "./eligibility";

function makeSeller(over: Partial<ISeller> = {}): ISeller {
  return {
    id: "seller-1",
    storeId: "store-matriz",
    fullName: "Carlos",
    email: "c@x.com",
    type: "internal",
    availability: "online",
    divisions: ["parts"],
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

// Tuesday 09:00 SP (12:00Z). Weekday schedule 08:00–18:00.
const tuesday0900 = new Date("2026-06-16T12:00:00Z");
const WEEKDAY_8_18 = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday: weekday as 1 | 2 | 3 | 4 | 5,
  openAt: "08:00",
  closeAt: "18:00",
  enabled: true,
}));

describe("isSellerEligible", () => {
  it("selects an online, active, in-hours seller with enabled participation", () => {
    const r = isSellerEligible(makeSeller(), { enabled: true }, tuesday0900);
    expect(r.eligible).toBe(true);
    expect(r.reason).toBe("selected");
  });

  it("skips when participation is disabled", () => {
    const r = isSellerEligible(makeSeller(), { enabled: false }, tuesday0900);
    expect(r).toEqual({ eligible: false, reason: "skipped_disabled" });
  });

  it("skips an inactive seller", () => {
    const r = isSellerEligible(makeSeller({ active: false }), { enabled: true }, tuesday0900);
    expect(r).toEqual({ eligible: false, reason: "skipped_inactive" });
  });

  it("skips an offline seller", () => {
    const r = isSellerEligible(makeSeller({ availability: "offline" }), { enabled: true }, tuesday0900);
    expect(r).toEqual({ eligible: false, reason: "skipped_offline" });
  });

  it("skips a seller outside the work schedule", () => {
    const night = new Date("2026-06-16T23:30:00Z"); // 20:30 SP
    const r = isSellerEligible(makeSeller({ workSchedule: WEEKDAY_8_18 }), { enabled: true }, night);
    expect(r).toEqual({ eligible: false, reason: "skipped_off_hours" });
  });

  it("treats a seller with no schedule as always in-hours", () => {
    const night = new Date("2026-06-16T23:30:00Z");
    const r = isSellerEligible(makeSeller(), { enabled: true }, night);
    expect(r.eligible).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test src/features/rotation/engine/eligibility.test.ts` → Expected: FAIL ("isSellerEligible is not a function" / módulo inexistente).

- [ ] **Step 3: Implementar `eligibility.ts`**

```ts
import type { ISeller, RotationSkipReason } from "@/shared/types";
import { isWithinWorkSchedule } from "@/features/access";

export interface IEligibilityResult {
  eligible: boolean;
  reason: RotationSkipReason | "selected";
}

/**
 * Whether a seller can receive a conversation from the rotation NOW. Order of
 * checks (cheapest/most decisive first): participation toggle → active → online
 * → within work schedule (PRD-212). A seller with no schedule is unrestricted.
 */
export function isSellerEligible(
  seller: ISeller,
  participant: { enabled: boolean },
  now: Date,
): IEligibilityResult {
  if (!participant.enabled) return { eligible: false, reason: "skipped_disabled" };
  if (!seller.active) return { eligible: false, reason: "skipped_inactive" };
  if (seller.availability !== "online") return { eligible: false, reason: "skipped_offline" };
  if (
    !isWithinWorkSchedule(
      { workSchedule: seller.workSchedule, scheduleOverrides: seller.scheduleOverrides },
      now,
    )
  ) {
    return { eligible: false, reason: "skipped_off_hours" };
  }
  return { eligible: true, reason: "selected" };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun run test src/features/rotation/engine/eligibility.test.ts` → Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add src/features/rotation/engine/eligibility.ts src/features/rotation/engine/eligibility.test.ts
git commit -m "feat(rotation): pure seller eligibility engine (reuses PRD-212 schedule)"
```

---

## Task 3: Engine de seleção (TDD)

**Files:**
- Create: `src/features/rotation/engine/selectNextFromRotation.ts`
- Test: `src/features/rotation/engine/selectNextFromRotation.test.ts`

**Interfaces:**
- Consumes: `isSellerEligible` (Task 2); `IRotationSelectionInput`/`IRotationSelectionResult`/`IRotationParticipant` (Task 1).
- Produces: `selectNextFromRotation(input): IRotationSelectionResult` — consumido pela Task 4 (override) e pelos hooks (Task 11/13).

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import type { ID, IRotationParticipant, IRotationQueue, ISeller } from "@/shared/types";
import { selectNextFromRotation } from "./selectNextFromRotation";

const now = new Date("2026-06-16T12:00:00Z"); // Tue 09:00 SP — unrestricted (no schedule)

function seller(id: string, over: Partial<ISeller> = {}): ISeller {
  return {
    id, storeId: "store-matriz", fullName: id, email: `${id}@x.com`, type: "internal",
    availability: "online", divisions: ["parts"], active: true,
    createdAt: "2026-01-01T00:00:00.000Z", ...over,
  };
}
function part(refId: string, order: number, over: Partial<IRotationParticipant> = {}): IRotationParticipant {
  return { id: `p-${refId}`, queueId: "q1", scopeDepartmentId: null, refType: "seller", refId, order, enabled: true, ...over };
}
function queue(over: Partial<IRotationQueue> = {}): IRotationQueue {
  return { id: "q1", storeId: "store-matriz", targetMode: "direct", lastAssignedRefId: null, skipOffline: true, createdAt: "x", updatedAt: "x", ...over };
}
function byId(...s: ISeller[]): Record<ID, ISeller> {
  return Object.fromEntries(s.map((x) => [x.id, x]));
}

describe("selectNextFromRotation — direct", () => {
  it("skips offline and advances the pointer (RF-008/009)", () => {
    // order [carlos, marina(offline), rafael], last = carlos → evaluate marina(skip), pick rafael
    const carlos = seller("carlos");
    const marina = seller("marina", { availability: "offline" });
    const rafael = seller("rafael");
    const r = selectNextFromRotation({
      queue: queue({ lastAssignedRefId: "carlos" }),
      participants: [part("carlos", 0), part("marina", 1), part("rafael", 2)],
      membersByDepartment: {},
      sellersById: byId(carlos, marina, rafael),
      now,
    });
    expect(r.selectedSellerId).toBe("rafael");
    expect(r.nextTopPointer).toBe("rafael");
    const marinaCand = r.candidates.find((c) => c.refId === "marina");
    expect(marinaCand?.reason).toBe("skipped_offline");
  });

  it("wraps around to the first when last is the tail", () => {
    const a = seller("a"); const b = seller("b");
    const r = selectNextFromRotation({
      queue: queue({ lastAssignedRefId: "b" }),
      participants: [part("a", 0), part("b", 1)],
      membersByDepartment: {}, sellersById: byId(a, b), now,
    });
    expect(r.selectedSellerId).toBe("a");
  });

  it("returns empty when nobody is eligible (RF-011)", () => {
    const a = seller("a", { availability: "offline" });
    const r = selectNextFromRotation({
      queue: queue(), participants: [part("a", 0)],
      membersByDepartment: {}, sellersById: byId(a), now,
    });
    expect(r.selectedSellerId).toBeNull();
    expect(r.nextTopPointer).toBeNull();
  });

  it("starts from the head when the pointer is stale/absent", () => {
    const a = seller("a"); const b = seller("b");
    const r = selectNextFromRotation({
      queue: queue({ lastAssignedRefId: "ghost" }),
      participants: [part("a", 0), part("b", 1)],
      membersByDepartment: {}, sellersById: byId(a, b), now,
    });
    expect(r.selectedSellerId).toBe("a");
  });
});

describe("selectNextFromRotation — department (two levels, RF-010)", () => {
  it("selects next eligible department and its next member; advances both pointers", () => {
    const c1 = seller("c1"); const c2 = seller("c2"); const l1 = seller("l1");
    const q = queue({ targetMode: "department", lastAssignedRefId: null });
    const top = [
      { id: "pd-pesados", queueId: "q1", scopeDepartmentId: null, refType: "department" as const, refId: "dep-pesados", order: 0, enabled: true, lastAssignedMemberId: "c1" },
      { id: "pd-leves", queueId: "q1", scopeDepartmentId: null, refType: "department" as const, refId: "dep-leves", order: 1, enabled: true },
    ];
    const r = selectNextFromRotation({
      queue: q,
      participants: top,
      membersByDepartment: {
        "dep-pesados": [part("c1", 0, { scopeDepartmentId: "dep-pesados" }), part("c2", 1, { scopeDepartmentId: "dep-pesados" })],
        "dep-leves": [part("l1", 0, { scopeDepartmentId: "dep-leves" })],
      },
      sellersById: byId(c1, c2, l1), now,
    });
    expect(r.selectedDepartmentId).toBe("dep-pesados"); // first in order, has eligible members
    expect(r.selectedSellerId).toBe("c2"); // internal pointer was c1 → next is c2
    expect(r.nextTopPointer).toBe("dep-pesados");
    expect(r.nextMemberPointerByDept["dep-pesados"]).toBe("c2");
  });

  it("skips a department with no eligible members", () => {
    const c1 = seller("c1", { availability: "offline" }); const l1 = seller("l1");
    const r = selectNextFromRotation({
      queue: queue({ targetMode: "department" }),
      participants: [
        { id: "pd-pesados", queueId: "q1", scopeDepartmentId: null, refType: "department", refId: "dep-pesados", order: 0, enabled: true },
        { id: "pd-leves", queueId: "q1", scopeDepartmentId: null, refType: "department", refId: "dep-leves", order: 1, enabled: true },
      ],
      membersByDepartment: {
        "dep-pesados": [part("c1", 0, { scopeDepartmentId: "dep-pesados" })],
        "dep-leves": [part("l1", 0, { scopeDepartmentId: "dep-leves" })],
      },
      sellersById: byId(c1, l1), now,
    });
    expect(r.selectedDepartmentId).toBe("dep-leves");
    expect(r.selectedSellerId).toBe("l1");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test src/features/rotation/engine/selectNextFromRotation.test.ts` → Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `selectNextFromRotation.ts`**

```ts
import type {
  ID,
  IRotationCandidate,
  IRotationParticipant,
  IRotationSelectionInput,
  IRotationSelectionResult,
  ISeller,
} from "@/shared/types";
import { isSellerEligible } from "./eligibility";

/** Orders participants by `order` then walks starting AFTER the pointer (wrap-around). */
function rotatedOrder<T extends { refId: ID; order: number }>(items: T[], pointer?: ID | null): T[] {
  const sorted = [...items].sort((a, b) => a.order - b.order);
  if (!pointer) return sorted;
  const idx = sorted.findIndex((p) => p.refId === pointer);
  if (idx === -1) return sorted; // stale pointer → from head
  return [...sorted.slice(idx + 1), ...sorted.slice(0, idx + 1)];
}

/** Picks the first eligible seller participant; records every evaluation. */
function pickSeller(
  participants: IRotationParticipant[],
  sellersById: Record<ID, ISeller>,
  pointer: ID | null | undefined,
  now: Date,
): { selectedId: ID | null; candidates: IRotationCandidate[] } {
  const candidates: IRotationCandidate[] = [];
  for (const p of rotatedOrder(participants, pointer)) {
    const seller = sellersById[p.refId];
    if (!seller) {
      candidates.push({ refId: p.refId, refType: "seller", reason: "skipped_inactive", selected: false });
      continue;
    }
    const e = isSellerEligible(seller, { enabled: p.enabled }, now);
    if (e.eligible) {
      candidates.push({ refId: p.refId, refType: "seller", reason: "selected", selected: true });
      return { selectedId: p.refId, candidates };
    }
    candidates.push({ refId: p.refId, refType: "seller", reason: e.reason, selected: false });
  }
  return { selectedId: null, candidates };
}

/**
 * Pure rotation selection (PRD-213). No side effects, no Math.random(). Returns
 * the chosen seller, the evaluated candidates (trace), and the advanced pointers
 * (the caller persists them). Empty result → caller keeps the PRD-013 fallback.
 */
export function selectNextFromRotation(input: IRotationSelectionInput): IRotationSelectionResult {
  const { queue, participants, membersByDepartment, sellersById, now } = input;

  if (queue.targetMode === "direct") {
    const { selectedId, candidates } = pickSeller(participants, sellersById, queue.lastAssignedRefId, now);
    return {
      selectedSellerId: selectedId,
      selectedDepartmentId: null,
      candidates,
      nextTopPointer: selectedId,
      nextMemberPointerByDept: {},
    };
  }

  // department mode — two independent pointers.
  const candidates: IRotationCandidate[] = [];
  const nextMemberPointerByDept: Record<ID, ID> = {};
  const deptParticipants = participants.filter((p) => p.refType === "department");

  for (const dep of rotatedOrder(deptParticipants, queue.lastAssignedRefId)) {
    if (!dep.enabled) {
      candidates.push({ refId: dep.refId, refType: "department", reason: "skipped_disabled", selected: false });
      continue;
    }
    const members = membersByDepartment[dep.refId] ?? [];
    const inner = pickSeller(members, sellersById, dep.lastAssignedMemberId, now);
    if (inner.selectedId) {
      candidates.push({ refId: dep.refId, refType: "department", reason: "selected", selected: true });
      candidates.push(...inner.candidates);
      nextMemberPointerByDept[dep.refId] = inner.selectedId;
      return {
        selectedSellerId: inner.selectedId,
        selectedDepartmentId: dep.refId,
        candidates,
        nextTopPointer: dep.refId,
        nextMemberPointerByDept,
      };
    }
    // department had no eligible member → skip it (offline-equivalent at dept level).
    candidates.push({ refId: dep.refId, refType: "department", reason: "skipped_offline", selected: false });
    candidates.push(...inner.candidates);
  }

  return {
    selectedSellerId: null,
    selectedDepartmentId: null,
    candidates,
    nextTopPointer: null,
    nextMemberPointerByDept: {},
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun run test src/features/rotation/engine/selectNextFromRotation.test.ts` → Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/features/rotation/engine/selectNextFromRotation.ts src/features/rotation/engine/selectNextFromRotation.test.ts
git commit -m "feat(rotation): pure selection engine — direct + department, skip & pointers"
```

---

## Task 4: Helper de override da distribuição (TDD)

**Files:**
- Create: `src/features/rotation/engine/applyRotationOverride.ts`
- Test: `src/features/rotation/engine/applyRotationOverride.test.ts`

**Interfaces:**
- Consumes: `selectNextFromRotation` (Task 3); `IRotationQueueState` (Task 1); `DistributionMatchedCriterion`, `IDistributionResult`, `IDistributionCandidate` de `@/shared/types`.
- Produces: `applyRotationOverride(decision, state, sellersById, now)` — consumido pela integração (Task 9).

**Context:** o motor do PRD-013 (`distributeConversation`) retorna `IDistributionResult` com `criterionMatched`. A fila só atua quando o 013 caiu no revezamento (`round_robin` | `carga` | `fallback_fila`) — carteira/especialidade têm precedência. Este helper é puro: recebe a decisão do 013 + o estado da fila e devolve uma decisão possivelmente sobrescrita + os ponteiros a persistir.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import type { IDistributionResult, IRotationQueueState, ISeller } from "@/shared/types";
import { applyRotationOverride } from "./applyRotationOverride";

const now = new Date("2026-06-16T12:00:00Z");
function seller(id: string, over: Partial<ISeller> = {}): ISeller {
  return { id, storeId: "s", fullName: id, email: `${id}@x`, type: "internal", availability: "online", divisions: ["parts"], active: true, createdAt: "x", ...over };
}
function baseDecision(over: Partial<IDistributionResult> = {}): IDistributionResult {
  return { selectedSellerId: "sdr", isSdrActive: false, status: "aguardando", criterionMatched: "round_robin", candidatesEvaluated: [], mode: "automatic", ...over };
}
const directState = (over: Partial<IRotationQueueState["queue"]> = {}): IRotationQueueState => ({
  queue: { id: "q", storeId: "s", targetMode: "direct", lastAssignedRefId: null, skipOffline: true, createdAt: "x", updatedAt: "x", ...over },
  topParticipants: [
    { id: "p-a", queueId: "q", scopeDepartmentId: null, refType: "seller", refId: "a", order: 0, enabled: true },
    { id: "p-b", queueId: "q", scopeDepartmentId: null, refType: "seller", refId: "b", order: 1, enabled: true },
  ],
  membersByDepartment: {},
});

describe("applyRotationOverride", () => {
  it("overrides the 013 round-robin with the queue selection", () => {
    const r = applyRotationOverride(baseDecision({ criterionMatched: "round_robin" }), directState(), { a: seller("a"), b: seller("b") }, now);
    expect(r.decision.selectedSellerId).toBe("a");
    expect(r.decision.status).toBe("em_andamento");
    expect(r.decision.isSdrActive).toBe(false);
    expect(r.decision.criterionMatched).toBe("round_robin");
    expect(r.pointers.topRefId).toBe("a");
  });

  it("does NOT touch a carteira decision (upstream precedence)", () => {
    const decision = baseDecision({ criterionMatched: "carteira", selectedSellerId: "carlos", status: "em_andamento" });
    const r = applyRotationOverride(decision, directState(), { a: seller("a") }, now);
    expect(r.decision).toEqual(decision);
    expect(r.pointers).toBeNull();
  });

  it("keeps the 013 fallback when the queue has nobody eligible", () => {
    const decision = baseDecision({ criterionMatched: "fallback_fila", selectedSellerId: null });
    const offlineState = directState();
    const r = applyRotationOverride(decision, offlineState, { a: seller("a", { availability: "offline" }), b: seller("b", { availability: "offline" }) }, now);
    expect(r.decision).toEqual(decision);
    expect(r.pointers).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test src/features/rotation/engine/applyRotationOverride.test.ts` → Expected: FAIL.

- [ ] **Step 3: Implementar `applyRotationOverride.ts`**

```ts
import type {
  DistributionMatchedCriterion,
  ID,
  IDistributionCandidate,
  IDistributionResult,
  IRotationQueueState,
  ISeller,
} from "@/shared/types";
import { selectNextFromRotation } from "./selectNextFromRotation";

/** Criteria where the queue may take over (the 013 "revezamento" zone). */
const ROTATION_GOVERNS: ReadonlySet<DistributionMatchedCriterion> = new Set([
  "round_robin",
  "carga",
  "fallback_fila",
]);

const SKIP_LABEL: Record<string, string> = {
  selected: "rodízio: selecionado",
  skipped_offline: "rodízio: pulado — offline",
  skipped_disabled: "rodízio: pulado — desabilitado",
  skipped_inactive: "rodízio: pulado — inativo",
  skipped_off_hours: "rodízio: pulado — fora do horário",
};

export interface IRotationOverrideResult {
  decision: IDistributionResult;
  /** Pointers to persist when the queue took over; null = no change. */
  pointers: { topRefId: ID; memberByDept: Record<ID, ID> } | null;
}

/**
 * Applies the rotation queue as the source of the "revezamento" — a single
 * consultation point referencing PRD-013 without rewriting it. Carteira and
 * especialidade keep upstream precedence; an empty queue keeps the 013 fallback.
 */
export function applyRotationOverride(
  decision: IDistributionResult,
  state: IRotationQueueState,
  sellersById: Record<ID, ISeller>,
  now: Date,
): IRotationOverrideResult {
  if (!ROTATION_GOVERNS.has(decision.criterionMatched)) {
    return { decision, pointers: null };
  }

  const result = selectNextFromRotation({
    queue: state.queue,
    participants: state.topParticipants,
    membersByDepartment: state.membersByDepartment,
    sellersById,
    now,
  });

  if (!result.selectedSellerId) return { decision, pointers: null };

  const candidatesEvaluated: IDistributionCandidate[] = result.candidates.map((c) => ({
    sellerId: c.refId,
    reason: SKIP_LABEL[c.reason] ?? c.reason,
    selected: c.selected && c.refType === "seller",
  }));

  return {
    decision: {
      ...decision,
      selectedSellerId: result.selectedSellerId,
      status: "em_andamento",
      isSdrActive: false,
      criterionMatched: "round_robin", // the queue IS the revezamento (no new enum)
      candidatesEvaluated,
    },
    pointers: { topRefId: result.nextTopPointer ?? result.selectedSellerId, memberByDept: result.nextMemberPointerByDept },
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun run test src/features/rotation/engine/applyRotationOverride.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/rotation/engine/applyRotationOverride.ts src/features/rotation/engine/applyRotationOverride.test.ts
git commit -m "feat(rotation): pure distribution-override helper (boundary contract w/ PRD-013)"
```

---

## Task 5: Contratos dos providers

**Files:**
- Create: `src/providers/data/contracts/rotationQueues.ts`
- Create: `src/providers/data/contracts/rotationParticipants.ts`
- Modify: `src/providers/data/contracts/index.ts`

**Interfaces:**
- Consumes: tipos da Task 1.
- Produces: `IRotationQueuesProvider`, `IRotationParticipantsProvider`, `IAddRotationParticipantInput`; chaves `rotationQueues`/`rotationParticipants` em `IDataProviders` — consumidos pelas Tasks 6–9, 11–13.

- [ ] **Step 1: Criar `contracts/rotationQueues.ts`**

```ts
import type { ID, IRotationQueue, IRotationQueueState, RotationTargetMode } from "@/shared/types";

export interface IRotationQueuesProvider {
  /** Returns the store's queue, creating an empty one if it does not exist. */
  getByStore(storeId: ID): Promise<IRotationQueue>;
  /** Returns queue + top participants + members-by-department (aggregate read). */
  getState(storeId: ID): Promise<IRotationQueueState>;
  /** Patches queue config (targetMode / pointer / skipOffline). Audited. */
  update(
    storeId: ID,
    patch: { targetMode?: RotationTargetMode; lastAssignedRefId?: ID | null; skipOffline?: boolean },
  ): Promise<IRotationQueue>;
}
```

- [ ] **Step 2: Criar `contracts/rotationParticipants.ts`**

```ts
import type { ID, IRotationParticipant } from "@/shared/types";

export interface IAddRotationParticipantInput {
  queueId: ID;
  /** null = top-level participant; set = internal member of that department. */
  scopeDepartmentId?: ID | null;
  refType: "seller" | "department";
  refId: ID;
  enabled?: boolean;
}

export interface IRotationParticipantsProvider {
  /** Top-level participants of a queue (scopeDepartmentId null), ordered. */
  listTop(queueId: ID): Promise<IRotationParticipant[]>;
  /** Internal members of one department, ordered. */
  listByDepartment(queueId: ID, departmentId: ID): Promise<IRotationParticipant[]>;
  add(input: IAddRotationParticipantInput): Promise<IRotationParticipant>;
  remove(id: ID): Promise<void>;
  setEnabled(id: ID, enabled: boolean): Promise<IRotationParticipant>;
  /** Persists order = index for each id, in array order. */
  reorder(ids: ID[]): Promise<void>;
  /** Advances a department's internal pointer (refType='department' row). */
  setMemberPointer(queueId: ID, departmentId: ID, memberRefId: ID | null): Promise<void>;
}
```

- [ ] **Step 3: Registrar em `contracts/index.ts`**

Adicionar imports de tipo (após a linha `import type { IDepartmentsProvider } from "./departments";`):

```ts
import type { IRotationQueuesProvider } from "./rotationQueues";
import type { IRotationParticipantsProvider } from "./rotationParticipants";
```

Adicionar re-exports (após `export type { IDepartmentsProvider, ICreateDepartmentInput } from "./departments";`):

```ts
export type { IRotationQueuesProvider } from "./rotationQueues";
export type {
  IRotationParticipantsProvider,
  IAddRotationParticipantInput,
} from "./rotationParticipants";
```

Adicionar à interface `IDataProviders` (após `departments: IDepartmentsProvider;`):

```ts
  rotationQueues: IRotationQueuesProvider;
  rotationParticipants: IRotationParticipantsProvider;
```

- [ ] **Step 4: Verificar**

Run: `bunx tsc --noEmit 2>&1 | grep -iE "rotationQueues|rotationParticipants"` → Expected: erros apenas do tipo "not assignable / missing in mockProviders" (porque a factory ainda não registra) — serão resolvidos nas Tasks 7/8. Nenhum erro de sintaxe nos contratos.

- [ ] **Step 5: Commit**

```bash
git add src/providers/data/contracts/rotationQueues.ts src/providers/data/contracts/rotationParticipants.ts src/providers/data/contracts/index.ts
git commit -m "feat(rotation): provider contracts for queues and participants"
```

---

## Task 6: Mock — store, seed e API

**Files:**
- Create: `src/mocks/data/seedRotation.ts`
- Modify: `src/mocks/data/index.ts` (re-export do seed builder, se o barrel existir; senão importar direto no bootstrap)
- Modify: `src/mocks/generators/bootstrap.ts`
- Modify: `src/mocks/store/selectors.ts`
- Create: `src/mocks/api/rotationQueues.ts`
- Create: `src/mocks/api/rotationParticipants.ts`
- Modify: `src/mocks/index.ts`

**Interfaces:**
- Consumes: tipos da Task 1; contratos da Task 5 (input types).
- Produces: `rotationQueuesApi`, `rotationParticipantsApi`, selectors `selectAllRotationQueues`/`selectAllRotationParticipants`, dataset keys `rotationQueues`/`rotationParticipants` — consumidos pela Task 7 (mock providers) e Task 9 (integração).

- [ ] **Step 1: Criar `src/mocks/data/seedRotation.ts`**

```ts
import type { ID, IRotationParticipant, IRotationQueue, ISeller } from "@/shared/types";

/**
 * Deterministic seed for the rotation queue (PRD-213). One queue per store in
 * `direct` mode; the store's active sellers become ordered, enabled participants.
 * IDs are stable (no random) so two bootstrap(seed) calls match.
 */
export function buildRotationSeed(
  storeId: ID,
  sellers: ISeller[],
  now: Date,
): { queues: IRotationQueue[]; participants: IRotationParticipant[] } {
  const iso = now.toISOString();
  const queueId = `rotq-${storeId}`;
  const queue: IRotationQueue = {
    id: queueId,
    storeId,
    targetMode: "direct",
    lastAssignedRefId: null,
    skipOffline: true,
    createdAt: iso,
    updatedAt: iso,
  };
  const participants: IRotationParticipant[] = sellers
    .filter((s) => s.storeId === storeId && s.active && s.type !== "representative")
    .map((s, index) => ({
      id: `rotp-${s.id}`,
      queueId,
      scopeDepartmentId: null,
      refType: "seller" as const,
      refId: s.id,
      order: index,
      enabled: s.rotation?.enabled ?? true,
    }));
  return { queues: [queue], participants };
}
```

- [ ] **Step 2: Incluir no `bootstrap.ts`**

(a) No import de `@/shared/types` (topo), adicionar `IRotationParticipant, IRotationQueue` à lista.
(b) Importar o seed builder. Após `import { generateSellers } from "./seller";`:

```ts
import { buildRotationSeed } from "../data/seedRotation";
```

(c) Adicionar ao `interface IBootstrappedDataset` (após `sellers: ISeller[];`):

```ts
  rotationQueues: IRotationQueue[];
  rotationParticipants: IRotationParticipant[];
```

(d) Após a linha `const sellers = generateSellers();` (≈ linha 162), adicionar:

```ts
  const { queues: rotationQueues, participants: rotationParticipants } = buildRotationSeed(
    stores[0].id,
    sellers,
    now,
  );
```

(e) No objeto `const dataset: IBootstrappedDataset = { ... }` (≈ linha 569), adicionar após `sellers,`:

```ts
    rotationQueues,
    rotationParticipants,
```

- [ ] **Step 3: Selectors em `src/mocks/store/selectors.ts`**

Adicionar (seguindo o padrão de `selectAllDepartments`):

```ts
export function selectAllRotationQueues() {
  return getMockState().rotationQueues;
}

export function selectAllRotationParticipants() {
  return getMockState().rotationParticipants;
}
```

- [ ] **Step 4: Criar `src/mocks/api/rotationQueues.ts`**

```ts
import type { ID, IRotationQueue, IRotationQueueState, RotationTargetMode } from "@/shared/types";
import { selectAllRotationParticipants, selectAllRotationQueues } from "../store/selectors";
import { useMockStore } from "../store/mockStore";
import { runApi } from "./utils";

function ensureQueue(storeId: ID): IRotationQueue {
  const existing = selectAllRotationQueues().find((q) => q.storeId === storeId);
  if (existing) return existing;
  const iso = new Date().toISOString();
  const created: IRotationQueue = {
    id: `rotq-${storeId}`,
    storeId,
    targetMode: "direct",
    lastAssignedRefId: null,
    skipOffline: true,
    createdAt: iso,
    updatedAt: iso,
  };
  useMockStore.setState((state) => ({ rotationQueues: [...state.rotationQueues, created] }));
  return created;
}

export const rotationQueuesApi = {
  getByStore(storeId: ID): Promise<IRotationQueue> {
    return runApi("rotationQueuesApi", "getByStore", () => ensureQueue(storeId), {
      payload: { storeId },
    });
  },

  getState(storeId: ID): Promise<IRotationQueueState> {
    return runApi("rotationQueuesApi", "getState", () => {
      const queue = ensureQueue(storeId);
      const all = selectAllRotationParticipants().filter((p) => p.queueId === queue.id);
      const topParticipants = all
        .filter((p) => !p.scopeDepartmentId)
        .sort((a, b) => a.order - b.order);
      const membersByDepartment: Record<ID, typeof all> = {};
      for (const p of all) {
        if (!p.scopeDepartmentId) continue;
        (membersByDepartment[p.scopeDepartmentId] ??= []).push(p);
      }
      for (const key of Object.keys(membersByDepartment)) {
        membersByDepartment[key]!.sort((a, b) => a.order - b.order);
      }
      return { queue, topParticipants, membersByDepartment };
    }, { payload: { storeId } });
  },

  update(
    storeId: ID,
    patch: { targetMode?: RotationTargetMode; lastAssignedRefId?: ID | null; skipOffline?: boolean },
  ): Promise<IRotationQueue> {
    return runApi("rotationQueuesApi", "update", () => {
      const queue = ensureQueue(storeId);
      const updated: IRotationQueue = {
        ...queue,
        ...(patch.targetMode !== undefined ? { targetMode: patch.targetMode } : {}),
        ...(patch.lastAssignedRefId !== undefined ? { lastAssignedRefId: patch.lastAssignedRefId } : {}),
        ...(patch.skipOffline !== undefined ? { skipOffline: patch.skipOffline } : {}),
        updatedAt: new Date().toISOString(),
      };
      useMockStore.setState((state) => ({
        rotationQueues: state.rotationQueues.map((q) => (q.id === updated.id ? updated : q)),
      }));
      return updated;
    }, { payload: { storeId, patch } });
  },
};
```

- [ ] **Step 5: Criar `src/mocks/api/rotationParticipants.ts`**

```ts
import type { ID, IRotationParticipant } from "@/shared/types";
import { selectAllRotationParticipants } from "../store/selectors";
import { useMockStore } from "../store/mockStore";
import { MockNotFoundError, runApi } from "./utils";

// Mirror of IAddRotationParticipantInput (contracts) — defined locally to keep
// the mock layer free of provider/contract imports (matches departmentsApi).
export interface IAddRotationParticipantInput {
  queueId: ID;
  scopeDepartmentId?: ID | null;
  refType: "seller" | "department";
  refId: ID;
  enabled?: boolean;
}

function scoped(queueId: ID, departmentId: ID | null): IRotationParticipant[] {
  return selectAllRotationParticipants()
    .filter((p) => p.queueId === queueId && (p.scopeDepartmentId ?? null) === departmentId)
    .sort((a, b) => a.order - b.order);
}

export const rotationParticipantsApi = {
  listTop(queueId: ID): Promise<IRotationParticipant[]> {
    return runApi("rotationParticipantsApi", "listTop", () => scoped(queueId, null), {
      payload: { queueId },
    });
  },

  listByDepartment(queueId: ID, departmentId: ID): Promise<IRotationParticipant[]> {
    return runApi("rotationParticipantsApi", "listByDepartment", () => scoped(queueId, departmentId), {
      payload: { queueId, departmentId },
    });
  },

  add(input: IAddRotationParticipantInput): Promise<IRotationParticipant> {
    return runApi("rotationParticipantsApi", "add", () => {
      const scope = input.scopeDepartmentId ?? null;
      const siblings = scoped(input.queueId, scope);
      const created: IRotationParticipant = {
        id: `rotp-${crypto.randomUUID().slice(0, 8)}`,
        queueId: input.queueId,
        scopeDepartmentId: scope,
        refType: input.refType,
        refId: input.refId,
        order: siblings.length,
        enabled: input.enabled ?? true,
        lastAssignedMemberId: input.refType === "department" ? null : undefined,
      };
      useMockStore.setState((state) => ({
        rotationParticipants: [...state.rotationParticipants, created],
      }));
      return created;
    }, { payload: input });
  },

  remove(id: ID): Promise<void> {
    return runApi("rotationParticipantsApi", "remove", () => {
      useMockStore.setState((state) => ({
        rotationParticipants: state.rotationParticipants.filter((p) => p.id !== id),
      }));
    }, { payload: { id } });
  },

  setEnabled(id: ID, enabled: boolean): Promise<IRotationParticipant> {
    return runApi("rotationParticipantsApi", "setEnabled", () => {
      let updated: IRotationParticipant | null = null;
      useMockStore.setState((state) => ({
        rotationParticipants: state.rotationParticipants.map((p) => {
          if (p.id !== id) return p;
          updated = { ...p, enabled };
          return updated;
        }),
      }));
      if (!updated) throw new MockNotFoundError("rotation_participant", id);
      return updated;
    }, { payload: { id, enabled } });
  },

  reorder(ids: ID[]): Promise<void> {
    return runApi("rotationParticipantsApi", "reorder", () => {
      const orderById = new Map(ids.map((id, index) => [id, index]));
      useMockStore.setState((state) => ({
        rotationParticipants: state.rotationParticipants.map((p) =>
          orderById.has(p.id) ? { ...p, order: orderById.get(p.id)! } : p,
        ),
      }));
    }, { payload: { ids } });
  },

  setMemberPointer(queueId: ID, departmentId: ID, memberRefId: ID | null): Promise<void> {
    return runApi("rotationParticipantsApi", "setMemberPointer", () => {
      useMockStore.setState((state) => ({
        rotationParticipants: state.rotationParticipants.map((p) =>
          p.queueId === queueId && p.refType === "department" && p.refId === departmentId
            ? { ...p, lastAssignedMemberId: memberRefId }
            : p,
        ),
      }));
    }, { payload: { queueId, departmentId, memberRefId } });
  },
};
```

- [ ] **Step 6: Exportar no barrel `src/mocks/index.ts`**

Localizar onde `departmentsApi` é exportado e adicionar, no mesmo estilo:

```ts
export { rotationQueuesApi } from "./api/rotationQueues";
export { rotationParticipantsApi } from "./api/rotationParticipants";
```

- [ ] **Step 7: Verificar (seed determinístico + build)**

Run: `bun run test src/mocks 2>&1 | tail -5` → Expected: testes existentes do mock continuam verdes (paridade/integridade do seed não quebra).
Run: `node node_modules/vite/bin/vite.js build` → Expected: build conclui.

- [ ] **Step 8: Commit**

```bash
git add src/mocks/data/seedRotation.ts src/mocks/generators/bootstrap.ts src/mocks/store/selectors.ts src/mocks/api/rotationQueues.ts src/mocks/api/rotationParticipants.ts src/mocks/index.ts
git commit -m "feat(rotation): mock store, deterministic seed and API surface"
```

---

## Task 7: Mock providers, hooks e registro na factory (lado mock)

**Files:**
- Create: `src/providers/data/impl/mock/rotationQueues.ts`
- Create: `src/providers/data/impl/mock/rotationParticipants.ts`
- Create: `src/providers/data/hooks/useRotationQueuesProvider.ts`
- Create: `src/providers/data/hooks/useRotationParticipantsProvider.ts`
- Modify: `src/providers/data/index.ts` (re-export dos hooks)
- Modify: `src/providers/data/factory.ts` (import + `mockProviders`)

**Interfaces:**
- Consumes: contratos (Task 5); APIs mock (Task 6).
- Produces: `mockRotationQueuesProvider`, `mockRotationParticipantsProvider`, hooks `useRotationQueuesProvider`/`useRotationParticipantsProvider`.

- [ ] **Step 1: `impl/mock/rotationQueues.ts`** (thin adapter + audit nas mutações, padrão de `mockDepartmentsProvider`)

```ts
import { rotationQueuesApi } from "@/mocks";
import { auditLog } from "@/features/rbac";
import type { ID, RotationTargetMode } from "@/shared/types";
import type { IRotationQueuesProvider } from "../../contracts/rotationQueues";

export const mockRotationQueuesProvider: IRotationQueuesProvider = {
  getByStore: (storeId) => rotationQueuesApi.getByStore(storeId),
  getState: (storeId) => rotationQueuesApi.getState(storeId),
  async update(
    storeId: ID,
    patch: { targetMode?: RotationTargetMode; lastAssignedRefId?: ID | null; skipOffline?: boolean },
  ) {
    const updated = await rotationQueuesApi.update(storeId, patch);
    // Only audit operator-facing config changes (not pointer advances).
    if (patch.targetMode !== undefined || patch.skipOffline !== undefined) {
      auditLog({
        action: "rotation.queue.update",
        resource: "rotation_queue",
        resourceId: updated.id,
        storeId: updated.storeId,
        after: { targetMode: updated.targetMode, skipOffline: updated.skipOffline },
      });
    }
    return updated;
  },
};
```

- [ ] **Step 2: `impl/mock/rotationParticipants.ts`**

```ts
import { rotationParticipantsApi } from "@/mocks";
import type { ID } from "@/shared/types";
import type {
  IAddRotationParticipantInput,
  IRotationParticipantsProvider,
} from "../../contracts/rotationParticipants";

export const mockRotationParticipantsProvider: IRotationParticipantsProvider = {
  listTop: (queueId) => rotationParticipantsApi.listTop(queueId),
  listByDepartment: (queueId, departmentId) =>
    rotationParticipantsApi.listByDepartment(queueId, departmentId),
  add: (input: IAddRotationParticipantInput) => rotationParticipantsApi.add(input),
  remove: (id: ID) => rotationParticipantsApi.remove(id),
  setEnabled: (id: ID, enabled: boolean) => rotationParticipantsApi.setEnabled(id, enabled),
  reorder: (ids: ID[]) => rotationParticipantsApi.reorder(ids),
  setMemberPointer: (queueId, departmentId, memberRefId) =>
    rotationParticipantsApi.setMemberPointer(queueId, departmentId, memberRefId),
};
```

- [ ] **Step 3: Hooks** (padrão de `useMessageTemplatesProvider`)

`hooks/useRotationQueuesProvider.ts`:
```ts
import type { IRotationQueuesProvider } from "../contracts/rotationQueues";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useRotationQueuesProvider(): IRotationQueuesProvider {
  return useDataProviderSlice("rotationQueues", "useRotationQueuesProvider");
}
```

`hooks/useRotationParticipantsProvider.ts`:
```ts
import type { IRotationParticipantsProvider } from "../contracts/rotationParticipants";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useRotationParticipantsProvider(): IRotationParticipantsProvider {
  return useDataProviderSlice("rotationParticipants", "useRotationParticipantsProvider");
}
```

- [ ] **Step 4: Re-export em `src/providers/data/index.ts`**

Localizar onde os outros `useXxxProvider` são re-exportados e adicionar:
```ts
export { useRotationQueuesProvider } from "./hooks/useRotationQueuesProvider";
export { useRotationParticipantsProvider } from "./hooks/useRotationParticipantsProvider";
```

- [ ] **Step 5: Registrar na factory (lado mock)**

Em `factory.ts`, após `import { mockDepartmentsProvider } from "./impl/mock/departments";`:
```ts
import { mockRotationQueuesProvider } from "./impl/mock/rotationQueues";
import { mockRotationParticipantsProvider } from "./impl/mock/rotationParticipants";
```

No objeto `mockProviders`, após `departments: mockDepartmentsProvider,`:
```ts
  rotationQueues: mockRotationQueuesProvider,
  rotationParticipants: mockRotationParticipantsProvider,
```

> Não compilará 100% até o lado supabase existir (Task 8) — `supabaseProviders` ainda não tem as chaves. Não rodar build isolado aqui; seguir para a Task 8 e validar junto. (Se quiser commitar verde, faça as Tasks 7 e 8 numa sequência e valide ao fim da 8.)

- [ ] **Step 6: Commit**

```bash
git add src/providers/data/impl/mock/rotationQueues.ts src/providers/data/impl/mock/rotationParticipants.ts src/providers/data/hooks/useRotationQueuesProvider.ts src/providers/data/hooks/useRotationParticipantsProvider.ts src/providers/data/index.ts src/providers/data/factory.ts
git commit -m "feat(rotation): mock providers, hooks and factory wiring (mock side)"
```

---

## Task 8: Supabase — migration, providers e mapeamento de `sellers.rotation`

**Files:**
- Create: `supabase/migrations/20260616XXXXXX_rotation_queues.sql` (timestamp real no momento da escrita)
- Create: `src/providers/data/impl/supabase/rotationQueues.ts`
- Create: `src/providers/data/impl/supabase/rotationParticipants.ts`
- Modify: `src/providers/data/impl/supabase/sellers.ts` (mapear `rotation`)
- Modify: `src/providers/data/factory.ts` (`supabaseProviders`)

**Interfaces:**
- Consumes: contratos (Task 5).
- Produces: `supabaseRotationQueuesProvider`, `supabaseRotationParticipantsProvider`; `rotation` mapeado no `supabaseSellersProvider`.

- [ ] **Step 1: Criar a migration versionada**

Usar timestamp `YYYYMMDDHHMMSS` (gerar no momento; ex.: `20260616180000`). Conteúdo:

```sql
-- PRD-213 — rotation queue (one per store) + participants. Additive; RLS store-scoped.
create table if not exists public.rotation_queues (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  target_mode text not null default 'direct' check (target_mode in ('direct','department')),
  last_assigned_ref_id text,
  skip_offline boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id)
);

create table if not exists public.rotation_participants (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null references public.rotation_queues(id) on delete cascade,
  scope_department_id text references public.departments(id) on delete cascade,
  ref_type text not null check (ref_type in ('seller','department')),
  ref_id text not null,
  "order" integer not null default 0,
  enabled boolean not null default true,
  last_assigned_member_id text
);
create index if not exists idx_rotation_participants_queue on public.rotation_participants(queue_id);
create index if not exists idx_rotation_participants_scope on public.rotation_participants(scope_department_id);

alter table public.rotation_queues enable row level security;
alter table public.rotation_participants enable row level security;

-- Read: any authenticated member of the store. Write: staff (owner/manager) of the store.
create policy rotation_queues_select on public.rotation_queues
  for select using (store_id = public.current_store_id());
create policy rotation_queues_write on public.rotation_queues
  for all using (store_id = public.current_store_id() and public.is_staff())
  with check (store_id = public.current_store_id() and public.is_staff());

create policy rotation_participants_select on public.rotation_participants
  for select using (
    exists (select 1 from public.rotation_queues q
            where q.id = queue_id and q.store_id = public.current_store_id())
  );
create policy rotation_participants_write on public.rotation_participants
  for all using (
    exists (select 1 from public.rotation_queues q
            where q.id = queue_id and q.store_id = public.current_store_id() and public.is_staff())
  )
  with check (
    exists (select 1 from public.rotation_queues q
            where q.id = queue_id and q.store_id = public.current_store_id() and public.is_staff())
  );
```

> **Confirmar antes de escrever:** que existem os helpers `public.current_store_id()` e `public.is_staff()` (usados em outras policies — ex. `departments`/`sellers`). Se os nomes diferirem, alinhar com `supabase/migrations/` existentes. **Não aplicar em produção** — só versionar. A aplicação via MCP `apply_migration` acontece na validação final, **sob OK nominal do dono** (passo destacado no fim deste plano).

- [ ] **Step 2: `impl/supabase/rotationQueues.ts`** (mapper snake_case↔camelCase, ensure-on-read; padrão de `supabaseDepartmentsProvider`)

```ts
import type { ID, IRotationParticipant, IRotationQueue, IRotationQueueState, RotationTargetMode } from "@/shared/types";
import type { IRotationQueuesProvider } from "../../contracts/rotationQueues";
import { getSupabaseClient } from "@/shared/lib/supabase";

interface QueueRow {
  id: string; store_id: string; target_mode: RotationTargetMode;
  last_assigned_ref_id: string | null; skip_offline: boolean;
  created_at: string; updated_at: string;
}
const Q_COLUMNS = "id, store_id, target_mode, last_assigned_ref_id, skip_offline, created_at, updated_at";

function rowToQueue(r: QueueRow): IRotationQueue {
  return {
    id: r.id, storeId: r.store_id, targetMode: r.target_mode,
    lastAssignedRefId: r.last_assigned_ref_id, skipOffline: r.skip_offline,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

interface PartRow {
  id: string; queue_id: string; scope_department_id: string | null;
  ref_type: "seller" | "department"; ref_id: string; order: number;
  enabled: boolean; last_assigned_member_id: string | null;
}
const P_COLUMNS = 'id, queue_id, scope_department_id, ref_type, ref_id, "order", enabled, last_assigned_member_id';
function rowToParticipant(r: PartRow): IRotationParticipant {
  return {
    id: r.id, queueId: r.queue_id, scopeDepartmentId: r.scope_department_id,
    refType: r.ref_type, refId: r.ref_id, order: r.order, enabled: r.enabled,
    lastAssignedMemberId: r.last_assigned_member_id,
  };
}

async function ensureQueue(storeId: ID): Promise<IRotationQueue> {
  const client = getSupabaseClient();
  const { data, error } = await client.from("rotation_queues").select(Q_COLUMNS).eq("store_id", storeId).maybeSingle();
  if (error) throw new Error(`[supabase] rotationQueues.getByStore failed: ${error.message}`);
  if (data) return rowToQueue(data as QueueRow);
  const { data: created, error: insErr } = await client
    .from("rotation_queues").insert({ store_id: storeId }).select(Q_COLUMNS).single();
  if (insErr) throw new Error(`[supabase] rotationQueues.create failed: ${insErr.message}`);
  return rowToQueue(created as QueueRow);
}

export const supabaseRotationQueuesProvider: IRotationQueuesProvider = {
  getByStore: (storeId) => ensureQueue(storeId),

  async getState(storeId: ID): Promise<IRotationQueueState> {
    const queue = await ensureQueue(storeId);
    const { data, error } = await getSupabaseClient()
      .from("rotation_participants").select(P_COLUMNS).eq("queue_id", queue.id).order("order", { ascending: true });
    if (error) throw new Error(`[supabase] rotationQueues.getState failed: ${error.message}`);
    const all = (data as PartRow[]).map(rowToParticipant);
    const topParticipants = all.filter((p) => !p.scopeDepartmentId);
    const membersByDepartment: Record<ID, IRotationParticipant[]> = {};
    for (const p of all) {
      if (!p.scopeDepartmentId) continue;
      (membersByDepartment[p.scopeDepartmentId] ??= []).push(p);
    }
    return { queue, topParticipants, membersByDepartment };
  },

  async update(storeId, patch) {
    const queue = await ensureQueue(storeId);
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.targetMode !== undefined) row.target_mode = patch.targetMode;
    if (patch.lastAssignedRefId !== undefined) row.last_assigned_ref_id = patch.lastAssignedRefId;
    if (patch.skipOffline !== undefined) row.skip_offline = patch.skipOffline;
    const { data, error } = await getSupabaseClient()
      .from("rotation_queues").update(row).eq("id", queue.id).select(Q_COLUMNS).single();
    if (error) throw new Error(`[supabase] rotationQueues.update failed: ${error.message}`);
    return rowToQueue(data as QueueRow);
  },
};
```

- [ ] **Step 3: `impl/supabase/rotationParticipants.ts`**

```ts
import type { ID, IRotationParticipant } from "@/shared/types";
import type {
  IAddRotationParticipantInput,
  IRotationParticipantsProvider,
} from "../../contracts/rotationParticipants";
import { getSupabaseClient } from "@/shared/lib/supabase";

interface PartRow {
  id: string; queue_id: string; scope_department_id: string | null;
  ref_type: "seller" | "department"; ref_id: string; order: number;
  enabled: boolean; last_assigned_member_id: string | null;
}
const P_COLUMNS = 'id, queue_id, scope_department_id, ref_type, ref_id, "order", enabled, last_assigned_member_id';
function rowToParticipant(r: PartRow): IRotationParticipant {
  return {
    id: r.id, queueId: r.queue_id, scopeDepartmentId: r.scope_department_id,
    refType: r.ref_type, refId: r.ref_id, order: r.order, enabled: r.enabled,
    lastAssignedMemberId: r.last_assigned_member_id,
  };
}

async function listScoped(queueId: ID, departmentId: ID | null): Promise<IRotationParticipant[]> {
  let q = getSupabaseClient().from("rotation_participants").select(P_COLUMNS).eq("queue_id", queueId);
  q = departmentId === null ? q.is("scope_department_id", null) : q.eq("scope_department_id", departmentId);
  const { data, error } = await q.order("order", { ascending: true });
  if (error) throw new Error(`[supabase] rotationParticipants.list failed: ${error.message}`);
  return (data as PartRow[]).map(rowToParticipant);
}

export const supabaseRotationParticipantsProvider: IRotationParticipantsProvider = {
  listTop: (queueId) => listScoped(queueId, null),
  listByDepartment: (queueId, departmentId) => listScoped(queueId, departmentId),

  async add(input: IAddRotationParticipantInput) {
    const scope = input.scopeDepartmentId ?? null;
    const siblings = await listScoped(input.queueId, scope);
    const { data, error } = await getSupabaseClient()
      .from("rotation_participants")
      .insert({
        queue_id: input.queueId,
        scope_department_id: scope,
        ref_type: input.refType,
        ref_id: input.refId,
        order: siblings.length,
        enabled: input.enabled ?? true,
      })
      .select(P_COLUMNS).single();
    if (error) throw new Error(`[supabase] rotationParticipants.add failed: ${error.message}`);
    return rowToParticipant(data as PartRow);
  },

  async remove(id: ID) {
    const { error } = await getSupabaseClient().from("rotation_participants").delete().eq("id", id);
    if (error) throw new Error(`[supabase] rotationParticipants.remove failed: ${error.message}`);
  },

  async setEnabled(id: ID, enabled: boolean) {
    const { data, error } = await getSupabaseClient()
      .from("rotation_participants").update({ enabled }).eq("id", id).select(P_COLUMNS).single();
    if (error) throw new Error(`[supabase] rotationParticipants.setEnabled failed: ${error.message}`);
    return rowToParticipant(data as PartRow);
  },

  async reorder(ids: ID[]) {
    const client = getSupabaseClient();
    // Per-row order updates; small lists. (Follow-up: a SECURITY DEFINER RPC for atomicity.)
    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index];
      if (!id) continue;
      const { error } = await client.from("rotation_participants").update({ order: index }).eq("id", id);
      if (error) throw new Error(`[supabase] rotationParticipants.reorder failed: ${error.message}`);
    }
  },

  async setMemberPointer(queueId: ID, departmentId: ID, memberRefId: ID | null) {
    const { error } = await getSupabaseClient()
      .from("rotation_participants")
      .update({ last_assigned_member_id: memberRefId })
      .eq("queue_id", queueId).eq("ref_type", "department").eq("ref_id", departmentId);
    if (error) throw new Error(`[supabase] rotationParticipants.setMemberPointer failed: ${error.message}`);
  },
};
```

- [ ] **Step 4: Mapear `rotation` no `supabaseSellersProvider`**

Em `src/providers/data/impl/supabase/sellers.ts`:
- No `interface SellerRow`, após `vehicle_cadastro_mode: ...`, adicionar: `rotation: ISeller["rotation"] | null;`
- Na const `COLUMNS`, inserir `rotation` na string (ex.: após `vehicle_cadastro_mode, `): `..., vehicle_cadastro_mode, rotation, department_id, ...`
- Em `rowToSeller`, adicionar: `rotation: row.rotation ?? undefined,`
- Em `sellerPatchToRow`, adicionar: `if (patch.rotation !== undefined) row.rotation = patch.rotation;`

- [ ] **Step 5: Registrar na factory (lado supabase)**

Em `factory.ts`, após `import { supabaseDepartmentsProvider } from "./impl/supabase/departments";`:
```ts
import { supabaseRotationQueuesProvider } from "./impl/supabase/rotationQueues";
import { supabaseRotationParticipantsProvider } from "./impl/supabase/rotationParticipants";
```
No objeto `supabaseProviders`, após `departments: supabaseDepartmentsProvider,`:
```ts
  rotationQueues: supabaseRotationQueuesProvider,
  rotationParticipants: supabaseRotationParticipantsProvider,
```

- [ ] **Step 6: Verificar (agora compila — ambos os bundles têm as chaves)**

Run: `bunx tsc --noEmit 2>&1 | grep -iE "rotation"` → Expected: nenhum erro novo de rotation.
Run: `node node_modules/vite/bin/vite.js build` → Expected: build conclui.
Run: `bun run test src/features/rotation` → Expected: engines verdes.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260616XXXXXX_rotation_queues.sql src/providers/data/impl/supabase/rotationQueues.ts src/providers/data/impl/supabase/rotationParticipants.ts src/providers/data/impl/supabase/sellers.ts src/providers/data/factory.ts
git commit -m "feat(rotation): supabase providers, RLS migration, map sellers.rotation"
```

---

## Task 9: Integração no `conversations.create()` (mock + supabase)

**Files:**
- Modify: `src/mocks/api/conversations.ts`
- Modify: `src/providers/data/impl/supabase/conversations.ts`

**Interfaces:**
- Consumes: `applyRotationOverride` (Task 4); `rotationQueuesApi`/`rotationParticipantsApi` (mock) e `supabaseRotation*Provider` (supabase); `getState` (Task 7/8).
- Produces: comportamento — a fila vira a fonte do revezamento; ponteiros persistidos. Uma atribuição por conversa.

**Context:** após `distributeConversation()`, chamar `applyRotationOverride` com o estado da fila e os sellers da loja indexados por id. Se houve override, persistir: `selectedSellerId` na conversa, e os ponteiros (`rotationQueues.update(storeId, { lastAssignedRefId })` + `setMemberPointer` por dept). Mantém o avanço de `lastAssignedSellerId` do 013 inalterado (a fila apenas troca a seleção; o cursor do 013 não precisa avançar quando a fila governa — mas não removê-lo para não alterar o comportamento existente nos casos não governados).

- [ ] **Step 1 (mock): importar e montar `sellersById`**

No topo de `src/mocks/api/conversations.ts`, garantir imports (relativos, para evitar ciclo do barrel `@/mocks`):
```ts
import { applyRotationOverride } from "@/features/rotation/engine/applyRotationOverride";
import { rotationQueuesApi } from "./rotationQueues";
import { rotationParticipantsApi } from "./rotationParticipants";
```
(Os símbolos `selectAllSellers`, `selectAllStores`, `distributeConversation` já existem no arquivo. Importar engines de `@/features/*` dentro de `src/mocks` já é o padrão — `distributeConversation` vem de `@/features/distribution/engine`.)

- [ ] **Step 2 (mock): aplicar o override após `distributeConversation`**

Dentro de `create()`, **logo após** a linha `const decision = distributeConversation(... );` (≈ linha 267) e **antes** de `const conversation: IConversation = { ... }` (≈ linha 269), inserir:

```ts
        // PRD-213: rotation queue is the source of the revezamento (boundary
        // contract w/ PRD-013). Carteira/especialidade keep upstream precedence.
        let effective = decision;
        let rotationPointers: { topRefId: string; memberByDept: Record<string, string> } | null = null;
        const rotationState = await rotationQueuesApi.getState(input.storeId);
        const sellersById = Object.fromEntries(sellers.map((s) => [s.id, s]));
        const override = applyRotationOverride(decision, rotationState, sellersById, new Date(occurredAt));
        effective = override.decision;
        rotationPointers = override.pointers;
```

Trocar, no objeto `conversation`, `decision.selectedSellerId`/`decision.status`/`decision.isSdrActive` por `effective.*`. No `trace`, usar `effective.selectedSellerId`, `effective.criterionMatched`, `effective.candidatesEvaluated`, `effective.mode`.

- [ ] **Step 3 (mock): persistir os ponteiros da fila**

Substituir o bloco de avanço do round-robin (≈ linhas 334-342) por:

```ts
        // Advance the rotation pointers when the queue took over; otherwise keep
        // the legacy round-robin cursor advance for non-governed cases.
        if (rotationPointers) {
          await rotationQueuesApi.update(input.storeId, { lastAssignedRefId: rotationPointers.topRefId });
          for (const [deptId, memberId] of Object.entries(rotationPointers.memberByDept)) {
            await rotationParticipantsApi.setMemberPointer(rotationState.queue.id, deptId, memberId);
          }
        } else if (effective.criterionMatched === "round_robin" && effective.selectedSellerId) {
          await settingsApi.update(input.storeId, {
            distribution: { ...settings, lastAssignedSellerId: effective.selectedSellerId },
          });
        }
```

- [ ] **Step 4 (supabase): replicar a integração**

Em `src/providers/data/impl/supabase/conversations.ts`, no método `create`, após `const decision = distributeConversation(...)`:
- importar `applyRotationOverride` de `@/features/rotation/engine/applyRotationOverride` e os providers supabase de rotation (`supabaseRotationQueuesProvider`, `supabaseRotationParticipantsProvider`) no topo.
- montar `sellersById` a partir do `sellers` já carregado.
- `const rotationState = await supabaseRotationQueuesProvider.getState(input.storeId);`
- `const override = applyRotationOverride(decision, rotationState, sellersById, new Date(occurredAt));`
- usar `override.decision` no insert da conversa e no trace.
- persistir ponteiros: se `override.pointers`, `await supabaseRotationQueuesProvider.update(input.storeId, { lastAssignedRefId: override.pointers.topRefId })` + loop `setMemberPointer`; senão, manter o avanço de `lastAssignedSellerId` existente.

- [ ] **Step 5: Verificar**

Run: `bun run test 2>&1 | tail -8` → Expected: suíte verde (engines + mock).
Run: `node node_modules/vite/bin/vite.js build` → Expected: build conclui.

Validação manual mock (descrita, não automatizada — o dono testa UI): em `mock`, criar conversa de rotina para cliente novo → atribuição segue a ordem da fila pulando offline; cliente com carteira → vai ao vendedor, fila não consultada.

- [ ] **Step 6: Commit**

```bash
git add src/mocks/api/conversations.ts src/providers/data/impl/supabase/conversations.ts
git commit -m "feat(rotation): consult queue as revezamento source in conversations.create"
```

---

## Task 10: Aba "Rodízio" na ficha do usuário

**Files:**
- Create: `src/features/rotation/components/RotationTab.tsx`
- Create: `src/features/rotation/index.ts` (barrel — exportar o que a UI/outros consomem)
- Modify: `src/features/admin-settings/components/SellerFormDialog.tsx`

**Interfaces:**
- Consumes: `ISeller`; `isSellerEligible` (Task 2).
- Produces: `RotationTab` controlada; barrel `@/features/rotation`.

- [ ] **Step 1: Criar o barrel `src/features/rotation/index.ts`**

```ts
export { selectNextFromRotation } from "./engine/selectNextFromRotation";
export { isSellerEligible } from "./engine/eligibility";
export { applyRotationOverride } from "./engine/applyRotationOverride";
export { RotationTab } from "./components/RotationTab";
export { RotationQueueManager } from "./components/RotationQueueManager";
export { RotationQueuePage } from "./pages/RotationQueuePage";
```

> Criar este barrel já; os componentes referenciados (Manager/Page) são adicionados nas Tasks 11-13. Para o commit da Task 10 compilar, comente as duas últimas linhas e descomente quando os arquivos existirem (ou crie stubs mínimos). **Recomendado:** deixar só as 4 primeiras linhas neste commit e adicionar Manager/Page nos commits das Tasks 11/13.

Versão para o commit da Task 10:
```ts
export { selectNextFromRotation } from "./engine/selectNextFromRotation";
export { isSellerEligible } from "./engine/eligibility";
export { applyRotationOverride } from "./engine/applyRotationOverride";
export { RotationTab } from "./components/RotationTab";
```

- [ ] **Step 2: Criar `RotationTab.tsx`** (controlada — estado no `SellerFormDialog`, salva no botão único)

```tsx
import { Switch } from "@/components/ui/switch";
import { Icon } from "@/components/Icon";
import type { ISeller } from "@/shared/types";
import { isSellerEligible } from "../engine/eligibility";

const SKIP_TEXT: Record<string, string> = {
  skipped_disabled: "Fora do rodízio (participação desligada).",
  skipped_offline: "Pulado agora — está offline.",
  skipped_inactive: "Pulado — usuário inativo.",
  skipped_off_hours: "Pulado agora — fora do horário de atendimento.",
};

interface IRotationTabProps {
  seller: ISeller;
  enabled: boolean;
  onEnabledChange: (next: boolean) => void;
}

/** Quick participation toggle + live eligibility hint (PRD-213 RF-019/020). */
export function RotationTab({ seller, enabled, onEnabledChange }: IRotationTabProps) {
  const status = isSellerEligible(seller, { enabled }, new Date());
  return (
    <div className="space-y-4">
      <label className="flex items-start justify-between gap-4 rounded-md border border-border bg-card px-4 py-3">
        <span>
          <span className="block text-sm font-medium text-foreground">Participa do rodízio</span>
          <span className="block text-xs text-muted-foreground">
            Quando ligado, este usuário entra na fila de atendimento da loja. A ordem é definida na
            tela do rodízio.
          </span>
        </span>
        <Switch
          checked={enabled}
          onCheckedChange={onEnabledChange}
          aria-label="Participa do rodízio"
        />
      </label>

      <div
        className="flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2.5 text-xs"
        role="status"
      >
        <Icon
          icon={status.eligible ? "mdi:check-circle-outline" : "mdi:information-outline"}
          size={16}
          className={status.eligible ? "mt-0.5 text-severity-success" : "mt-0.5 text-muted-foreground"}
        />
        <span className="text-muted-foreground">
          {status.eligible
            ? "Elegível agora — receberia atendimentos pelo rodízio."
            : (SKIP_TEXT[status.reason] ?? "Fora do rodízio no momento.")}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        A alteração é salva junto com o botão <span className="font-medium">Salvar alterações</span>.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Integrar no `SellerFormDialog.tsx`**

(a) Import (junto ao import de `@/features/access`):
```ts
import { RotationTab } from "@/features/rotation";
```
(b) Estado (após `scheduleErrors`):
```ts
  const [rotationEnabled, setRotationEnabled] = useState<boolean>(seller?.rotation?.enabled ?? true);
```
(c) No `useEffect` de re-sync (junto a `setScheduleOverrides`):
```ts
    setRotationEnabled(seller?.rotation?.enabled ?? true);
```
(d) No `mutationFn`, no ramo `isEdit`, incluir no patch do `provider.update`:
```ts
          rotation: { enabled: rotationEnabled },
```
e auditar a mudança (após o bloco `scheduleChanged`):
```ts
        if ((seller.rotation?.enabled ?? true) !== rotationEnabled) {
          recordAuditLogSync({
            storeId,
            actorId: currentUser?.sellerId ?? currentUser?.id ?? "system",
            action: "rotation_participation_updated",
            resource: "seller",
            resourceId: seller.id,
            before: { rotationEnabled: seller.rotation?.enabled ?? true },
            after: { rotationEnabled },
          });
        }
```
(e) Destravar a aba: substituir o bloco `<Tooltip>…<TabsTrigger value="rodizio" disabled …>` por um trigger ativo:
```tsx
                  <TabsTrigger value="rodizio" className="gap-1">
                    <Icon icon="mdi:account-switch-outline" size={13} />
                    Rodízio
                  </TabsTrigger>
```
(f) Substituir o `<TabsContent value="rodizio"><LockedTabPlaceholder /></TabsContent>` por:
```tsx
                  <TabsContent value="rodizio">
                    {isEdit && seller ? (
                      <RotationTab
                        seller={seller}
                        enabled={rotationEnabled}
                        onEnabledChange={setRotationEnabled}
                      />
                    ) : (
                      <div className="rounded-md border border-dashed border-border bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
                        Cadastre e salve o usuário primeiro para configurar o rodízio.
                      </div>
                    )}
                  </TabsContent>
```
(g) Remover `LockedTabPlaceholder` se ficar sem uso (ambas as abas agora têm conteúdo); se o ESLint acusar import/símbolo não usado, apagar a função.

- [ ] **Step 4: Verificar**

Run: `node node_modules/vite/bin/vite.js build` → Expected: build conclui.
Run: `bunx tsc --noEmit 2>&1 | grep -iE "SellerFormDialog|RotationTab"` → Expected: sem erro novo.

- [ ] **Step 5: Commit**

```bash
git add src/features/rotation/components/RotationTab.tsx src/features/rotation/index.ts src/features/admin-settings/components/SellerFormDialog.tsx
git commit -m "feat(rotation): Rodízio tab on the user editor (controlled, saved with the form)"
```

---

## Task 11: Tela de gestão — rota, página e manager base

**Files:**
- Create: `src/routes/app.configuracoes.rodizio.tsx`
- Create: `src/features/rotation/pages/RotationQueuePage.tsx`
- Create: `src/features/rotation/components/RotationQueueManager.tsx`
- Create: `src/features/rotation/hooks/useRotationQueueState.ts`
- Modify: `src/features/rotation/index.ts` (descomentar Manager/Page)

**Interfaces:**
- Consumes: `useRotationQueuesProvider`/`useRotationParticipantsProvider` (Task 7); `useSellersProvider`; `useCurrentStore`.
- Produces: rota `/app/configuracoes/rodizio`; `RotationQueueManager` com seletor de modo + lista (sem DnD ainda) + toggle + adicionar/remover.

- [ ] **Step 1: Hook `useRotationQueueState.ts`** (query do estado)

```ts
import { useQuery } from "@tanstack/react-query";
import { useRotationQueuesProvider } from "@/providers/data";

export function useRotationQueueState(storeId: string) {
  const provider = useRotationQueuesProvider();
  return useQuery({
    queryKey: ["rotation-queue-state", storeId],
    queryFn: () => provider.getState(storeId),
    enabled: Boolean(storeId),
  });
}
```

- [ ] **Step 2: Rota** (padrão de `app.configuracoes.departamentos.tsx`)

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { RotationQueuePage } from "@/features/rotation";

export const Route = createFileRoute("/app/configuracoes/rodizio")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, {
      resource: "seller",
      action: "edit",
      scope: "store",
    }),
  component: () => (
    <SettingsLayout>
      <RotationQueuePage />
    </SettingsLayout>
  ),
});
```

- [ ] **Step 3: `RotationQueuePage.tsx`** (container fino)

```tsx
import { RotationQueueManager } from "../components/RotationQueueManager";

export function RotationQueuePage() {
  return <RotationQueueManager />;
}
```

- [ ] **Step 4: `RotationQueueManager.tsx`** (base — modo + lista direct + toggle + add/remove)

Implementar com `useCurrentStore()` para o `storeId`, `useRotationQueueState(storeId)`, `useSellersProvider().list({ storeId, active: true })`, `useRotationParticipantsProvider()`, `useRotationQueuesProvider()`, `useMutation` + `queryClient.invalidateQueries({ queryKey: ["rotation-queue-state", storeId] })`. Conteúdo:
- Container `max-w-[1600px]`, header com título "Rodízio de atendimento" e subtítulo.
- **Seletor de `targetMode`**: `RadioGroup` com `direct` ("Por usuário") e `department` ("Por departamento"); `onValueChange` → `queuesProvider.update(storeId, { targetMode })` + invalidate.
- **Lista de participantes do topo** (`state.topParticipants`): cada linha mostra o nome (resolver via sellers/departments), um `Switch` de `enabled` (→ `participantsProvider.setEnabled(id, v)`), e um botão remover (→ `participantsProvider.remove(id)`). No modo `direct`, `refType='seller'`; no modo `department`, listar departamentos (Task 13 detalha os dois níveis — nesta task, renderizar a lista do topo conforme o modo, ainda sem navegação interna).
- **Adicionar participante**: um `Select` com os sellers (modo direct) / departamentos (modo department) ainda não presentes na fila + botão "Adicionar" (→ `participantsProvider.add({ queueId, refType, refId })`).
- Estados de loading/erro com skeleton/aviso. `cursor-pointer` nos clicáveis; `aria-label` nos ícones.

Código de referência (núcleo — modo direct):
```tsx
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Icon } from "@/components/Icon";
import { useCurrentStore } from "@/features/multistore";
import {
  useRotationParticipantsProvider,
  useRotationQueuesProvider,
  useSellersProvider,
} from "@/providers/data";
import { useRotationQueueState } from "../hooks/useRotationQueueState";

export function RotationQueueManager() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "";
  const queuesProvider = useRotationQueuesProvider();
  const participantsProvider = useRotationParticipantsProvider();
  const sellersProvider = useSellersProvider();
  const queryClient = useQueryClient();

  const stateQuery = useRotationQueueState(storeId);
  const sellersQuery = useQuery({
    queryKey: ["sellers", storeId],
    queryFn: () => sellersProvider.list({ storeId, active: true }),
    enabled: Boolean(storeId),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["rotation-queue-state", storeId] });

  const setMode = useMutation({
    mutationFn: (targetMode: "direct" | "department") =>
      queuesProvider.update(storeId, { targetMode }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error("Não foi possível trocar o modo", { description: e.message }),
  });

  const setEnabled = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      participantsProvider.setEnabled(id, enabled),
    onSuccess: () => invalidate(),
  });

  const addParticipant = useMutation({
    mutationFn: (refId: string) =>
      participantsProvider.add({ queueId: state!.queue.id, refType: "seller", refId }),
    onSuccess: () => invalidate(),
  });

  const removeParticipant = useMutation({
    mutationFn: (id: string) => participantsProvider.remove(id),
    onSuccess: () => invalidate(),
  });

  const state = stateQuery.data;
  const sellers = sellersQuery.data ?? [];
  const nameById = useMemo(
    () => Object.fromEntries(sellers.map((s) => [s.id, s.fullName])),
    [sellers],
  );
  const presentIds = new Set((state?.topParticipants ?? []).map((p) => p.refId));
  const addable = sellers.filter((s) => !presentIds.has(s.id));

  if (!storeId || stateQuery.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando rodízio…</div>;
  }
  if (!state) {
    return <div className="p-6 text-sm text-severity-critical">Não foi possível carregar a fila.</div>;
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-6">
      <header>
        <h1 className="text-lg font-semibold text-foreground">Rodízio de atendimento</h1>
        <p className="text-sm text-muted-foreground">
          Define a fila que distribui as conversas de rotina. Quem está offline ou fora do horário é
          pulado automaticamente.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-foreground">Direcionamento</h2>
        <RadioGroup
          value={state.queue.targetMode}
          onValueChange={(v) => setMode.mutate(v as "direct" | "department")}
          className="grid gap-2 sm:grid-cols-2"
        >
          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3">
            <RadioGroupItem value="direct" className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium text-foreground">Por usuário</span>
              <span className="block text-xs text-muted-foreground">A fila revezа entre usuários.</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3">
            <RadioGroupItem value="department" className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium text-foreground">Por departamento</span>
              <span className="block text-xs text-muted-foreground">
                A fila reveza entre departamentos e, dentro de cada um, entre os membros.
              </span>
            </span>
          </label>
        </RadioGroup>
      </section>

      {state.queue.targetMode === "direct" && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-foreground">Participantes</h2>
          <ul className="space-y-2">
            {state.topParticipants.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
              >
                <span className="text-sm text-foreground">{nameById[p.refId] ?? p.refId}</span>
                <span className="flex items-center gap-3">
                  <Switch
                    checked={p.enabled}
                    onCheckedChange={(enabled) => setEnabled.mutate({ id: p.id, enabled })}
                    aria-label={`Participação de ${nameById[p.refId] ?? p.refId}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remover do rodízio"
                    onClick={() => removeParticipant.mutate(p.id)}
                  >
                    <Icon icon="mdi:close" size={16} />
                  </Button>
                </span>
              </li>
            ))}
            {state.topParticipants.length === 0 && (
              <li className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                Nenhum participante. Adicione usuários abaixo.
              </li>
            )}
          </ul>

          {addable.length > 0 && (
            <div className="flex items-center gap-2">
              <Select onValueChange={(refId) => addParticipant.mutate(refId)}>
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="Adicionar usuário ao rodízio" />
                </SelectTrigger>
                <SelectContent>
                  {addable.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
```
> Corrigir o typo do RadioGroup ("revezа"/"reveza") para "reveza" ao digitar — texto pt-BR correto.

- [ ] **Step 5: Atualizar o barrel** — descomentar `RotationQueueManager` e `RotationQueuePage` no `src/features/rotation/index.ts`.

- [ ] **Step 6: Verificar**

Run: `node node_modules/vite/bin/vite.js build` → Expected: build conclui (o plugin regenera `routeTree.gen.ts`). Descartar `routeTree.gen.ts` se sujar e não for para commitar — porém aqui a rota é NOVA, então o `routeTree.gen.ts` muda legitimamente e **deve** ser commitado.

- [ ] **Step 7: Commit**

```bash
git add src/routes/app.configuracoes.rodizio.tsx src/features/rotation/pages/RotationQueuePage.tsx src/features/rotation/components/RotationQueueManager.tsx src/features/rotation/hooks/useRotationQueueState.ts src/features/rotation/index.ts src/routeTree.gen.ts
git commit -m "feat(rotation): management screen — mode selector, participants, add/remove"
```

---

## Task 12: Drag-and-drop (@dnd-kit) na lista

**Files:**
- Modify: `package.json` (deps `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`)
- Create: `src/features/rotation/components/SortableParticipantRow.tsx`
- Modify: `src/features/rotation/components/RotationQueueManager.tsx`

**Interfaces:**
- Consumes: `participantsProvider.reorder` (Task 7/8).
- Produces: lista ordenável por arrasto + teclado.

- [ ] **Step 1: Instalar @dnd-kit**

`@dnd-kit` é maduro (releases > 24h), aprovado no roteiro do épico — não precisa de `minimumReleaseAgeExcludes`.
Run: `bun add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
Expected: instala; `package.json`/`bun.lock` atualizados.

- [ ] **Step 2: `SortableParticipantRow.tsx`**

```tsx
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";

interface ISortableParticipantRowProps {
  id: string;
  label: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onRemove: () => void;
}

export function SortableParticipantRow({ id, label, enabled, onToggle, onRemove }: ISortableParticipantRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
    >
      <span className="flex items-center gap-2">
        <button
          type="button"
          className="cursor-grab text-muted-foreground hover:text-foreground"
          aria-label={`Reordenar ${label}`}
          {...attributes}
          {...listeners}
        >
          <Icon icon="mdi:drag-vertical" size={18} />
        </button>
        <span className="text-sm text-foreground">{label}</span>
      </span>
      <span className="flex items-center gap-3">
        <Switch checked={enabled} onCheckedChange={onToggle} aria-label={`Participação de ${label}`} />
        <Button type="button" variant="ghost" size="icon" aria-label="Remover do rodízio" onClick={onRemove}>
          <Icon icon="mdi:close" size={16} />
        </Button>
      </span>
    </li>
  );
}
```

- [ ] **Step 3: Envolver a lista com `DndContext` + `SortableContext` no Manager**

Imports:
```ts
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { SortableParticipantRow } from "./SortableParticipantRow";
```
Sensores (dentro do componente):
```ts
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const reorder = useMutation({
    mutationFn: (ids: string[]) => participantsProvider.reorder(ids),
    onSuccess: () => invalidate(),
  });
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = state!.topParticipants.map((p) => p.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    reorder.mutate(arrayMove(ids, oldIndex, newIndex));
  }
```
Substituir a `<ul>` da lista direct por:
```tsx
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={state.topParticipants.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                <ul className="space-y-2">
                  {state.topParticipants.map((p) => (
                    <SortableParticipantRow
                      key={p.id}
                      id={p.id}
                      label={nameById[p.refId] ?? p.refId}
                      enabled={p.enabled}
                      onToggle={(enabled) => setEnabled.mutate({ id: p.id, enabled })}
                      onRemove={() => removeParticipant.mutate(p.id)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
```
(O empty-state e o seletor "adicionar" permanecem.)

- [ ] **Step 4: Verificar**

Run: `node node_modules/vite/bin/vite.js build` → Expected: build conclui.

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock src/features/rotation/components/SortableParticipantRow.tsx src/features/rotation/components/RotationQueueManager.tsx
git commit -m "feat(rotation): drag-and-drop ordering with keyboard support (@dnd-kit)"
```

---

## Task 13: Visão ao vivo + modo department (dois níveis)

**Files:**
- Create: `src/features/rotation/hooks/useRotationLivePreview.ts`
- Create: `src/features/rotation/components/RotationLiveView.tsx`
- Modify: `src/features/rotation/components/RotationQueueManager.tsx` (montar a visão ao vivo + navegação dept)

**Interfaces:**
- Consumes: `selectNextFromRotation` (Task 3); `useRotationQueueState` (Task 11); `useSellersProvider`, `useDepartmentsProvider`.
- Produces: `RotationLiveView`; navegação de dois níveis no modo department.

- [ ] **Step 1: `useRotationLivePreview.ts`** (roda o engine em runtime)

```ts
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IRotationQueueState, ISeller } from "@/shared/types";
import { useSellersProvider } from "@/providers/data";
import { selectNextFromRotation } from "../engine/selectNextFromRotation";

export function useRotationLivePreview(storeId: string, state: IRotationQueueState | undefined) {
  const sellersProvider = useSellersProvider();
  const sellersQuery = useQuery({
    queryKey: ["sellers", storeId],
    queryFn: () => sellersProvider.list({ storeId }),
    enabled: Boolean(storeId),
  });

  return useMemo(() => {
    if (!state) return null;
    const sellers = sellersQuery.data ?? [];
    const sellersById: Record<string, ISeller> = Object.fromEntries(sellers.map((s) => [s.id, s]));
    const result = selectNextFromRotation({
      queue: state.queue,
      participants: state.topParticipants,
      membersByDepartment: state.membersByDepartment,
      sellersById,
      now: new Date(),
    });
    return { result, sellersById };
  }, [state, sellersQuery.data]);
}
```

- [ ] **Step 2: `RotationLiveView.tsx`**

```tsx
import type { IRotationSelectionResult, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";

const REASON_LABEL: Record<string, string> = {
  selected: "Próximo",
  skipped_offline: "Offline",
  skipped_disabled: "Desligado",
  skipped_inactive: "Inativo",
  skipped_off_hours: "Fora do horário",
};

interface IRotationLiveViewProps {
  result: IRotationSelectionResult;
  sellersById: Record<string, ISeller>;
}

export function RotationLiveView({ result, sellersById }: IRotationLiveViewProps) {
  const nextName = result.selectedSellerId
    ? (sellersById[result.selectedSellerId]?.fullName ?? result.selectedSellerId)
    : null;
  return (
    <section className="space-y-3 rounded-md border border-border bg-muted/20 p-4" aria-label="Visão ao vivo do rodízio">
      <h2 className="text-sm font-medium text-foreground">Agora</h2>
      <p className="text-sm">
        {nextName ? (
          <>Próximo a receber: <span className="font-semibold text-foreground">{nextName}</span></>
        ) : (
          <span className="text-muted-foreground">Ninguém elegível agora — conversas seguem para o fallback (SDR/fila).</span>
        )}
      </p>
      <ul className="space-y-1">
        {result.candidates.map((c, i) => (
          <li key={`${c.refId}-${i}`} className="flex items-center justify-between text-xs">
            <span className="text-foreground">
              {c.refType === "seller" ? (sellersById[c.refId]?.fullName ?? c.refId) : c.refId}
            </span>
            <span className={c.selected ? "flex items-center gap-1 text-severity-success" : "text-muted-foreground"}>
              {c.selected && <Icon icon="mdi:arrow-right-bold" size={14} />}
              {REASON_LABEL[c.reason] ?? c.reason}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 3: Montar a visão ao vivo e a navegação de dois níveis no Manager**

- Importar `useRotationLivePreview`, `RotationLiveView`, `useDepartmentsProvider`.
- Após a seção de participantes, montar `const preview = useRotationLivePreview(storeId, state);` e renderizar `{preview && <RotationLiveView result={preview.result} sellersById={preview.sellersById} />}`.
- **Modo department:** quando `state.queue.targetMode === 'department'`, a lista do topo são **departamentos** (`refType='department'`); resolver o nome via `useDepartmentsProvider().list({ storeId })`. Adicionar um estado `const [openDept, setOpenDept] = useState<string | null>(null)`; cada linha de departamento tem um botão "Membros" que faz `setOpenDept(p.refId)`. Quando `openDept` está setado, renderizar uma sub-lista (DnD própria) com `state.membersByDepartment[openDept]` — mesma `SortableParticipantRow`, mas `add`/`reorder`/`setEnabled` usando `scopeDepartmentId: openDept`. O `add` de membro: `participantsProvider.add({ queueId, scopeDepartmentId: openDept, refType: "seller", refId })` com os sellers do departamento (`sellers.filter(s => s.departmentId === openDept)`). Reorder de membros usa os ids da sub-lista.
- Adicionar departamento ao topo: `Select` com departamentos ainda não presentes + `add({ queueId, refType: "department", refId: deptId })`.

Código de referência (núcleo do modo department):
```tsx
{state.queue.targetMode === "department" && (
  <section className="space-y-3">
    <h2 className="text-sm font-medium text-foreground">Departamentos na fila</h2>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={state.topParticipants.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2">
          {state.topParticipants.map((p) => (
            <li key={p.id} className="rounded-md border border-border bg-card">
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-sm text-foreground">{deptNameById[p.refId] ?? p.refId}</span>
                <span className="flex items-center gap-3">
                  <Switch checked={p.enabled} onCheckedChange={(enabled) => setEnabled.mutate({ id: p.id, enabled })} aria-label={`Participação de ${deptNameById[p.refId] ?? p.refId}`} />
                  <Button type="button" variant="ghost" size="sm" onClick={() => setOpenDept(openDept === p.refId ? null : p.refId)}>
                    Membros
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label="Remover departamento" onClick={() => removeParticipant.mutate(p.id)}>
                    <Icon icon="mdi:close" size={16} />
                  </Button>
                </span>
              </div>
              {openDept === p.refId && (
                <div className="border-t border-border px-3 py-2">
                  {/* sub-list of (state.membersByDepartment[p.refId] ?? []) with its own DnD + add member */}
                </div>
              )}
            </li>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  </section>
)}
```
> Para a sub-lista de membros, usar uma segunda `DndContext`/`SortableContext` e um `handleDragEnd` que chama `participantsProvider.reorder` com os ids dos membros daquele departamento. Manter `aria-label` e `cursor-pointer`. (Mantém DRY reutilizando `SortableParticipantRow`.)

- [ ] **Step 4: Verificar**

Run: `node node_modules/vite/bin/vite.js build` → Expected: build conclui.
Run: `bun run test src/features/rotation` → Expected: engines verdes.

- [ ] **Step 5: Commit**

```bash
git add src/features/rotation/hooks/useRotationLivePreview.ts src/features/rotation/components/RotationLiveView.tsx src/features/rotation/components/RotationQueueManager.tsx
git commit -m "feat(rotation): live view + department two-level navigation"
```

---

## Task 14: Link cruzado, docs e release

**Files:**
- Modify: `src/features/distribution/pages/DistributionRulesPanel.tsx` (link para o rodízio)
- Create: `docs/dev/rotation-queue.md`
- Modify: `CHANGELOG.md`, `CLAUDE.md`, `package.json`
- Rename: `docs/prds/PRD-213-rodizio-fila-atendimento.md` → `..._DONE.md` (preencher Status)

**Interfaces:**
- Consumes: tudo acima.
- Produces: release MINOR; PRD `_DONE`.

- [ ] **Step 1: Link cruzado na tela de Distribuição**

Em `DistributionRulesPanel.tsx`, adicionar um aviso/atalho (no topo da página, abaixo do header) com `Link` do TanStack Router:
```tsx
import { Link } from "@tanstack/react-router";
// ...
<Link
  to="/app/configuracoes/rodizio"
  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
>
  <Icon icon="mdi:account-switch-outline" size={16} />
  Gerenciar a fila de rodízio
</Link>
```
(Posicionar onde fizer sentido visual; confirmar que `Icon` já está importado.)

- [ ] **Step 2: Criar `docs/dev/rotation-queue.md`**

Documentar: modelo (fila por loja, participantes, dois escopos), os engines (`selectNextFromRotation`, `eligibility`, `applyRotationOverride`), o contrato de fronteira com o PRD-013 (ponto único em `conversations.create`; carteira/especialidade a montante; trace reaproveitando `round_robin`), o fato de o **webhook real não ser tocado** (ativação futura exige presença server-side), a tela `/app/configuracoes/rodizio` e a aba na ficha. Mock-first + paridade Supabase. Tabelas + RLS.

- [ ] **Step 3: Bump de versão + CHANGELOG**

- `package.json`: bump MINOR (`0.99.0` → `0.100.0`). Confirmar o número atual antes (ler `package.json`).
- `CHANGELOG.md`: nova seção `## [0.100.0] — <Codinome inédito> · 2026-06-16` com linguagem acessível ao usuário:
  - **Added:** fila de rodízio de atendimento por loja; ordenação por arrasto; liga/desliga de participação por usuário; pulo automático de quem está offline/fora do horário; modo por usuário ou por departamento; visão ao vivo de quem é o próximo; aba "Rodízio" no cadastro de usuário.
  - **Changed:** conversas de rotina passam a ser distribuídas pela fila no ponto de criação (carteira/especialidade continuam com prioridade).
- Codinome inédito (não "Relay"/"Keyring"/já usados). Sugestões: "Carousel", "Roundabout", "Lineup", "Turnstile". Escolher um.

- [ ] **Step 4: Atualizar `CLAUDE.md`**

- Trocar o codinome/versão atuais (`Shift`/v0.99.0) pelo novo na linha de codinome e **acrescentar** `, \`v0.100.0\` <Codinome>` à lista de tags.
- Acrescentar um parágrafo curto de estado do PRD-213 (fila de rodízio: feature `src/features/rotation/`, engines puros, integração em `conversations.create`, webhook intocado/ativação deferida, tela `/app/configuracoes/rodizio`, aba Rodízio, migration das 2 tabelas).

- [ ] **Step 5: Renomear o PRD e preencher Status**

```bash
git mv docs/prds/PRD-213-rodizio-fila-atendimento.md docs/prds/PRD-213-rodizio-fila-atendimento_DONE.md
```
Preencher a seção "Status de Implementação": ✅ CONCLUÍDO, versão v0.100.0 <Codinome>, observação sobre ativação no webhook deferida (server-side presence).

- [ ] **Step 6: Verificar build + testes finais**

Run: `node scripts/copy-changelog.mjs && node node_modules/vite/bin/vite.js build` → Expected: build conclui (changelog copiado para `public/`).
Run: `bun run test 2>&1 | tail -8` → Expected: suíte verde.

- [ ] **Step 7: Commit**

```bash
git add src/features/distribution/pages/DistributionRulesPanel.tsx docs/dev/rotation-queue.md CHANGELOG.md CLAUDE.md package.json docs/prds/PRD-213-rodizio-fila-atendimento_DONE.md public/CHANGELOG.md
git commit -m "docs(rotation): cross-link, feature docs and v0.100.0 release notes"
```

> **Migration em produção:** a aplicação de `20260616XXXXXX_rotation_queues.sql` em prod via MCP `apply_migration` acontece **somente sob autorização nominal explícita do dono**, após o smoke em mock. Sem o OK, a feature roda em mock; em supabase, `getState` cria a fila vazia on-demand assim que as tabelas existirem.

---

## Notas de execução (todas as tasks)

- **Webhook intocado:** nenhuma task altera `src/providers/whatsapp/webhook/core.ts`. A fila só atua em `conversations.create()`.
- **`routeTree.gen.ts`:** muda legitimamente só na Task 11 (rota nova) — commitar ali. Em outras tasks, se o dev server sujar o arquivo, `git checkout -- src/routeTree.gen.ts` antes de commitar.
- **Migration → prod:** versionada na Task 8; aplicada em prod só na validação final sob OK nominal do dono.
- **Validação manual de UI:** o dono testa a UI manualmente — não abrir browser/devtools para validar. Reportar o que foi feito e o gate (build + testes).
