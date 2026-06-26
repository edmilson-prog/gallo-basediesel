# PRD-212 — Horário de Atendimento + Enforcement de Acesso — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a cada usuário uma agenda semanal de atendimento (`workSchedule`) que controla o acesso à plataforma — bloqueia o login de papéis operacionais fora da janela, isenta Owner/Gestor, apenas avisa quando a janela fecha durante a sessão, joga o usuário para `offline` fora do turno, e oferece liberação temporária de emergência auditada.

**Architecture:** Lógica de horário 100% **pura e testável** (timezone `America/Sao_Paulo` por offset fixo −03:00, Brasil sem DST desde 2019) numa feature nova `src/features/access/engine/`. A decisão de acesso é uma função pura `evaluateAccess`. O **gate de login (client-side)** é orquestrado na **rota de login** após `signInWithPassword` (a camada de auth não pode importar `@/mocks`/factory por ESLint; a rota tem acesso aos hooks de provider). O **enforcement server-side real fica DEFERIDO** (decisão do dono — login é 100% client-side via `supabase.auth`, gate server-side exigiria Auth Hook em produção com risco de trancar acesso). A persistência segue o padrão drop-in: mock primeiro, depois camada Supabase (migration versionada, **aplicada em prod só sob autorização nominal do dono**).

**Tech Stack:** React 19, TanStack Router/Query, Zustand (mock store), shadcn/ui + Tailwind v4, Vitest, Supabase (jsonb columns), `date-fns` já presente (sem `date-fns-tz` — usamos offset fixo).

---

## Premissas e decisões já fechadas

- **Papéis operacionais (bloqueáveis):** `Vendedor`, `VendedorExterno`, `SDR`, `Financeiro`. **Isentos:** `Owner`, `Gestor`. **N/A:** `Cliente` (sem `workSchedule`).
- **Gate server-side (Fase 2 do PRD): DEFERIDO** para tarefa própria com decisão dedicada. Esta entrega faz o gate **client-side completo** (o PRD chama de "Fase 1 suficiente para validar UX e regra").
- **Migration em produção:** mock-first; migration escrita em `supabase/migrations/` (espelho), **aplicada em prod somente sob autorização nominal** — não aplicar durante a implementação.
- **Override de emergência (grant):** concedido pelo Owner na tela de usuários (Owner-only hoje). Helper `canGrantAccess(actor, target)` já prevê Gestor-do-departamento para quando a rota abrir a Gestor.
- **Sessão restaurada (getSession) NÃO é bloqueada** — só o login explícito passa pelo gate; sessão em andamento recebe o banner (princípio "não expulsar no meio").

## Convenções para o executor (constraints do projeto — obrigatórias)

- **Nunca** `git add -A` / `git add .` — adicionar arquivos por nome.
- **`vite.config.ts` NUNCA é commitado** (modificação local intencional). `src/routeTree.gen.ts` é gerado — se sujar o working tree, `git checkout -- src/routeTree.gen.ts` (não commitar salvo se rota nova).
- Ignorar completamente qualquer diretório `worktrees`.
- Testes: `bun run test`. Build: `bun run build`; se falhar com erro de remap de bin do bun, usar `node scripts/copy-changelog.mjs && node node_modules/vite/bin/vite.js build`. Type-check de delta: `bunx tsc --noEmit` (há baseline pré-existente; avaliar só os arquivos novos).
- UI/conteúdo em **português do Brasil com acentos**. Código/comentários em inglês.
- Telas novas seguem `docs/dev/ux-guidelines.md`.
- Commits Conventional Commits, atômicos, terminando com:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## File Structure

**Criar:**
- `src/features/access/engine/workSchedule.ts` — helpers puros de horário (timezone, dentro-da-janela, próximo-início, validação).
- `src/features/access/engine/workSchedule.test.ts`
- `src/features/access/engine/accessGate.ts` — `evaluateAccess` + `OPERATIONAL_ROLES` + `canGrantAccess`.
- `src/features/access/engine/accessGate.test.ts`
- `src/features/access/hooks/useAccessGate.ts` — orquestra a decisão na rota de login (busca o seller via provider).
- `src/features/access/hooks/useOutsideHoursWatcher.ts` — timer de sessão + auto-offline.
- `src/features/access/components/WorkScheduleTab.tsx` — editor da aba "Horário" (agenda semanal + exceções + grant).
- `src/features/access/components/AccessBlockedNotice.tsx` — bloco de bloqueio por horário na tela de login.
- `src/features/access/components/OutsideHoursBanner.tsx` — banner persistente de sessão.
- `src/features/access/components/GrantAccessDialog.tsx` — liberação temporária de emergência.
- `src/features/access/index.ts` — barrel.
- `supabase/migrations/<timestamp>_sellers_work_schedule.sql` — colunas jsonb.
- `docs/dev/work-schedule-access.md` — doc da feature.

**Modificar:**
- `src/shared/types/people.ts` — tipos novos + campos em `ISeller`.
- `src/providers/data/impl/supabase/sellers.ts` — `SellerRow`/`COLUMNS`/`rowToSeller`/`sellerPatchToRow`.
- `src/features/auth/authContext.ts` — `IAuthResult.blocked`.
- `src/features/admin-settings/components/SellerFormDialog.tsx` — destravar aba "Horário" + montar `WorkScheduleTab`.
- `src/routes/auth.login.tsx` — rodar o gate após login; render do bloqueio.
- `src/features/shell/layouts/AppLayout.tsx` — montar `<OutsideHoursBanner/>`.
- `src/features/distribution/components/AvailabilityToggle.tsx` (ou onde a disponibilidade é exibida) — rótulo "offline — fora do horário" (derivado).

---

## Task 1 — Tipos do domínio (workSchedule, overrides, grant)

**Files:**
- Modify: `src/shared/types/people.ts`

- [ ] **Step 1: Adicionar os tipos e os campos em `ISeller`**

Em `src/shared/types/people.ts`, logo após a definição de `SellerAvailability` (linha 8), adicionar:

```ts
/**
 * One attendance window within a weekday (PRD-212). Mirrors the shape of
 * IBusinessHoursWindow (PRD-013) but applies PER USER and governs ACCESS,
 * not store distribution. Times are São Paulo wall-clock ("HH:mm").
 */
export interface IWorkScheduleWindow {
  /** 0=Sunday … 6=Saturday (JS getDay convention, São Paulo calendar). */
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  openAt: string; // "08:00"
  closeAt: string; // "18:00"
  enabled: boolean;
}

/** Weekly attendance schedule. Absent/empty = NO restriction (free access). */
export type IWorkSchedule = IWorkScheduleWindow[];

/** One-off date exception that overrides the weekly rule on that day. */
export interface IScheduleOverride {
  /** São Paulo calendar day, "YYYY-MM-DD". */
  date: string;
  /** `block` = closed that day; `allow` = open (optionally a partial window). */
  type: "block" | "allow";
  reason?: string;
  /** For `allow`: optional window; omitted = the whole day is allowed. */
  openAt?: string;
  closeAt?: string;
}

/** Temporary emergency access grant (override de emergência, PRD-212). */
export interface IAccessGrant {
  /** Seller id of the granter (Owner/Gestor). */
  grantedBy: ID;
  grantedAt: ISO8601;
  /** While `now < expiresAt`, login is allowed regardless of schedule. */
  expiresAt: ISO8601;
  reason?: string;
}
```

Em `ISeller`, logo após `rotation?: { enabled: boolean };` (linha 72), adicionar:

```ts
  /** Per-user attendance schedule governing access (PRD-212). */
  workSchedule?: IWorkSchedule;
  /** One-off date exceptions to the weekly schedule (PRD-212). */
  scheduleOverrides?: IScheduleOverride[];
  /** Active temporary emergency access grant; null/absent = none (PRD-212). */
  accessGrant?: IAccessGrant | null;
```

- [ ] **Step 2: Confirmar que o barrel reexporta os tipos**

Verificar `src/shared/types/index.ts` — `people.ts` já é reexportado (`export * from "./people"` ou similar). Se sim, nada a fazer; os novos tipos saem automaticamente.

- [ ] **Step 3: Build check**

Run: `bunx tsc --noEmit 2>&1 | grep -E "people.ts|workSchedule|IWorkSchedule" || echo "sem erros novos nos tipos"`
Expected: nenhum erro novo referente aos tipos adicionados.

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/people.ts
git commit -m "feat(access): work schedule, overrides and emergency grant types (PRD-212)"
```

---

## Task 2 — Helpers puros de horário (timezone São Paulo)

**Files:**
- Create: `src/features/access/engine/workSchedule.ts`
- Test: `src/features/access/engine/workSchedule.test.ts`

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `src/features/access/engine/workSchedule.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { IWorkSchedule, IScheduleOverride } from "@/shared/types";
import {
  saoPauloParts,
  isWithinWorkSchedule,
  getNextOpenAt,
  validateWorkSchedule,
} from "./workSchedule";

// América/São Paulo é fixo em -03:00 (Brasil sem horário de verão desde 2019).
const ALL_WEEK_8_18: IWorkSchedule = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday: weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6,
  openAt: "08:00",
  closeAt: "18:00",
  enabled: true,
}));

describe("saoPauloParts", () => {
  it("converts a UTC instant to São Paulo wall clock regardless of device TZ", () => {
    // 2026-06-16T12:00:00Z → 09:00 -03:00, terça-feira (weekday 2)
    const p = saoPauloParts(new Date("2026-06-16T12:00:00Z"));
    expect(p.weekday).toBe(2);
    expect(p.minutes).toBe(9 * 60);
    expect(p.ymd).toBe("2026-06-16");
  });

  it("keeps the same calendar day for an evening instant", () => {
    // 2026-06-16T23:30:00Z → 20:30 -03:00, ainda terça
    const p = saoPauloParts(new Date("2026-06-16T23:30:00Z"));
    expect(p.weekday).toBe(2);
    expect(p.minutes).toBe(20 * 60 + 30);
    expect(p.ymd).toBe("2026-06-16");
  });
});

describe("isWithinWorkSchedule", () => {
  it("returns true inside an enabled window", () => {
    expect(
      isWithinWorkSchedule({ workSchedule: ALL_WEEK_8_18 }, new Date("2026-06-16T12:00:00Z")),
    ).toBe(true);
  });

  it("returns false outside the window", () => {
    expect(
      isWithinWorkSchedule({ workSchedule: ALL_WEEK_8_18 }, new Date("2026-06-16T23:30:00Z")),
    ).toBe(false);
  });

  it("treats absent/empty schedule as no restriction (always within)", () => {
    expect(isWithinWorkSchedule({}, new Date("2026-06-16T23:30:00Z"))).toBe(true);
    expect(
      isWithinWorkSchedule({ workSchedule: [] }, new Date("2026-06-16T23:30:00Z")),
    ).toBe(true);
  });

  it("a `block` override closes a day that the weekly rule would open", () => {
    const overrides: IScheduleOverride[] = [{ date: "2026-06-16", type: "block" }];
    expect(
      isWithinWorkSchedule(
        { workSchedule: ALL_WEEK_8_18, scheduleOverrides: overrides },
        new Date("2026-06-16T12:00:00Z"),
      ),
    ).toBe(false);
  });

  it("an `allow` override opens a day with no weekly window", () => {
    const overrides: IScheduleOverride[] = [{ date: "2026-06-16", type: "allow" }];
    expect(
      isWithinWorkSchedule(
        { workSchedule: [], scheduleOverrides: overrides },
        new Date("2026-06-16T12:00:00Z"),
      ),
    ).toBe(true);
  });
});

describe("getNextOpenAt", () => {
  it("returns the next window start as an ISO instant", () => {
    // Terça 20:30 SP, agenda 08–18 todos os dias → próximo = quarta 08:00 SP = 11:00Z
    const next = getNextOpenAt({ workSchedule: ALL_WEEK_8_18 }, new Date("2026-06-16T23:30:00Z"));
    expect(next).toBe("2026-06-17T11:00:00.000Z");
  });

  it("returns null when there is no schedule", () => {
    expect(getNextOpenAt({}, new Date("2026-06-16T23:30:00Z"))).toBeNull();
  });
});

describe("validateWorkSchedule", () => {
  it("flags closeAt <= openAt", () => {
    const errors = validateWorkSchedule([
      { weekday: 1, openAt: "18:00", closeAt: "08:00", enabled: true },
    ]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("flags overlapping windows on the same weekday", () => {
    const errors = validateWorkSchedule([
      { weekday: 1, openAt: "08:00", closeAt: "12:00", enabled: true },
      { weekday: 1, openAt: "11:00", closeAt: "15:00", enabled: true },
    ]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("accepts non-overlapping windows on the same weekday (manhã + tarde)", () => {
    const errors = validateWorkSchedule([
      { weekday: 1, openAt: "08:00", closeAt: "12:00", enabled: true },
      { weekday: 1, openAt: "13:00", closeAt: "18:00", enabled: true },
    ]);
    expect(errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test src/features/access/engine/workSchedule.test.ts`
Expected: FAIL (módulo não existe ainda).

- [ ] **Step 3: Implementar `workSchedule.ts`**

Criar `src/features/access/engine/workSchedule.ts`:

```ts
import type { IWorkSchedule, IWorkScheduleWindow, IScheduleOverride } from "@/shared/types";

/**
 * América/São Paulo timezone helpers (PRD-212).
 *
 * Brazil has had **no daylight saving time since 2019**, so São Paulo is a
 * fixed UTC-03:00 offset. We rely on that fixed offset (180 min) instead of
 * pulling in `date-fns-tz`, which keeps the math trivial, dependency-free and
 * fully deterministic. If Brazil ever reinstates DST this module must change.
 */
const SAO_PAULO_OFFSET_MINUTES = 180;

export interface IScheduleSource {
  workSchedule?: IWorkSchedule;
  scheduleOverrides?: IScheduleOverride[];
}

/** Parse "HH:mm" into minutes since midnight. Returns NaN on bad input. */
function timeToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return Number.NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return Number.NaN;
  return hours * 60 + minutes;
}

/** São Paulo wall-clock parts of `date`, independent of the device timezone. */
export function saoPauloParts(date: Date): { weekday: number; minutes: number; ymd: string } {
  const shifted = new Date(date.getTime() - SAO_PAULO_OFFSET_MINUTES * 60_000);
  return {
    weekday: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    ymd: shifted.toISOString().slice(0, 10),
  };
}

/** Builds a UTC ISO instant from São Paulo wall-clock components. */
function saoPauloInstant(ymd: string, minutesOfDay: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const hour = Math.floor(minutesOfDay / 60);
  const minute = minutesOfDay % 60;
  const ms = Date.UTC(y, m - 1, d, hour, minute) + SAO_PAULO_OFFSET_MINUTES * 60_000;
  return new Date(ms).toISOString();
}

/** Enabled windows for a given weekday. */
function windowsForWeekday(schedule: IWorkSchedule, weekday: number): IWorkScheduleWindow[] {
  return schedule.filter((w) => w.enabled && w.weekday === weekday);
}

/**
 * True when `date` falls inside the user's attendance schedule in São Paulo
 * time. Absent/empty schedule = no restriction (always true). A `block`
 * override closes the day; an `allow` override opens it (whole day, or a
 * partial window if openAt/closeAt are set). Windows spanning midnight are NOT
 * supported (matches the existing business-hours editor).
 */
export function isWithinWorkSchedule(source: IScheduleSource, date: Date): boolean {
  const schedule = source.workSchedule ?? [];
  const overrides = source.scheduleOverrides ?? [];
  const { weekday, minutes, ymd } = saoPauloParts(date);

  // No schedule at all and no allow override = unrestricted.
  if (schedule.length === 0 && overrides.length === 0) return true;

  const override = overrides.find((o) => o.date === ymd);
  if (override) {
    if (override.type === "block") return false;
    // allow: full day unless a partial window is given.
    const open = override.openAt ? timeToMinutes(override.openAt) : 0;
    const close = override.closeAt ? timeToMinutes(override.closeAt) : 24 * 60;
    if (Number.isNaN(open) || Number.isNaN(close)) return true;
    return minutes >= open && minutes < close;
  }

  // No weekly schedule and no matching override → unrestricted.
  if (schedule.length === 0) return true;

  for (const win of windowsForWeekday(schedule, weekday)) {
    const open = timeToMinutes(win.openAt);
    const close = timeToMinutes(win.closeAt);
    if (Number.isNaN(open) || Number.isNaN(close)) continue;
    if (minutes >= open && minutes < close) return true;
  }
  return false;
}

/**
 * Next window-start instant (ISO8601) strictly after `date`, scanning up to 7
 * days ahead and honouring overrides. Returns null when there is no schedule
 * (i.e. access is unrestricted, so there is nothing to "wait for").
 */
export function getNextOpenAt(source: IScheduleSource, date: Date): string | null {
  const schedule = source.workSchedule ?? [];
  const overrides = source.scheduleOverrides ?? [];
  if (schedule.length === 0 && overrides.length === 0) return null;

  const start = saoPauloParts(date);
  for (let offset = 0; offset <= 7; offset += 1) {
    // Compute the São Paulo calendar day at `offset` days from `start.ymd`.
    const [y, m, d] = start.ymd.split("-").map(Number);
    const dayUtc = new Date(Date.UTC(y, m - 1, d + offset));
    const ymd = dayUtc.toISOString().slice(0, 10);
    const weekday = dayUtc.getUTCDay();
    const minFloor = offset === 0 ? start.minutes : -1;

    const override = overrides.find((o) => o.date === ymd);
    let candidates: number[] = [];
    if (override) {
      if (override.type === "block") continue;
      candidates = [override.openAt ? timeToMinutes(override.openAt) : 0];
    } else {
      candidates = windowsForWeekday(schedule, weekday)
        .map((w) => timeToMinutes(w.openAt))
        .filter((n) => !Number.isNaN(n));
    }
    const next = candidates
      .filter((open) => open > minFloor)
      .sort((a, b) => a - b)[0];
    if (next !== undefined) return saoPauloInstant(ymd, next);
  }
  return null;
}

/** Returns validation errors (pt-BR) for a weekly schedule; [] when valid. */
export function validateWorkSchedule(schedule: IWorkSchedule): string[] {
  const errors: string[] = [];
  for (const win of schedule) {
    if (!win.enabled) continue;
    const open = timeToMinutes(win.openAt);
    const close = timeToMinutes(win.closeAt);
    if (Number.isNaN(open) || Number.isNaN(close)) {
      errors.push("Horário inválido em uma das janelas.");
      continue;
    }
    if (close <= open) {
      errors.push("O horário de término deve ser maior que o de início.");
    }
  }
  // Overlap detection per weekday.
  for (let weekday = 0; weekday <= 6; weekday += 1) {
    const wins = windowsForWeekday(schedule, weekday)
      .map((w) => ({ open: timeToMinutes(w.openAt), close: timeToMinutes(w.closeAt) }))
      .filter((w) => !Number.isNaN(w.open) && !Number.isNaN(w.close) && w.close > w.open)
      .sort((a, b) => a.open - b.open);
    for (let i = 1; i < wins.length; i += 1) {
      if (wins[i].open < wins[i - 1].close) {
        errors.push("Há janelas sobrepostas no mesmo dia.");
        break;
      }
    }
  }
  return errors;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun run test src/features/access/engine/workSchedule.test.ts`
Expected: PASS (todos os casos).

- [ ] **Step 5: Commit**

```bash
git add src/features/access/engine/workSchedule.ts src/features/access/engine/workSchedule.test.ts
git commit -m "feat(access): pure work-schedule helpers with São Paulo timezone (PRD-212)"
```

---

## Task 3 — Decisão de acesso pura (`evaluateAccess`)

**Files:**
- Create: `src/features/access/engine/accessGate.ts`
- Test: `src/features/access/engine/accessGate.test.ts`

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `src/features/access/engine/accessGate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { IWorkSchedule } from "@/shared/types";
import { evaluateAccess, canGrantAccess, OPERATIONAL_ROLES } from "./accessGate";

const WEEKDAY_8_18: IWorkSchedule = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday: weekday as 1 | 2 | 3 | 4 | 5,
  openAt: "08:00",
  closeAt: "18:00",
  enabled: true,
}));

const tuesdayMorning = new Date("2026-06-16T12:00:00Z"); // 09:00 SP, terça
const tuesdayNight = new Date("2026-06-16T23:30:00Z"); // 20:30 SP, terça

describe("evaluateAccess", () => {
  it("blocks an operational role outside the window", () => {
    const d = evaluateAccess({
      role: "Vendedor",
      active: true,
      workSchedule: WEEKDAY_8_18,
      now: tuesdayNight,
    });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("outside_hours");
    expect(d.nextOpenAt).toBeTruthy();
  });

  it("allows an operational role inside the window", () => {
    const d = evaluateAccess({
      role: "Vendedor",
      active: true,
      workSchedule: WEEKDAY_8_18,
      now: tuesdayMorning,
    });
    expect(d.allowed).toBe(true);
    expect(d.reason).toBe("ok");
  });

  it("always allows Owner and Gestor regardless of hours", () => {
    for (const role of ["Owner", "Gestor"] as const) {
      const d = evaluateAccess({ role, active: true, workSchedule: WEEKDAY_8_18, now: tuesdayNight });
      expect(d.allowed).toBe(true);
    }
  });

  it("treats no schedule as unrestricted for operationals", () => {
    const d = evaluateAccess({ role: "SDR", active: true, now: tuesdayNight });
    expect(d.allowed).toBe(true);
  });

  it("a suspended/inactive user is blocked even inside the window", () => {
    const d = evaluateAccess({
      role: "Vendedor",
      active: false,
      workSchedule: WEEKDAY_8_18,
      now: tuesdayMorning,
    });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("suspended");
  });

  it("an active emergency grant unlocks login outside the window", () => {
    const d = evaluateAccess({
      role: "Vendedor",
      active: true,
      workSchedule: WEEKDAY_8_18,
      now: tuesdayNight,
      accessGrant: {
        grantedBy: "seller-x",
        grantedAt: "2026-06-16T22:00:00Z",
        expiresAt: "2026-06-17T01:00:00Z", // ainda válido às 23:30Z
      },
    });
    expect(d.allowed).toBe(true);
  });

  it("an expired grant does not unlock", () => {
    const d = evaluateAccess({
      role: "Vendedor",
      active: true,
      workSchedule: WEEKDAY_8_18,
      now: tuesdayNight,
      accessGrant: {
        grantedBy: "seller-x",
        grantedAt: "2026-06-16T10:00:00Z",
        expiresAt: "2026-06-16T12:00:00Z", // já expirou às 23:30Z
      },
    });
    expect(d.allowed).toBe(false);
  });

  it("a Cliente is never gated by hours", () => {
    const d = evaluateAccess({ role: "Cliente", active: true, workSchedule: WEEKDAY_8_18, now: tuesdayNight });
    expect(d.allowed).toBe(true);
  });
});

describe("OPERATIONAL_ROLES", () => {
  it("contains exactly the four operational roles", () => {
    expect([...OPERATIONAL_ROLES].sort()).toEqual(
      ["Financeiro", "SDR", "Vendedor", "VendedorExterno"].sort(),
    );
  });
});

describe("canGrantAccess", () => {
  it("Owner can grant to anyone", () => {
    expect(canGrantAccess({ role: "Owner", departmentId: "a" }, { departmentId: "b" })).toBe(true);
  });
  it("Gestor grants only within the same department", () => {
    expect(canGrantAccess({ role: "Gestor", departmentId: "a" }, { departmentId: "a" })).toBe(true);
    expect(canGrantAccess({ role: "Gestor", departmentId: "a" }, { departmentId: "b" })).toBe(false);
  });
  it("operational roles cannot grant", () => {
    expect(canGrantAccess({ role: "Vendedor", departmentId: "a" }, { departmentId: "a" })).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test src/features/access/engine/accessGate.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `accessGate.ts`**

Criar `src/features/access/engine/accessGate.ts`:

```ts
import type { IAccessGrant, IWorkSchedule, IScheduleOverride, RoleName } from "@/shared/types";
import { getNextOpenAt, isWithinWorkSchedule } from "./workSchedule";

/** Roles whose login is gated by the work schedule (PRD-212 decision). */
export const OPERATIONAL_ROLES: readonly RoleName[] = [
  "Vendedor",
  "VendedorExterno",
  "SDR",
  "Financeiro",
];

export interface IAccessEvaluationInput {
  role: RoleName;
  /** false = suspended/inactive — prevails over schedule (RF-009). */
  active: boolean;
  workSchedule?: IWorkSchedule;
  scheduleOverrides?: IScheduleOverride[];
  accessGrant?: IAccessGrant | null;
  now: Date;
}

export interface IAccessDecision {
  allowed: boolean;
  reason: "ok" | "suspended" | "outside_hours";
  /** ISO instant of the next window start when reason === "outside_hours". */
  nextOpenAt: string | null;
}

/**
 * Pure access decision (PRD-212). Order matters:
 * 1) suspended/inactive is always blocked;
 * 2) Owner/Gestor (and any non-operational role, incl. Cliente) are exempt;
 * 3) no schedule = unrestricted;
 * 4) an active emergency grant unlocks;
 * 5) otherwise gate on the schedule.
 *
 * Never throws — callers fail OPEN for operationals on unexpected input.
 */
export function evaluateAccess(input: IAccessEvaluationInput): IAccessDecision {
  if (!input.active) return { allowed: false, reason: "suspended", nextOpenAt: null };

  if (!OPERATIONAL_ROLES.includes(input.role)) {
    return { allowed: true, reason: "ok", nextOpenAt: null };
  }

  const source = { workSchedule: input.workSchedule, scheduleOverrides: input.scheduleOverrides };
  if ((input.workSchedule?.length ?? 0) === 0 && (input.scheduleOverrides?.length ?? 0) === 0) {
    return { allowed: true, reason: "ok", nextOpenAt: null };
  }

  if (input.accessGrant && Date.parse(input.accessGrant.expiresAt) > input.now.getTime()) {
    return { allowed: true, reason: "ok", nextOpenAt: null };
  }

  if (isWithinWorkSchedule(source, input.now)) {
    return { allowed: true, reason: "ok", nextOpenAt: null };
  }

  return { allowed: false, reason: "outside_hours", nextOpenAt: getNextOpenAt(source, input.now) };
}

/** Who may grant a temporary emergency access (RF-013). */
export function canGrantAccess(
  actor: { role: RoleName; departmentId?: string | null },
  target: { departmentId?: string | null },
): boolean {
  if (actor.role === "Owner") return true;
  if (actor.role === "Gestor") {
    return Boolean(actor.departmentId) && actor.departmentId === target.departmentId;
  }
  return false;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun run test src/features/access/engine/accessGate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/access/engine/accessGate.ts src/features/access/engine/accessGate.test.ts
git commit -m "feat(access): pure asymmetric access decision (PRD-212)"
```

---

## Task 4 — Camada Supabase (migration versionada + mapper)

**Files:**
- Create: `supabase/migrations/<timestamp>_sellers_work_schedule.sql`
- Modify: `src/providers/data/impl/supabase/sellers.ts`

> ⚠️ **Não aplicar a migration em produção** nesta task. Apenas versionar o arquivo. A aplicação em prod acontece só sob autorização nominal do dono (mock-first).

- [ ] **Step 1: Criar a migration (espelho, idempotente)**

Criar `supabase/migrations/20260616XXXXXX_sellers_work_schedule.sql` (usar timestamp real `YYYYMMDDHHMMSS` no momento da criação):

```sql
-- PRD-212: per-user work schedule + overrides + emergency grant.
--
-- All three columns are jsonb and nullable. `work_schedule` holds an array of
-- { weekday, openAt, closeAt, enabled }; `schedule_overrides` an array of
-- { date, type, reason?, openAt?, closeAt? }; `access_grant` a single
-- { grantedBy, grantedAt, expiresAt, reason? } or null. Absent work_schedule
-- means NO access restriction. Idempotent DDL so a re-run is a no-op.

alter table public.sellers
  add column if not exists work_schedule jsonb;

alter table public.sellers
  add column if not exists schedule_overrides jsonb;

alter table public.sellers
  add column if not exists access_grant jsonb;
```

- [ ] **Step 2: Estender `SellerRow` e `COLUMNS`**

Em `src/providers/data/impl/supabase/sellers.ts`, no `interface SellerRow` (após `department_id: string | null;`, linha 33):

```ts
  work_schedule: ISeller["workSchedule"] | null;
  schedule_overrides: ISeller["scheduleOverrides"] | null;
  access_grant: ISeller["accessGrant"] | null;
```

No `COLUMNS` (linha 40-41), inserir os campos antes de `active`:

```ts
const COLUMNS =
  "id, store_id, full_name, attendant_name, email, phone, type, availability, divisions, theme_preference, region, commission_tier, parent_seller_id, commission_rule, vehicle_cadastro_mode, department_id, work_schedule, schedule_overrides, access_grant, active, created_at, deleted_at";
```

- [ ] **Step 3: Estender `rowToSeller` e `sellerPatchToRow`**

Em `rowToSeller` (após `departmentId: row.department_id ?? null,`, linha 60):

```ts
    workSchedule: row.work_schedule ?? undefined,
    scheduleOverrides: row.schedule_overrides ?? undefined,
    accessGrant: row.access_grant ?? null,
```

Em `sellerPatchToRow` (após o bloco de `departmentId`, linha 86):

```ts
  if (patch.workSchedule !== undefined) row.work_schedule = patch.workSchedule;
  if (patch.scheduleOverrides !== undefined) row.schedule_overrides = patch.scheduleOverrides;
  // Nullable: `null` clears the grant; `undefined` leaves it untouched.
  if (patch.accessGrant !== undefined) row.access_grant = patch.accessGrant ?? null;
```

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit 2>&1 | grep "impl/supabase/sellers" || echo "ok"`
Expected: `ok` (sem erros novos).

> Nota: o provider **mock** (`update`) já faz `{ ...s, ...patch }` — os novos campos fluem sem alteração. Nada a mudar no mock.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260616XXXXXX_sellers_work_schedule.sql src/providers/data/impl/supabase/sellers.ts
git commit -m "feat(access): persist work schedule on sellers (migration + mapper, PRD-212)"
```

---

## Task 5 — Editor da aba "Horário" no editor de usuário

**Files:**
- Create: `src/features/access/components/WorkScheduleTab.tsx`
- Create: `src/features/access/index.ts`
- Modify: `src/features/admin-settings/components/SellerFormDialog.tsx`

- [ ] **Step 1: Criar o barrel da feature**

Criar `src/features/access/index.ts`:

```ts
export { WorkScheduleTab } from "./components/WorkScheduleTab";
export { AccessBlockedNotice } from "./components/AccessBlockedNotice";
export { OutsideHoursBanner } from "./components/OutsideHoursBanner";
export { GrantAccessDialog } from "./components/GrantAccessDialog";
export { useAccessGate } from "./hooks/useAccessGate";
export {
  evaluateAccess,
  canGrantAccess,
  OPERATIONAL_ROLES,
  type IAccessDecision,
} from "./engine/accessGate";
export {
  isWithinWorkSchedule,
  getNextOpenAt,
  validateWorkSchedule,
} from "./engine/workSchedule";
```

> Vá comentando os exports ainda não criados (AccessBlockedNotice/OutsideHoursBanner/GrantAccessDialog/useAccessGate) e descomente em cada task. Na Task 5 deixe apenas `WorkScheduleTab` + os engines.

- [ ] **Step 2: Implementar `WorkScheduleTab.tsx`**

Criar `src/features/access/components/WorkScheduleTab.tsx`. Responsabilidade: editar `workSchedule` (grade semanal: 7 linhas com Switch + dois `input type="time"`, espelhando `BusinessHoursSection`) e `scheduleOverrides` (lista de exceções por data com tipo block/allow), com botão Salvar próprio (não faz parte do submit do "Geral"), validação via `validateWorkSchedule`, persistência via `provider.update(seller.id, { workSchedule, scheduleOverrides })`, invalidação das queries `["sellers", storeId]`/`["seller"]` e auditoria. Em modo criação (sem `seller`) não renderiza (o pai trata).

Estrutura de referência (seguir o padrão visual de `BusinessHoursSection.tsx`; usar tokens semânticos e `docs/dev/ux-guidelines.md`):

```tsx
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import type { ISeller, IWorkSchedule, IScheduleOverride } from "@/shared/types";
import { useSellersProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { recordAuditLogSync } from "@/providers/data/auditLogger";
import { validateWorkSchedule } from "../engine/workSchedule";

const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** A seven-row weekly grid, one row per weekday. Defaults to disabled rows. */
function buildInitialSchedule(seller: ISeller): IWorkSchedule {
  const byDay = new Map<number, { openAt: string; closeAt: string; enabled: boolean }>();
  for (const w of seller.workSchedule ?? []) byDay.set(w.weekday, w);
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
    const existing = byDay.get(weekday);
    return {
      weekday: weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      openAt: existing?.openAt ?? "08:00",
      closeAt: existing?.closeAt ?? "18:00",
      enabled: existing?.enabled ?? false,
    };
  });
}

export function WorkScheduleTab({ seller, storeId }: { seller: ISeller; storeId: string }) {
  const provider = useSellersProvider();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const [schedule, setSchedule] = useState<IWorkSchedule>(() => buildInitialSchedule(seller));
  const [overrides, setOverrides] = useState<IScheduleOverride[]>(seller.scheduleOverrides ?? []);

  const errors = useMemo(() => validateWorkSchedule(schedule), [schedule]);

  const updateRow = (i: number, patch: Partial<IWorkSchedule[number]>) =>
    setSchedule((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const mutation = useMutation({
    mutationFn: async () => {
      // Persist only enabled rows to keep the payload tight; absent = free access.
      const enabled = schedule.filter((w) => w.enabled);
      const before = { workSchedule: seller.workSchedule ?? null, scheduleOverrides: seller.scheduleOverrides ?? null };
      const saved = await provider.update(seller.id, {
        workSchedule: enabled,
        scheduleOverrides: overrides,
      });
      recordAuditLogSync({
        storeId,
        actorId: currentUser?.sellerId ?? currentUser?.id ?? "system",
        action: "work_schedule_updated",
        resource: "seller",
        resourceId: seller.id,
        before,
        after: { workSchedule: enabled, scheduleOverrides: overrides },
      });
      return saved;
    },
    onSuccess: async () => {
      toast.success("Horário de atendimento atualizado.");
      await queryClient.invalidateQueries({ queryKey: ["sellers", storeId] });
      await queryClient.invalidateQueries({ queryKey: ["seller"] });
    },
    onError: (err: Error) => toast.error("Não foi possível salvar o horário.", { description: err.message }),
  });

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Define o turno deste usuário (fuso de Brasília). Fora do turno, papéis operacionais não
        conseguem entrar e ficam offline. Sem nenhum dia ativo, o acesso é livre.
      </p>

      <Card>
        <CardContent className="divide-y divide-border p-0">
          {schedule.map((row, i) => (
            <div key={row.weekday} className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 px-4 py-3">
              <Switch
                checked={row.enabled}
                onCheckedChange={(v) => updateRow(i, { enabled: Boolean(v) })}
                aria-label={`Ativar ${WEEKDAY_LABELS[row.weekday]}`}
              />
              <span className={row.enabled ? "text-sm font-medium" : "text-sm text-muted-foreground line-through"}>
                {WEEKDAY_LABELS[row.weekday]}
              </span>
              <Input type="time" value={row.openAt} disabled={!row.enabled}
                onChange={(e) => updateRow(i, { openAt: e.target.value })}
                className="h-8 w-28 text-sm" aria-label={`Abre em ${WEEKDAY_LABELS[row.weekday]}`} />
              <span className="text-xs text-muted-foreground">até</span>
              <Input type="time" value={row.closeAt} disabled={!row.enabled}
                onChange={(e) => updateRow(i, { closeAt: e.target.value })}
                className="h-8 w-28 text-sm" aria-label={`Fecha em ${WEEKDAY_LABELS[row.weekday]}`} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Exceções por data (overrides). Lista simples: data + tipo + remover. */}
      <ScheduleOverridesEditor overrides={overrides} onChange={setOverrides} />

      {errors.length > 0 && (
        <ul className="space-y-1 rounded-md border border-severity-warning/30 bg-severity-warning/10 p-2.5 text-xs text-severity-warning">
          {errors.map((e, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <Icon icon="mdi:alert-outline" size={14} className="mt-0.5 shrink-0" /> {e}
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || errors.length > 0}
        >
          {mutation.isPending ? "Salvando…" : "Salvar horário"}
        </Button>
      </div>
    </div>
  );
}
```

E implementar `ScheduleOverridesEditor` (no mesmo arquivo, componente interno): lista de exceções; cada item = `Input type="date"` (data) + um toggle/Select block|allow + botão remover; botão "Adicionar exceção" cria `{ date: "", type: "block" }`. Validar `date` não-vazia antes de salvar (filtrar vazias no submit). Manter acessível (labels) e enxuto.

> ⚠️ `type="button"` em todos os botões — o editor vive dentro do `<form>` do "Geral"; sem isso, um clique dispararia o submit do form e fecharia o Sheet.

- [ ] **Step 3: Destravar a aba "Horário" e montar o editor no `SellerFormDialog`**

Em `src/features/admin-settings/components/SellerFormDialog.tsx`:

Import (após linha 38):
```ts
import { WorkScheduleTab } from "@/features/access";
```

Substituir o `TabsTrigger` travado de "horario" (linhas 194-205) por um trigger ativo (mantendo o de "rodizio" travado):
```tsx
                  <TabsTrigger value="horario" className="gap-1">
                    <Icon icon="mdi:clock-outline" size={13} />
                    Horário
                  </TabsTrigger>
```

Substituir o `TabsContent` de "horario" (linhas 372-374):
```tsx
                  <TabsContent value="horario">
                    {isEdit && seller ? (
                      <WorkScheduleTab seller={seller} storeId={storeId} />
                    ) : (
                      <div className="rounded-md border border-dashed border-border bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
                        Cadastre e salve o usuário primeiro para definir o horário de atendimento.
                      </div>
                    )}
                  </TabsContent>
```

> O `LockedTabPlaceholder` continua em uso pela aba "rodizio" — não removê-lo.

- [ ] **Step 4: Build + manual smoke note**

Run: `bun run build` (ou o fallback `node node_modules/vite/bin/vite.js build`)
Expected: build verde.

Smoke manual (o dono testa): abrir `/app/configuracoes/usuarios` → Editar um usuário → aba "Horário" abre, grade semanal editável, salvar persiste e mostra toast; exceções adicionáveis; validação bloqueia closeAt ≤ openAt e sobreposição.

- [ ] **Step 5: Commit**

```bash
git add src/features/access/components/WorkScheduleTab.tsx src/features/access/index.ts src/features/admin-settings/components/SellerFormDialog.tsx
git commit -m "feat(access): work schedule editor tab in user editor (PRD-212)"
```

---

## Task 6 — Gate de login client-side (rota) + tela de bloqueio

**Files:**
- Modify: `src/features/auth/authContext.ts`
- Create: `src/features/access/hooks/useAccessGate.ts`
- Create: `src/features/access/components/AccessBlockedNotice.tsx`
- Modify: `src/routes/auth.login.tsx`

- [ ] **Step 1: Estender `IAuthResult` (não muda os providers)**

Em `src/features/auth/authContext.ts`, no `IAuthResult`, adicionar campo opcional:
```ts
  /** Set by the login route's access gate when a successful auth is then
   *  blocked by the work-schedule rule (PRD-212). */
  blocked?: { reason: "outside_hours" | "suspended"; nextOpenAt?: string | null };
```
(Os providers de auth não precisam preencher isso — quem preenche é a rota após avaliar o gate.)

- [ ] **Step 2: Implementar `useAccessGate`**

Criar `src/features/access/hooks/useAccessGate.ts`. Expõe `evaluateForProfile(profile)` que busca o seller via provider e devolve `IAccessDecision`. Falha **aberta** (allow) em erro, para nunca trancar indevidamente (RNF-001).

```ts
import { useCallback } from "react";
import type { IUserProfile } from "@/features/auth/mock-users";
import { useSellersProvider } from "@/providers/data";
import { evaluateAccess, OPERATIONAL_ROLES, type IAccessDecision } from "../engine/accessGate";

export function useAccessGate() {
  const sellers = useSellersProvider();

  const evaluateForProfile = useCallback(
    async (profile: IUserProfile): Promise<IAccessDecision> => {
      // Non-operational roles (Owner/Gestor/Cliente) are exempt — skip the fetch.
      if (!OPERATIONAL_ROLES.includes(profile.role) || !profile.sellerId) {
        return { allowed: true, reason: "ok", nextOpenAt: null };
      }
      try {
        const seller = await sellers.get(profile.sellerId);
        return evaluateAccess({
          role: profile.role,
          active: seller.active,
          workSchedule: seller.workSchedule,
          scheduleOverrides: seller.scheduleOverrides,
          accessGrant: seller.accessGrant,
          now: new Date(),
        });
      } catch {
        // Fail open: never lock someone out because the schedule read failed.
        return { allowed: true, reason: "ok", nextOpenAt: null };
      }
    },
    [sellers],
  );

  return { evaluateForProfile };
}
```

- [ ] **Step 3: Implementar `AccessBlockedNotice`**

Criar `src/features/access/components/AccessBlockedNotice.tsx`. Recebe `{ nextOpenAt?: string | null }` e renderiza a mensagem de bloqueio com o próximo horário formatado em São Paulo + ação "Solicitar liberação ao gestor" (um mailto ou um botão que dispara um toast com instrução — sem backend de solicitação neste ciclo; deixar como CTA visual + texto). Formatação do horário:

```tsx
import { Icon } from "@/components/Icon";

function formatNextOpen(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function AccessBlockedNotice({ nextOpenAt }: { nextOpenAt?: string | null }) {
  return (
    <div role="alert" className="space-y-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
      <p className="flex items-start gap-1.5 font-medium">
        <Icon icon="mdi:clock-alert-outline" size={14} className="mt-0.5 shrink-0" />
        Fora do seu horário de atendimento.
      </p>
      {nextOpenAt && <p>Acesso liberado a partir de {formatNextOpen(nextOpenAt)}.</p>}
      <p className="text-destructive/80">
        Precisa entrar agora? Solicite uma liberação temporária ao seu gestor.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Rodar o gate na rota de login**

Em `src/routes/auth.login.tsx`:

Imports:
```ts
import { useAccessGate } from "@/features/access";
import { AccessBlockedNotice } from "@/features/access";
```

No componente, obter `signOut` do `useAuth()` e o gate:
```ts
  const { signIn, signInWithPassword, signOut } = useAuth();
  const { evaluateForProfile } = useAccessGate();
  const [blocked, setBlocked] = useState<{ nextOpenAt?: string | null } | null>(null);
```

No `handleSubmit`, dentro do `.then((result) => {...})`, após confirmar `result.ok && result.profile` e **antes** de navegar, avaliar o gate:
```ts
      if (rememberMe) saveRememberedEmail(email);
      else clearRememberedEmail();
      void evaluateForProfile(result.profile).then((decision) => {
        if (!decision.allowed) {
          // Client-side gate (Fase 1): a sessão foi criada — encerrá-la para
          // efetivar o bloqueio. O enforcement server-side real fica deferido.
          signOut();
          setBlocked({ nextOpenAt: decision.nextOpenAt });
          setPendingId(null);
          return;
        }
        const target = next ?? result.profile!.defaultRedirect;
        void navigate({ to: target });
      });
```
(Resetar `setBlocked(null)` no início do `handleSubmit`, junto de `setError(null)`.)

Aplicar o mesmo gate no `enter` (pick-a-profile mock) para paridade: após `signIn(id)` retornar `profile`, chamar `evaluateForProfile(profile)` e, se bloqueado, `signOut()` + `setBlocked(...)` em vez de navegar.

Render: logo após o bloco `{error && (...)}` (linhas 155-162), adicionar:
```tsx
              {blocked && <AccessBlockedNotice nextOpenAt={blocked.nextOpenAt} />}
```

- [ ] **Step 5: Descomentar exports no barrel**

Em `src/features/access/index.ts`, garantir que `AccessBlockedNotice` e `useAccessGate` estejam exportados (descomentar).

- [ ] **Step 6: Build**

Run: `bun run build`
Expected: verde.

Smoke manual (dono): com um Vendedor que tem janela seg-sex 08–18, tentar logar fora da janela → bloqueio com "Acesso liberado a partir de…" e a sessão não permanece. Owner/Gestor logam normalmente a qualquer hora.

- [ ] **Step 7: Commit**

```bash
git add src/features/auth/authContext.ts src/features/access/hooks/useAccessGate.ts src/features/access/components/AccessBlockedNotice.tsx src/routes/auth.login.tsx src/features/access/index.ts
git commit -m "feat(access): client-side login gate by work schedule (PRD-212)"
```

---

## Task 7 — Banner de sessão + auto-offline fora do turno

**Files:**
- Create: `src/features/access/hooks/useOutsideHoursWatcher.ts`
- Create: `src/features/access/components/OutsideHoursBanner.tsx`
- Modify: `src/features/shell/layouts/AppLayout.tsx`
- Modify: `src/features/distribution/components/AvailabilityToggle.tsx`

- [ ] **Step 1: Implementar `useOutsideHoursWatcher`**

Criar `src/features/access/hooks/useOutsideHoursWatcher.ts`. Para o usuário logado, se papel operacional **e** com `workSchedule`, verifica a cada 60s (e no mount) se está fora da janela. Quando cruza de dentro→fora, define `availability: 'offline'` uma única vez (só se estava `online`/`ausente`/`ocupado`) e expõe `outside`. Nunca força `online` ao reabrir.

```ts
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/useAuth";
import { useSellersProvider } from "@/providers/data";
import { isWithinWorkSchedule } from "../engine/workSchedule";
import { OPERATIONAL_ROLES } from "../engine/accessGate";

export function useOutsideHoursWatcher(): { outside: boolean } {
  const { currentUser } = useAuth();
  const sellers = useSellersProvider();
  const sellerId = currentUser?.sellerId;
  const operational = currentUser ? OPERATIONAL_ROLES.includes(currentUser.role) : false;

  const sellerQuery = useQuery({
    queryKey: ["seller", sellerId],
    queryFn: () => sellers.get(sellerId!),
    enabled: Boolean(sellerId) && operational,
  });

  const [outside, setOutside] = useState(false);
  const autoOfflineDone = useRef(false);

  useEffect(() => {
    const seller = sellerQuery.data;
    if (!seller || !operational || (seller.workSchedule?.length ?? 0) === 0) {
      setOutside(false);
      return;
    }
    const tick = () => {
      const isOutside = !isWithinWorkSchedule(
        { workSchedule: seller.workSchedule, scheduleOverrides: seller.scheduleOverrides },
        new Date(),
      );
      setOutside(isOutside);
      if (isOutside && !autoOfflineDone.current && seller.availability !== "offline") {
        autoOfflineDone.current = true;
        void sellers.setAvailability(seller.id, "offline");
      }
      if (!isOutside) autoOfflineDone.current = false; // re-arm for the next close
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [sellerQuery.data, operational, sellers]);

  return { outside };
}
```

- [ ] **Step 2: Implementar `OutsideHoursBanner`**

Criar `src/features/access/components/OutsideHoursBanner.tsx`. Usa o watcher; renderiza nada quando dentro do turno. Segue o padrão sticky dos banners do shell (ver `WhatsAppDisconnectedBanner`).

```tsx
import { Icon } from "@/components/Icon";
import { useOutsideHoursWatcher } from "../hooks/useOutsideHoursWatcher";

export function OutsideHoursBanner() {
  const { outside } = useOutsideHoursWatcher();
  if (!outside) return null;
  return (
    <div
      role="status"
      className="sticky top-16 z-30 flex items-center gap-2 border-b border-severity-warning/30 bg-severity-warning/10 px-4 py-2 text-xs text-severity-warning"
    >
      <Icon icon="mdi:clock-alert-outline" size={15} className="shrink-0" />
      <span>
        Você está fora do seu horário de atendimento. Pode concluir o que está em andamento; sua
        disponibilidade ficou <strong>offline</strong>.
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Montar no `AppLayout`**

Em `src/features/shell/layouts/AppLayout.tsx`, importar e montar logo abaixo de `<WhatsAppDisconnectedBanner />` (linha 59):
```tsx
import { OutsideHoursBanner } from "@/features/access";
...
            <WhatsAppDisconnectedBanner />
            <OutsideHoursBanner />
```

- [ ] **Step 4: Rótulo "fora do horário" na disponibilidade (RF-012)**

Em `src/features/distribution/components/AvailabilityToggle.tsx`, quando a disponibilidade exibida for `offline` e o seller estiver fora do turno, anexar o sufixo "— fora do horário" ao label. Derivar via `isWithinWorkSchedule` (importado de `@/features/access`) usando o `workSchedule`/`scheduleOverrides` do seller já disponível no componente. Se o componente não tiver o seller completo à mão, manter a derivação simples: exibir o sufixo apenas quando `availability === "offline"` e o watcher/估 indicar fora do turno. Manter mudança mínima e não quebrar o seletor existente.

> Se a derivação exigir dados não disponíveis no componente sem refactor grande, registrar como nota e exibir o motivo apenas no banner (Step 2), deixando o toggle intocado. Não expandir escopo.

- [ ] **Step 5: Build + commit**

Run: `bun run build` → verde.
```bash
git add src/features/access/hooks/useOutsideHoursWatcher.ts src/features/access/components/OutsideHoursBanner.tsx src/features/shell/layouts/AppLayout.tsx src/features/distribution/components/AvailabilityToggle.tsx src/features/access/index.ts
git commit -m "feat(access): outside-hours session banner + auto-offline (PRD-212)"
```

---

## Task 8 — Override de emergência (liberação temporária)

**Files:**
- Create: `src/features/access/components/GrantAccessDialog.tsx`
- Modify: `src/features/admin-settings/pages/UsersPage.tsx` (ou `WorkScheduleTab.tsx` — escolher o ponto de entrada)

- [ ] **Step 1: Implementar `GrantAccessDialog`**

Criar `src/features/access/components/GrantAccessDialog.tsx`. Dialog (shadcn `Dialog`/`AlertDialog`) com duas formas de conceder: (a) "liberar por N horas a partir de agora" (Select 1/2/4/8h) ou (b) "liberar até HH:mm de hoje" (`input type="time"`). Calcula `expiresAt` (ISO) e persiste via `provider.update(target.id, { accessGrant })`. Audita. Props: `{ target: ISeller; open; onOpenChange }`. Permissão: só renderizar o gatilho se `canGrantAccess(actor, target)` (actor = currentUser role + departmentId).

Cálculo de `expiresAt`:
```ts
// por N horas:
const expiresAt = new Date(Date.now() + hours * 3_600_000).toISOString();
// até HH:mm de hoje (São Paulo): construir o instante via offset fixo -03:00.
// (reusar a mesma lógica de saoPauloInstant se exposta, ou compor com Date.UTC + 180min)
```
Auditoria:
```ts
recordAuditLogSync({
  storeId: target.storeId,
  actorId: currentUser?.sellerId ?? currentUser?.id ?? "system",
  action: "access_grant_created",
  resource: "seller",
  resourceId: target.id,
  after: { expiresAt, reason },
});
```
Invalidar `["sellers", storeId]` e `["seller"]`. Toast de confirmação. Permitir também **revogar** um grant ativo (`provider.update(target.id, { accessGrant: null })`, audit `access_grant_revoked`).

- [ ] **Step 2: Ponto de entrada**

Adicionar o gatilho de liberação na aba "Horário" (`WorkScheduleTab`), abaixo da grade: se há `seller.accessGrant` ativo, mostrar um aviso "Liberação ativa até …" + botão "Revogar"; senão, botão "Liberar acesso temporário" (visível só se `canGrantAccess`). Isso mantém tudo o que é horário num lugar só.

- [ ] **Step 3: Exports + build + commit**

Descomentar `GrantAccessDialog` no barrel. `bun run build` → verde.
```bash
git add src/features/access/components/GrantAccessDialog.tsx src/features/access/components/WorkScheduleTab.tsx src/features/access/index.ts
git commit -m "feat(access): temporary emergency access grant (PRD-212)"
```

---

## Task 9 — Documentação + revisão final

**Files:**
- Create: `docs/dev/work-schedule-access.md`

- [ ] **Step 1: Escrever a doc da feature**

Criar `docs/dev/work-schedule-access.md` cobrindo: conceito (workSchedule × businessHours — não confundir), os helpers puros e o timezone fixo, a regra assimétrica (tabela papel × momento), o gate client-side na rota (e por que o server-side está deferido + o risco em prod), o banner/auto-offline, o override de emergência, e a integração futura com o rodízio (PRD-213 já filtra offline). Listar a migration e a regra "aplicar em prod sob autorização".

- [ ] **Step 2: Suite completa + type-check de delta**

Run: `bun run test`
Expected: toda a suíte verde (incluindo os novos `access/engine/*.test.ts`).

Run: `bunx tsc --noEmit` e cruzar com `git diff --name-status main...HEAD --diff-filter=A` — confirmar que os arquivos **novos** não introduzem erros de tipo.

- [ ] **Step 3: Commit**

```bash
git add docs/dev/work-schedule-access.md
git commit -m "docs(access): work schedule + access gate guide (PRD-212)"
```

- [ ] **Step 4: Revisão final (subagente code-reviewer)**

Dispatch de um revisor sobre todo o diff `main...HEAD`: conferir cobertura dos RFs (001–019, exceto server-side deferido), ausência de regressão no fluxo de login (Owner/Gestor nunca bloqueados; fail-open), segurança (gate não é fronteira — documentado), e aderência ao `ux-guidelines.md`.

---

## Closeout (SEPARADO — só após smoke do dono aprovado)

> Não executar junto com a implementação. Disparar quando o dono validar o smoke.

- [ ] Bump MINOR + **codinome novo** (sugestão do PRD: `Shift` — inédito na lista de tags; confirmar). Atualizar `package.json`.
- [ ] `CHANGELOG.md` — seção nova em linguagem acessível (Added: horário de atendimento por usuário, bloqueio de acesso fora do turno, aviso ao fechar a janela, liberação temporária; Changed: aba Horário do cadastro de usuário ativada).
- [ ] `CLAUDE.md` — parágrafo de estado + linha de codinome + lista de tags.
- [ ] Renomear `docs/prds/PRD-212-horario-atendimento-acesso.md` → `..._DONE.md` e preencher "Status de Implementação".
- [ ] **Migration em produção:** aplicar `sellers_work_schedule.sql` em prod **somente sob autorização nominal do dono** (via MCP `apply_migration`), e confirmar as 3 colunas.
- [ ] Merge `feat/prd-212-horario` → `main` (`--no-ff`), tag `vX.Y.0`, GitHub release. Atualizar memória do épico (`project_prd211_people_access_epic` → próximo = PRD-213).

---

## Self-Review (preenchido)

**Cobertura de spec (RFs):** RF-001/002/003 → Task 1. RF-004/005/006 → Task 2. RF-007/008/009 → Tasks 3+6. RF-010/011/012 → Task 7. RF-013/014/015 → Tasks 3 (`canGrantAccess`)+8. RF-016/017/018 → Task 5. RF-019 → Tasks 6+7 (client-side). **RF-020 (server-side) DEFERIDO por decisão** — documentado na Task 9.

**Placeholders:** nenhum "TBD". As partes de UI grandes (`ScheduleOverridesEditor`, `GrantAccessDialog`) têm responsabilidade, props e wiring exatos especificados; o executor escreve o JSX seguindo os padrões citados (`BusinessHoursSection`, banners do shell).

**Consistência de tipos:** `IWorkSchedule`/`IWorkScheduleWindow`/`IScheduleOverride`/`IAccessGrant` usados de forma idêntica em types, mapper, engines e UI. `IAccessDecision.reason` ∈ {ok, suspended, outside_hours} consistente entre `accessGate.ts`, `useAccessGate` e `auth`. `IScheduleSource` é o input comum de `isWithinWorkSchedule`/`getNextOpenAt`.

**Riscos:** (1) sessão momentânea no gate client-side (login→signOut) — aceito e documentado, server-side é o fix real (deferido). (2) auto-offline não deve sobrescrever escolha manual ao reabrir — tratado via `autoOfflineDone` ref + nunca forçar online. (3) migration não aplicada em prod sem OK — gate explícito.
