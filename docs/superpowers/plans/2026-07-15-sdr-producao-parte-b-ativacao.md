# SDR em Produção — Parte B (Ativação Real) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ligar de fato o agente SDR à inbox de produção — Edge Functions `sdr-respond` (responde) e `sdr-backstop-tick` (ativa conversas paradas na fila), wiring no webhook para continuidade, e a configuração operacional (liga/desliga por loja + timeout) concentrada numa nova aba "SDR" dentro do hub já existente `/app/configuracoes/ia`. Ao final deste plano, `sdr_enabled=false` em todas as lojas — nada muda no comportamento observável em produção até o dono ativar manualmente uma loja.

**Architecture:** Segue a arquitetura aprovada em `docs/superpowers/specs/2026-07-15-sdr-producao-parte-b-ativacao-design.md`. Duas Edge Functions novas, públicas (`verify_jwt` off), autenticadas por shared secret (`SDR_WORKER_SECRET`, mesmo padrão de `SCHEDULED_WORKER_SECRET`/`scheduled-send-worker`) — nunca chamadas por um usuário logado. `sdr-backstop-tick` roda via `pg_cron`+`pg_net` a cada minuto (mesmo padrão de `scheduled-send-tick`). `sdr-respond` despacha a resposta reusando `processSendRequest` (`_shared/whatsapp/send/core.ts`) para contas `meta`/`evolution`/`evolution-go`/`openwa`, e uma rota direta nova (`sdr-respond/dispatch.ts`, espelhando `waha-send/index.ts` sem tocar nele) para contas `waha`. O prompt de sistema do SDR continua sendo o `BASE_PROMPT` estrutural de `systemPrompt.ts` (contém o contrato JSON que `parseSdrLlmDecision` exige — não pode ser sobrescrito livremente) — o campo editável em `ai_settings.routing[feature='sdr'].systemPrompt` (aba Funcionalidades) entra como orientação **suplementar**, anexada ao final, nunca substituindo as regras estruturais. Provedor/modelo/temperatura desse mesmo `routing` são, esses sim, usados tal como estão (mesmo padrão do `copilot-generate`).

**Tech Stack:** TypeScript strict (frontend), Deno + Supabase Edge Functions (backend), Vitest (TDD para código puro), Postgres/pg_cron/pg_net.

## Global Constraints

- TypeScript `strict: true` — no `any`. Onde um objeto precisar satisfazer um tipo de domínio mais amplo (ex.: `ISeller`) com só um subconjunto de campos vindos de uma query SQL, use um cast explícito comentado (`as ISeller[]`), nunca `any`.
- Comentários em inglês. Strings visíveis ao usuário em português do Brasil com acentos corretos (UTF-8).
- `supabase/functions/**` está **fora** do `tsconfig.json` raiz (`include: ["src/**/*.ts", ...]`) — não existe `bunx tsc --noEmit` nem `bun run test` cobrindo `index.ts` de Edge Function (só os módulos puros co-localizados, ex. `guardrails.test.ts`, rodam via Vitest). Para essas tasks a verificação é revisão cuidadosa contra as assinaturas reais citadas em cada task — não invente um passo de "rodar testes" que não existe.
- Módulos dentro de `supabase/functions/**/*.ts` que importam uns aos outros usam especificadores relativos com sufixo `.ts` explícito (Deno exige extensão em runtime); os `*.test.ts` importam sem sufixo.
- **Nunca editar à mão** `supabase/functions/_shared/sdr-escalation/**` nem `supabase/functions/_shared/distribution/**` (gerados) — mudar a fonte em `src/features/{sdr-escalation,distribution}/` e rodar o script de sync correspondente.
- Migrations são criadas como arquivos em `supabase/migrations/` neste plano mas **não são aplicadas** ao projeto Supabase real — isso requer autorização explícita do dono, executada separadamente após revisão (mesma regra da Parte A).
- Conventional Commits (inglês), atômicos.
- Working tree: `D:\claude\gallo-basediesel\.claude\worktrees\sdr-implementation` (branch `worktree-sdr-implementation`). Todos os paths abaixo são relativos à raiz desta worktree.
- Referências: `docs/superpowers/specs/2026-07-15-sdr-producao-parte-b-ativacao-design.md`, `docs/superpowers/plans/2026-07-13-sdr-producao-piloto-recepcao-triagem.md`.

---

### Task 1: Migration de ativação — schema + índice + secret

**Files:**
- Create: `supabase/migrations/20260715130000_sdr_activation_schema.sql`

**Interfaces:**
- Consumes: nada.
- Produces: coluna `sdr_settings.system_prompt` removida; índice `conversations_sdr_backstop_queue_idx`; secret `SDR_WORKER_SECRET` no Vault — consumidos pelas Tasks 6 (provider), 9 (`sdr-respond`) e 10 (`sdr-backstop-tick`).

- [ ] **Step 1: Escrever a migration**

```sql
-- SDR production pilot — Parte B activation schema adjustments.
--
-- 1. system_prompt nunca foi escrita (Parte A não ativou nada) — o prompt do
--    SDR passa a ter uma única fonte configurável: ai_settings.routing
--    [feature='sdr'].systemPrompt (aba Funcionalidades), mesmo padrão do
--    copilot-generate. Ver supabase/functions/sdr-respond/index.ts para como
--    esse campo é combinado (como sufixo, não substituição) com o BASE_PROMPT
--    estrutural que carrega o contrato JSON.
alter table public.sdr_settings drop column if exists system_prompt;

-- 2. Índice parcial para o scan do sdr-backstop-tick (mesmo predicado de
--    isQueuedConversation, mais store_id): sem isso, a varredura a cada
--    minuto faria sequential scan de conversations.
create index if not exists conversations_sdr_backstop_queue_idx
  on public.conversations (store_id, queued_at)
  where assigned_seller_id is null
    and is_sdr_active = false
    and status = 'aguardando';

-- 3. Shared secret pros dois novos workers internos (sdr-respond,
--    sdr-backstop-tick) — mesmo padrão de SCHEDULED_WORKER_SECRET
--    (20260613120100_scheduled_send_cron_trigger.sql).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'SDR_WORKER_SECRET') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'SDR_WORKER_SECRET',
      'Shared secret authenticating sdr-respond and sdr-backstop-tick (SDR production pilot, Parte B).'
    );
  end if;
end $$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260715130000_sdr_activation_schema.sql
git commit -m "feat(sdr): add Parte B activation schema migration (not applied)"
```

---

### Task 2: Extrair `isWithinBusinessHours` para arquivo próprio

**Files:**
- Create: `src/features/distribution/engine/businessHours.ts`
- Create: `src/features/distribution/engine/businessHours.test.ts`
- Modify: `src/features/distribution/engine/utils.ts:1-32` (remove a função, re-exporta do novo arquivo)

**Interfaces:**
- Consumes: `IBusinessHoursWindow` de `@/shared/types`.
- Produces: `isWithinBusinessHours(date, windows)` — mesma assinatura de antes, consumida por `distribute.ts` (inalterado) e pela Task 3 (mirror pro Deno).

Motivo: `distribute.ts`/`utils.ts` arrastam bastante lógica de seleção de vendedor que o `sdr-backstop-tick` não precisa. Isolar só o cálculo de horário comercial num arquivo próprio permite espelhar SÓ ele pro Deno (Task 3), sem arrastar `getOnlineSellers`/`selectByLoad`/etc.

- [ ] **Step 1: Escrever o teste (comportamento idêntico ao já existente, agora coberto por teste formal)**

Create `src/features/distribution/engine/businessHours.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isWithinBusinessHours } from "./businessHours";
import type { IBusinessHoursWindow } from "@/shared/types";

const MONDAY_9AM = new Date(2026, 5, 1, 9, 0); // 2026-06-01 is a Monday
const MONDAY_7AM = new Date(2026, 5, 1, 7, 0);
const SUNDAY_9AM = new Date(2026, 5, 7, 9, 0);

const WEEKDAY_WINDOW: IBusinessHoursWindow = {
  weekday: 1,
  openAt: "08:00",
  closeAt: "18:00",
  enabled: true,
};

describe("isWithinBusinessHours", () => {
  it("returns true when the date falls inside an enabled window for its weekday", () => {
    expect(isWithinBusinessHours(MONDAY_9AM, [WEEKDAY_WINDOW])).toBe(true);
  });

  it("returns false when the date is before the window opens", () => {
    expect(isWithinBusinessHours(MONDAY_7AM, [WEEKDAY_WINDOW])).toBe(false);
  });

  it("returns false when no window matches the weekday", () => {
    expect(isWithinBusinessHours(SUNDAY_9AM, [WEEKDAY_WINDOW])).toBe(false);
  });

  it("ignores disabled windows", () => {
    expect(isWithinBusinessHours(MONDAY_9AM, [{ ...WEEKDAY_WINDOW, enabled: false }])).toBe(false);
  });

  it("returns false for an empty window list", () => {
    expect(isWithinBusinessHours(MONDAY_9AM, [])).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha (o arquivo ainda não existe)**

Run: `bunx vitest run src/features/distribution/engine/businessHours.test.ts`
Expected: FAIL — `Cannot find module './businessHours'`.

- [ ] **Step 3: Criar `businessHours.ts` movendo o código de `utils.ts`**

Create `src/features/distribution/engine/businessHours.ts`:

```ts
import type { IBusinessHoursWindow } from "@/shared/types";

/** Parse `"HH:mm"` into minutes since midnight. Returns NaN on bad input. */
function timeToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return Number.NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return Number.NaN;
  return hours * 60 + minutes;
}

/**
 * Returns true when `date` falls inside any enabled business-hours window.
 *
 * Windows that span midnight (e.g. opening at 22:00 and closing at 02:00) are
 * **not** supported — keeps the comparison straightforward and matches the UI
 * editor in the admin panel.
 */
export function isWithinBusinessHours(date: Date, windows: IBusinessHoursWindow[]): boolean {
  const weekday = date.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const minutesOfDay = date.getHours() * 60 + date.getMinutes();
  for (const win of windows) {
    if (!win.enabled) continue;
    if (win.weekday !== weekday) continue;
    const open = timeToMinutes(win.openAt);
    const close = timeToMinutes(win.closeAt);
    if (Number.isNaN(open) || Number.isNaN(close)) continue;
    if (minutesOfDay >= open && minutesOfDay < close) return true;
  }
  return false;
}
```

- [ ] **Step 4: Atualizar `utils.ts` para re-exportar em vez de definir**

In `src/features/distribution/engine/utils.ts`, replace lines 1-32 (the `timeToMinutes` function, its doc comment, and `isWithinBusinessHours`) with:

```ts
import type { ISeller } from "@/shared/types";

export { isWithinBusinessHours } from "./businessHours";
```

(O restante do arquivo — `getOnlineSellers`, `selectByLoad`, `selectByRoundRobin`, `findSpecialtyMatches` — fica inalterado.)

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `bunx vitest run src/features/distribution/engine/businessHours.test.ts`
Expected: PASS (5/5).

Run: `bunx vitest run src/features/distribution`
Expected: PASS — nenhum teste existente de `distribute.ts`/`utils.ts` quebrou (a re-exportação preserva a assinatura e o comportamento).

- [ ] **Step 6: Commit**

```bash
git add src/features/distribution/engine/businessHours.ts src/features/distribution/engine/businessHours.test.ts src/features/distribution/engine/utils.ts
git commit -m "refactor(distribution): extract isWithinBusinessHours into its own file"
```

---

### Task 3: Mirror de `businessHours.ts` pro Deno

**Files:**
- Create: `scripts/sync-business-hours-shared.ts`
- Create (gerado pelo script): `supabase/functions/_shared/distribution/engine/businessHours.ts`

**Interfaces:**
- Consumes: `src/features/distribution/engine/businessHours.ts` (Task 2).
- Produces: `isWithinBusinessHours` importável de `../_shared/distribution/engine/businessHours.ts` — consumido pela Task 10 (`sdr-backstop-tick`).

- [ ] **Step 1: Escrever o script, no mesmo padrão de `scripts/sync-sdr-shared.ts`**

Create `scripts/sync-business-hours-shared.ts`:

```ts
/**
 * Mirrors the pure business-hours calculation into the Edge Functions tree,
 * so sdr-backstop-tick (Deno) can reuse isWithinBusinessHours without
 * duplicating it by hand.
 *
 *   src/features/distribution/engine/businessHours.ts
 *     → supabase/functions/_shared/distribution/engine/businessHours.ts
 *
 * Single-file mirror (not a whole-directory copy like sync-sdr-shared.ts) —
 * the rest of src/features/distribution/engine/ (seller-selection cascade)
 * is not needed server-side and is deliberately not dragged along.
 *
 * Run after ANY change to src/features/distribution/engine/businessHours.ts:
 *   bun run scripts/sync-business-hours-shared.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = join(import.meta.dirname ?? ".", "..");
const SRC = join(ROOT, "src", "features", "distribution", "engine", "businessHours.ts");
const DEST = join(
  ROOT,
  "supabase",
  "functions",
  "_shared",
  "distribution",
  "engine",
  "businessHours.ts",
);

const banner =
  "// AUTO-GENERATED MIRROR — DO NOT EDIT.\n" +
  "// Source: src/features/distribution/engine/businessHours.ts (sync: bun run scripts/sync-business-hours-shared.ts)\n\n";

mkdirSync(dirname(DEST), { recursive: true });
writeFileSync(DEST, banner + readFileSync(SRC, "utf8"));
console.log("synced 1 file → supabase/functions/_shared/distribution/engine/businessHours.ts");
```

- [ ] **Step 2: Rodar o script**

Run: `bun run scripts/sync-business-hours-shared.ts`
Expected: `synced 1 file → supabase/functions/_shared/distribution/engine/businessHours.ts`, e o arquivo existe com o banner + o conteúdo idêntico ao de `businessHours.ts` (a função usa só `import type` de `@/shared/types`, que é apagado na transpilação — inofensivo para o Deno, que nunca resolve imports type-only em runtime).

- [ ] **Step 3: Commit**

```bash
git add scripts/sync-business-hours-shared.ts supabase/functions/_shared/distribution/engine/businessHours.ts
git commit -m "feat(sdr): mirror isWithinBusinessHours into _shared for Deno reuse"
```

---

### Task 4: `_shared/workerAuth.ts` — helper de autenticação por secret

**Files:**
- Create: `supabase/functions/_shared/workerAuth.ts`
- Create: `supabase/functions/_shared/workerAuth.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `safeEqual(a, b): boolean` e `verifyWorkerSecret(provided, expected): boolean` — consumidos pelas Tasks 9 e 10.

Motivo: `scheduled-send-worker/index.ts` já duplica um `safeEqual` local. Em vez de duplicar de novo (2 novas Edge Functions vão precisar do mesmo comparador constant-time), extrai pra `_shared/` — `scheduled-send-worker` não é tocado (fora de escopo mexer em código já em produção sem necessidade).

- [ ] **Step 1: Escrever o teste**

Create `supabase/functions/_shared/workerAuth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { safeEqual, verifyWorkerSecret } from "./workerAuth";

describe("safeEqual", () => {
  it("returns true for identical strings", () => {
    expect(safeEqual("abc123", "abc123")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(safeEqual("abc123", "abc124")).toBe(false);
  });

  it("returns false for strings of different lengths", () => {
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("returns false when either string is empty", () => {
    expect(safeEqual("", "abc")).toBe(false);
    expect(safeEqual("abc", "")).toBe(false);
  });
});

describe("verifyWorkerSecret", () => {
  it("returns true when provided matches expected", () => {
    expect(verifyWorkerSecret("secret", "secret")).toBe(true);
  });

  it("returns false when expected is undefined (secret not configured)", () => {
    expect(verifyWorkerSecret("secret", undefined)).toBe(false);
  });

  it("returns false when provided is empty", () => {
    expect(verifyWorkerSecret("", "secret")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bunx vitest run supabase/functions/_shared/workerAuth.test.ts`
Expected: FAIL — `Cannot find module './workerAuth'`.

- [ ] **Step 3: Implementar**

Create `supabase/functions/_shared/workerAuth.ts`:

```ts
/**
 * Constant-time comparison for shared-secret worker auth (SDR_WORKER_SECRET,
 * SCHEDULED_WORKER_SECRET). Same discipline as the HMAC compares elsewhere in
 * the WhatsApp adapters — avoids leaking timing information about how many
 * leading characters matched.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length === 0 || b.length === 0) return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** `expected` is `undefined` when the secret hasn't been provisioned yet — always denies. */
export function verifyWorkerSecret(provided: string, expected: string | undefined): boolean {
  if (!expected) return false;
  return safeEqual(provided, expected);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bunx vitest run supabase/functions/_shared/workerAuth.test.ts`
Expected: PASS (8/8).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/workerAuth.ts supabase/functions/_shared/workerAuth.test.ts
git commit -m "feat(sdr): add shared worker-secret verification helper"
```

---

### Task 5: `ISdrPilotSettings` — tipo + camada mock

**Files:**
- Create: `src/shared/types/sdr-pilot.ts`
- Modify: `src/shared/types/index.ts` (novo bloco de barrel export)
- Create: `src/mocks/api/sdrPilotSettings.ts`
- Modify: `src/mocks/generators/bootstrap.ts` (novo campo no dataset)
- Modify: `src/mocks/store/selectors.ts` (novo selector)
- Modify: `src/mocks/api/index.ts` (novo barrel export)

**Interfaces:**
- Consumes: `ID`, `ISO8601` de `./common`.
- Produces: `ISdrPilotSettings { storeId, sdrEnabled, backstopTimeoutMinutes, updatedAt, updatedBy }` e `sdrPilotSettingsApi.{get,update}` — consumidos pela Task 6.

Nomeado `ISdrPilotSettings` (não `ISdrSettings`) deliberadamente — já existe `ISdrSettingsTabProps`/`SdrSettingsTab` no simulador legado PRD-020 (`src/features/sdr-dashboard/`); são conceitos diferentes (kill-switch de produção vs. toggle do simulador mock) e o nome evita confusão.

- [ ] **Step 1: Criar o tipo**

Create `src/shared/types/sdr-pilot.ts`:

```ts
import type { ID, ISO8601 } from "./common";

/**
 * Operational, per-store settings for the real-production SDR pilot
 * (docs/superpowers/specs/2026-07-15-sdr-producao-parte-b-ativacao-design.md).
 * Model/provider/system-prompt for the "sdr" AI feature live in
 * `IAiSettings.routing` instead (aba Funcionalidades) — this type only
 * carries what's genuinely per-store and operational: the pilot kill-switch
 * and the backstop timeout.
 */
export interface ISdrPilotSettings {
  storeId: ID;
  sdrEnabled: boolean;
  backstopTimeoutMinutes: number;
  updatedAt: ISO8601;
  updatedBy: ID | null;
}
```

- [ ] **Step 2: Exportar no barrel**

In `src/shared/types/index.ts`, after the `// SDR Escalation (PRD-023)` block (ends around line 278), add:

```ts

// SDR production pilot settings (Parte B — 2026-07-15 design)
export type { ISdrPilotSettings } from "./sdr-pilot";
```

- [ ] **Step 3: Criar a mock API, com `ensureSettings` lazy-create (espelha `rotationQueuesApi.ensureQueue`)**

Create `src/mocks/api/sdrPilotSettings.ts`:

```ts
import type { ID, ISdrPilotSettings } from "@/shared/types";
import { selectAllSdrPilotSettings } from "../store/selectors";
import { useMockStore } from "../store/mockStore";
import { runApi } from "./utils";

/**
 * Mock API for the SDR production pilot's per-store settings. Lazily creates
 * a disabled row on first read — mirrors the real table (`sdr_settings`),
 * which only gains a row once someone saves from the UI, always starting
 * `sdr_enabled=false`.
 */
function ensureSettings(storeId: ID): ISdrPilotSettings {
  const existing = selectAllSdrPilotSettings().find((s) => s.storeId === storeId);
  if (existing) return existing;
  const created: ISdrPilotSettings = {
    storeId,
    sdrEnabled: false,
    backstopTimeoutMinutes: 2,
    updatedAt: new Date().toISOString(),
    updatedBy: null,
  };
  useMockStore.setState((state) => ({ sdrPilotSettings: [...state.sdrPilotSettings, created] }));
  return created;
}

export const sdrPilotSettingsApi = {
  get(storeId: ID): Promise<ISdrPilotSettings> {
    return runApi("sdrPilotSettingsApi", "get", () => ensureSettings(storeId), { payload: { storeId } });
  },

  update(
    storeId: ID,
    patch: { sdrEnabled?: boolean; backstopTimeoutMinutes?: number },
  ): Promise<ISdrPilotSettings> {
    return runApi(
      "sdrPilotSettingsApi",
      "update",
      () => {
        const current = ensureSettings(storeId);
        const updated: ISdrPilotSettings = {
          ...current,
          ...(patch.sdrEnabled !== undefined ? { sdrEnabled: patch.sdrEnabled } : {}),
          ...(patch.backstopTimeoutMinutes !== undefined
            ? { backstopTimeoutMinutes: patch.backstopTimeoutMinutes }
            : {}),
          updatedAt: new Date().toISOString(),
        };
        useMockStore.setState((state) => ({
          sdrPilotSettings: state.sdrPilotSettings.map((s) =>
            s.storeId === updated.storeId ? updated : s,
          ),
        }));
        return updated;
      },
      { payload: { storeId, patch } },
    );
  },
};
```

- [ ] **Step 4: Registrar o slice no dataset do bootstrap**

In `src/mocks/generators/bootstrap.ts`, in the `IBootstrappedDataset` interface (near the `rotationQueues`/`rotationParticipants` fields, around line 106), add:

```ts
  sdrPilotSettings: ISdrPilotSettings[];
```

Add the import at the top of the file alongside the other domain type imports:

```ts
import type { ISdrPilotSettings } from "@/shared/types";
```

In the final `dataset` object composition (near the `rotationQueues,`/`rotationParticipants,` lines, around line 590), add:

```ts
    sdrPilotSettings: [],
```

(Array vazio — não pré-semeia nenhuma loja, igual ao comportamento real da tabela `sdr_settings` em produção: só ganha linha quando alguém salva.)

- [ ] **Step 5: Adicionar o selector**

In `src/mocks/store/selectors.ts`, near the `selectAllRotationQueues`/SDR-related selectors, add:

```ts
export function selectAllSdrPilotSettings() {
  return getMockState().sdrPilotSettings;
}
```

- [ ] **Step 6: Exportar a API no barrel**

In `src/mocks/api/index.ts`, after the `sdrEscalationsApi` export line, add:

```ts
export { sdrPilotSettingsApi } from "./sdrPilotSettings";
```

- [ ] **Step 7: Verificar que compila**

Run: `bunx tsc --noEmit 2>&1 | grep -E "sdr-pilot|sdrPilotSettings|bootstrap.ts|selectors.ts"`
Expected: nenhuma linha de erro nova relacionada a esses arquivos (baseline pré-existente de erros do projeto não deve crescer — ver `docs/dev` sobre o baseline do `tsc`).

- [ ] **Step 8: Commit**

```bash
git add src/shared/types/sdr-pilot.ts src/shared/types/index.ts src/mocks/api/sdrPilotSettings.ts src/mocks/generators/bootstrap.ts src/mocks/store/selectors.ts src/mocks/api/index.ts
git commit -m "feat(sdr): add ISdrPilotSettings type and mock data layer"
```

---

### Task 6: Provider Pattern — `sdrPilotSettings`

**Files:**
- Create: `src/providers/data/contracts/sdrPilotSettings.ts`
- Create: `src/providers/data/impl/mock/sdrPilotSettings.ts`
- Create: `src/providers/data/impl/supabase/sdrPilotSettings.ts`
- Create: `src/providers/data/hooks/useSdrPilotSettingsProvider.ts`
- Modify: `src/providers/data/contracts/index.ts`
- Modify: `src/providers/data/index.ts`
- Modify: `src/providers/data/factory.ts`

**Interfaces:**
- Consumes: `ISdrPilotSettings` (Task 5), `sdrPilotSettingsApi` (Task 5), `getSupabaseClient` de `@/shared/lib/supabase`, `auditLog` de `@/features/rbac`.
- Produces: `useSdrPilotSettingsProvider()` — consumido pela Task 7 (UI).

- [ ] **Step 1: Contrato**

Create `src/providers/data/contracts/sdrPilotSettings.ts`:

```ts
import type { ID, ISdrPilotSettings } from "@/shared/types";

export interface ISdrPilotSettingsProvider {
  /** Returns the store's pilot settings, creating a disabled row if it does not exist. */
  get(storeId: ID): Promise<ISdrPilotSettings>;
  /** Patches the pilot kill-switch / backstop timeout. Audited. */
  update(
    storeId: ID,
    patch: { sdrEnabled?: boolean; backstopTimeoutMinutes?: number },
  ): Promise<ISdrPilotSettings>;
}
```

- [ ] **Step 2: Implementação mock**

Create `src/providers/data/impl/mock/sdrPilotSettings.ts`:

```ts
import { sdrPilotSettingsApi } from "@/mocks";
import { auditLog } from "@/features/rbac";
import type { ID } from "@/shared/types";
import type { ISdrPilotSettingsProvider } from "../../contracts/sdrPilotSettings";

/**
 * Mock implementation of {@link ISdrPilotSettingsProvider} — thin adapter over
 * `sdrPilotSettingsApi`, adding the audit trail on kill-switch/timeout changes.
 */
export const mockSdrPilotSettingsProvider: ISdrPilotSettingsProvider = {
  get: (storeId) => sdrPilotSettingsApi.get(storeId),
  async update(
    storeId: ID,
    patch: { sdrEnabled?: boolean; backstopTimeoutMinutes?: number },
  ) {
    const updated = await sdrPilotSettingsApi.update(storeId, patch);
    auditLog({
      action: "sdr_pilot.settings.update",
      resource: "sdr_settings",
      resourceId: updated.storeId,
      storeId: updated.storeId,
      after: { sdrEnabled: updated.sdrEnabled, backstopTimeoutMinutes: updated.backstopTimeoutMinutes },
    });
    return updated;
  },
};
```

- [ ] **Step 3: Implementação Supabase**

Create `src/providers/data/impl/supabase/sdrPilotSettings.ts`:

```ts
import type { ID, ISdrPilotSettings } from "@/shared/types";
import type { ISdrPilotSettingsProvider } from "../../contracts/sdrPilotSettings";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase implementation of {@link ISdrPilotSettingsProvider}. `ensureSettings`
 * lazily creates the store's row (defaults: disabled, 2min timeout) — mirrors
 * `rotationQueues`'s `ensureQueue` pattern. RLS: Owner-only read/write
 * (sdr_settings_owner_read/write, applied in the Parte A migration).
 */

interface SettingsRow {
  store_id: string;
  sdr_enabled: boolean;
  backstop_timeout_minutes: number;
  updated_at: string;
  updated_by: string | null;
}

const COLUMNS = "store_id, sdr_enabled, backstop_timeout_minutes, updated_at, updated_by";

function rowToSettings(r: SettingsRow): ISdrPilotSettings {
  return {
    storeId: r.store_id,
    sdrEnabled: r.sdr_enabled,
    backstopTimeoutMinutes: r.backstop_timeout_minutes,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  };
}

async function ensureSettings(storeId: ID): Promise<ISdrPilotSettings> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("sdr_settings")
    .select(COLUMNS)
    .eq("store_id", storeId)
    .maybeSingle();
  if (error) throw new Error(`[supabase] sdrPilotSettings.get failed: ${error.message}`);
  if (data) return rowToSettings(data as SettingsRow);
  const { data: created, error: insErr } = await client
    .from("sdr_settings")
    .insert({ store_id: storeId })
    .select(COLUMNS)
    .single();
  if (insErr) {
    // A concurrent create may have won the race — re-read.
    const { data: existing } = await client
      .from("sdr_settings")
      .select(COLUMNS)
      .eq("store_id", storeId)
      .maybeSingle();
    if (existing) return rowToSettings(existing as SettingsRow);
    throw new Error(`[supabase] sdrPilotSettings.create failed: ${insErr.message}`);
  }
  return rowToSettings(created as SettingsRow);
}

export const supabaseSdrPilotSettingsProvider: ISdrPilotSettingsProvider = {
  get: (storeId) => ensureSettings(storeId),

  async update(storeId, patch) {
    const current = await ensureSettings(storeId);
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.sdrEnabled !== undefined) row.sdr_enabled = patch.sdrEnabled;
    if (patch.backstopTimeoutMinutes !== undefined) {
      row.backstop_timeout_minutes = patch.backstopTimeoutMinutes;
    }
    const { data, error } = await getSupabaseClient()
      .from("sdr_settings")
      .update(row)
      .eq("store_id", current.storeId)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] sdrPilotSettings.update failed: ${error.message}`);
    return rowToSettings(data as SettingsRow);
  },
};
```

- [ ] **Step 4: Hook**

Create `src/providers/data/hooks/useSdrPilotSettingsProvider.ts`:

```ts
import type { ISdrPilotSettingsProvider } from "../contracts/sdrPilotSettings";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useSdrPilotSettingsProvider(): ISdrPilotSettingsProvider {
  return useDataProviderSlice("sdrPilotSettings", "useSdrPilotSettingsProvider");
}
```

- [ ] **Step 5: Registrar no contrato agregado**

In `src/providers/data/contracts/index.ts`:

Add near the other `import type` lines (alongside `IAiProvider`):

```ts
import type { ISdrPilotSettingsProvider } from "./sdrPilotSettings";
```

Add near the other `export type` lines:

```ts
export type { ISdrPilotSettingsProvider } from "./sdrPilotSettings";
```

Add to the `IDataProviders` interface, near the `ai: IAiProvider;` entry:

```ts
  sdrPilotSettings: ISdrPilotSettingsProvider;
```

- [ ] **Step 6: Registrar no barrel público**

In `src/providers/data/index.ts`, add near the other provider type/hook exports:

```ts
export type { ISdrPilotSettingsProvider } from "./contracts/sdrPilotSettings";
export { useSdrPilotSettingsProvider } from "./hooks/useSdrPilotSettingsProvider";
```

- [ ] **Step 7: Registrar no factory**

In `src/providers/data/factory.ts`:

Add mock import near the other mock imports:

```ts
import { mockSdrPilotSettingsProvider } from "./impl/mock/sdrPilotSettings";
```

Add supabase import near the other supabase imports:

```ts
import { supabaseSdrPilotSettingsProvider } from "./impl/supabase/sdrPilotSettings";
```

Register in the mock providers map (near `ai: mockAiProvider,`):

```ts
  sdrPilotSettings: mockSdrPilotSettingsProvider,
```

Register in the supabase providers map (near `ai: supabaseAiProvider,`):

```ts
  sdrPilotSettings: supabaseSdrPilotSettingsProvider,
```

- [ ] **Step 8: Verificar que compila e os testes existentes não quebraram**

Run: `bunx tsc --noEmit 2>&1 | grep -iE "sdrPilotSettings|providers/data"`
Expected: sem erros novos.

Run: `bun run test`
Expected: PASS — nenhuma suíte quebrou (não há testes de provider adapters neste repo, então nenhum teste novo é esperado aqui).

- [ ] **Step 9: Commit**

```bash
git add src/providers/data/contracts/sdrPilotSettings.ts src/providers/data/impl/mock/sdrPilotSettings.ts src/providers/data/impl/supabase/sdrPilotSettings.ts src/providers/data/hooks/useSdrPilotSettingsProvider.ts src/providers/data/contracts/index.ts src/providers/data/index.ts src/providers/data/factory.ts
git commit -m "feat(sdr): wire sdrPilotSettings into the Provider Pattern"
```

---

### Task 7: Aba "SDR" em `/app/configuracoes/ia`

**Files:**
- Create: `src/features/ai-settings/pages/AiSdrTab.tsx`
- Modify: `src/features/ai-settings/pages/AiSettingsPage.tsx`
- Modify: `src/features/ai-settings/i18n/pt-BR.ts`

**Interfaces:**
- Consumes: `useSdrPilotSettingsProvider()` (Task 6), `useCurrentStore()` de `@/features/multistore`.
- Produces: nada consumido por tasks futuras (é a folha da árvore de UI).

- [ ] **Step 1: Strings**

In `src/features/ai-settings/i18n/pt-BR.ts`, modify the `tabs` block and add new keys:

```ts
export const AI_STRINGS = {
  title: "Inteligência artificial",
  subtitle: "Provedores, modelos por funcionalidade e consumo · configuração global da plataforma",
  tabs: {
    overview: "Visão geral",
    providers: "Provedores & chaves",
    features: "Funcionalidades",
    playground: "Playground",
    sdr: "SDR",
  },
  masterOn: "IA ativa",
  masterOff: "IA desativada",
  emptyUsage: "Nenhum consumo registrado ainda — configure um provedor para começar.",
  saved: "Alterações salvas.",
  saveError: "Não foi possível salvar as alterações.",
  sdrPilot: {
    hint:
      "Provedor, modelo e prompt de sistema do SDR são configurados na aba Funcionalidades, junto com as demais funcionalidades de IA. Aqui você liga o piloto e ajusta o tempo de espera desta loja.",
    enabledLabel: "SDR ativo nesta loja",
    timeoutLabel: "Tempo de espera até o SDR assumir (minutos)",
    timeoutHint: "Fora do horário comercial, o SDR assume imediatamente.",
    noStore: "Selecione uma loja para configurar o SDR.",
  },
} as const;
```

- [ ] **Step 2: Componente da aba**

Create `src/features/ai-settings/pages/AiSdrTab.tsx`:

```tsx
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useCurrentStore } from "@/features/multistore";
import { useSdrPilotSettingsProvider } from "@/providers/data";
import type { ISdrPilotSettings } from "@/shared/types";
import { AI_STRINGS } from "../i18n/pt-BR";

export function AiSdrTab() {
  const { currentStoreId } = useCurrentStore();
  const provider = useSdrPilotSettingsProvider();
  const [settings, setSettings] = useState<ISdrPilotSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeoutInput, setTimeoutInput] = useState("2");

  useEffect(() => {
    if (!currentStoreId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void provider
      .get(currentStoreId)
      .then((s) => {
        setSettings(s);
        setTimeoutInput(String(s.backstopTimeoutMinutes));
      })
      .finally(() => setLoading(false));
  }, [currentStoreId, provider]);

  const patch = async (p: { sdrEnabled?: boolean; backstopTimeoutMinutes?: number }) => {
    if (!currentStoreId) return;
    try {
      const updated = await provider.update(currentStoreId, p);
      setSettings(updated);
      toast.success(AI_STRINGS.saved);
    } catch {
      toast.error(AI_STRINGS.saveError);
    }
  };

  if (!currentStoreId) {
    return <p className="text-sm text-muted-foreground">{AI_STRINGS.sdrPilot.noStore}</p>;
  }
  if (loading || !settings) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <Icon icon="mdi:directions-fork" className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>{AI_STRINGS.sdrPilot.hint}</span>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">{AI_STRINGS.sdrPilot.enabledLabel}</span>
          <Switch
            checked={settings.sdrEnabled}
            onCheckedChange={(v) => patch({ sdrEnabled: v })}
            aria-label={AI_STRINGS.sdrPilot.enabledLabel}
          />
        </div>

        <label className="mt-4 block text-xs text-muted-foreground">
          {AI_STRINGS.sdrPilot.timeoutLabel}
          <input
            type="number"
            min={1}
            max={60}
            value={timeoutInput}
            onChange={(e) => setTimeoutInput(e.target.value)}
            onBlur={() => {
              const parsed = Math.min(60, Math.max(1, Number(timeoutInput) || 2));
              setTimeoutInput(String(parsed));
              if (parsed !== settings.backstopTimeoutMinutes) {
                void patch({ backstopTimeoutMinutes: parsed });
              }
            }}
            className="mt-1 w-full max-w-40 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
        <p className="mt-1 text-xs text-muted-foreground">{AI_STRINGS.sdrPilot.timeoutHint}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Registrar a 5ª aba**

In `src/features/ai-settings/pages/AiSettingsPage.tsx`, add the import:

```ts
import { AiSdrTab } from "./AiSdrTab";
```

Add a `TabsTrigger` after the Playground one:

```tsx
          <TabsTrigger value="sdr">{AI_STRINGS.tabs.sdr}</TabsTrigger>
```

Add a `TabsContent` after the Playground one:

```tsx
        <TabsContent value="sdr" className="mt-4">
          <AiSdrTab />
        </TabsContent>
```

In `src/routes/app.configuracoes.ia.tsx`, the search-param validator restricts `aba` to a fixed tuple — widen it:

```ts
const ABAS = ["visao-geral", "provedores", "funcionalidades", "playground", "sdr"] as const;
```

(única mudança neste arquivo — substitui a linha 6 atual, que hoje não inclui `"sdr"`.)

- [ ] **Step 4: Verificar que compila**

Run: `bunx tsc --noEmit 2>&1 | grep -iE "ai-settings|app.configuracoes.ia"`
Expected: sem erros novos.

Run: `bun run build`
Expected: build passa (o script `predev`/`prebuild` roda `copy-changelog.mjs` antes — normal).

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-settings/pages/AiSdrTab.tsx src/features/ai-settings/pages/AiSettingsPage.tsx src/features/ai-settings/i18n/pt-BR.ts src/routes/app.configuracoes.ia.tsx
git commit -m "feat(sdr): add SDR tab to the AI settings hub"
```

**Nota:** validação visual desta aba (abrir o browser, conferir layout/comportamento) fica a cargo do dono — não faz parte deste plano.

---

### Task 8: `sdr-respond/dispatch.ts` — despacho dual-pipeline

**Files:**
- Create: `supabase/functions/sdr-respond/dispatch.ts`

**Interfaces:**
- Consumes: `processSendRequest`/`ISendDb`/`ISender` de `../_shared/whatsapp/send/core.ts`; `makeSendDb`/`makeEngineDeps` de `../_shared/whatsappSendAdapter.ts`; `buildWhatsAppEngine` de `../_shared/whatsapp/build.ts`; `buildSystemSender` de `../_shared/whatsapp/scheduled/core.ts`; `sendWahaText` de `../_shared/whatsapp/waha/send.ts`; `createSecretResolver` de `../_shared/secrets.ts`.
- Produces: `dispatchSdrReply(admin, traceId, conversationId, storeId, text): Promise<{ messageId: string }>` — consumido pela Task 9.

Isola a complexidade de "existem dois pipelines de envio isolados" (legado via `processSendRequest`, WAHA via chamada direta a `_shared/whatsapp/waha/send.ts` — `waha-send/index.ts` **não é tocado**, ele é `verify_jwt` normal e exige usuário logado; o SDR nunca passa por ali) num único módulo pequeno, para o `index.ts` da Task 9 não crescer descontroladamente.

- [ ] **Step 1: Implementar**

Create `supabase/functions/sdr-respond/dispatch.ts`:

```ts
/**
 * Dispatches the SDR's reply to the customer. Two isolated pipelines exist in
 * this codebase for outbound WhatsApp sends:
 *
 *  - Legacy (meta / evolution / evolution-go / openwa): `processSendRequest`,
 *    the same core `scheduled-send-worker` already uses without a logged-in
 *    user (buildSystemSender + service_role).
 *  - WAHA: `waha-send/index.ts` is deliberately "FULLY ISOLATED" and requires
 *    a real user JWT — it is NOT called here. Instead this module imports the
 *    same low-level send functions (`sendWahaText`) directly and persists the
 *    message row itself, exactly mirroring what `waha-send/index.ts` does
 *    internally, without touching that file.
 */
import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { createSecretResolver } from "../_shared/secrets.ts";
import { makeSendDb, makeEngineDeps } from "../_shared/whatsappSendAdapter.ts";
import { buildWhatsAppEngine } from "../_shared/whatsapp/build.ts";
import { buildSystemSender } from "../_shared/whatsapp/scheduled/core.ts";
import { processSendRequest, type ISendRequest } from "../_shared/whatsapp/send/core.ts";
import { sendWahaText } from "../_shared/whatsapp/waha/send.ts";
import { HttpError } from "../_shared/http.ts";

interface IConversationAccountRow {
  whatsapp_account_id: string | null;
  customers: { phone: string | null } | null;
}

async function dispatchWaha(
  admin: SupabaseClient,
  conversationId: string,
  accountId: string,
  text: string,
): Promise<{ messageId: string }> {
  const { data: account } = await admin
    .from("whatsapp_accounts")
    .select("id, provider_config, waha_server_id")
    .eq("id", accountId)
    .maybeSingle();
  if (!account) throw new HttpError(422, "conta WAHA não encontrada");
  const sessionName = String(
    (account.provider_config as Record<string, unknown> | null)?.sessionName ?? "",
  );
  if (!sessionName) throw new HttpError(422, "sessão WAHA sem sessionName configurado");

  const { data: server } = await admin
    .from("waha_servers")
    .select("base_url, api_key_ref")
    .eq("id", account.waha_server_id as string)
    .maybeSingle();
  if (!server) throw new HttpError(422, "servidor WAHA não encontrado");
  const baseUrl = String(server.base_url ?? "").replace(/\/+$/, "");
  const apiKey = await createSecretResolver(admin)(String(server.api_key_ref ?? ""));
  if (!apiKey) throw new HttpError(422, "chave de API do servidor WAHA não definida");

  const { data: convRow } = await admin
    .from("conversations")
    .select("customers(phone)")
    .eq("id", conversationId)
    .maybeSingle<IConversationAccountRow>();
  const toPhone = convRow?.customers?.phone;
  if (!toPhone) throw new HttpError(422, "cliente sem telefone cadastrado");

  const messageId = crypto.randomUUID();
  const { error: insertErr } = await admin.from("messages").insert({
    id: messageId,
    conversation_id: conversationId,
    direction: "out",
    author_type: "sdr",
    author_id: null,
    provider: "waha",
    text,
    status: "queued",
    sent_at: new Date().toISOString(),
  });
  if (insertErr) throw new HttpError(500, `falha ao registrar a mensagem: ${insertErr.message}`);

  try {
    const result = await sendWahaText(apiKey, globalThis.fetch, { baseUrl, sessionName }, {
      toPhone,
      text,
    });
    await admin
      .from("messages")
      .update({ status: "sent", provider_message_id: result.providerMessageId })
      .eq("id", messageId);
    await admin
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);
    return { messageId };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await admin.from("messages").update({ status: "failed", failure_reason: reason }).eq("id", messageId);
    throw err;
  }
}

async function dispatchLegacy(
  admin: SupabaseClient,
  traceId: string,
  conversationId: string,
  storeId: string,
  text: string,
): Promise<{ messageId: string }> {
  const db = makeSendDb(admin, traceId);
  const deps = makeEngineDeps(admin, traceId);
  const request: ISendRequest = { conversationId, kind: "text", text };
  const result = await processSendRequest({
    input: request,
    sender: buildSystemSender(storeId),
    db,
    buildProvider: (account) =>
      buildWhatsAppEngine({
        engine: account.provider,
        accountId: account.id,
        providerConfig: account.providerConfig,
        credentialsRef: account.credentialsRef,
        deps,
      }),
    traceId,
  });
  return { messageId: result.messageId };
}

/** Dispatches the SDR's reply, branching on the conversation's account provider. */
export async function dispatchSdrReply(
  admin: SupabaseClient,
  traceId: string,
  conversationId: string,
  storeId: string,
  text: string,
): Promise<{ messageId: string }> {
  const { data: conv } = await admin
    .from("conversations")
    .select("whatsapp_account_id")
    .eq("id", conversationId)
    .maybeSingle();
  const accountId = conv?.whatsapp_account_id as string | null;
  if (!accountId) throw new HttpError(422, "conversa sem conta WhatsApp associada");

  const { data: account } = await admin
    .from("whatsapp_accounts")
    .select("provider")
    .eq("id", accountId)
    .maybeSingle();
  if (!account) throw new HttpError(422, "conta WhatsApp não encontrada");

  if (account.provider === "waha") {
    return dispatchWaha(admin, conversationId, accountId, text);
  }
  return dispatchLegacy(admin, traceId, conversationId, storeId, text);
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/sdr-respond/dispatch.ts
git commit -m "feat(sdr-respond): add dual-pipeline dispatch (legacy + WAHA)"
```

(Sem teste automatizado — arquivo Deno com imports `https://esm.sh/...`, fora do `tsconfig.json` raiz; ver Global Constraints.)

---

### Task 9: `sdr-respond/index.ts` — o handler

**Files:**
- Create: `supabase/functions/sdr-respond/index.ts`

**Interfaces:**
- Consumes: `containsCommercialValue` (guardrails.ts), `parseSdrLlmDecision`/`ISdrLlmDecision` (llmDecision.ts), `enforceSdrGuardrails` (enforceGuardrails.ts), `buildSdrSystemPrompt`/`ISdrPromptContext` (systemPrompt.ts), `computeCustomerEnrichmentPatch` (enrichment.ts) — todos já existentes da Parte A; `chooseHumanSeller` (`_shared/sdr-escalation/engine/choose-seller.ts`), `buildContextSummary` (`_shared/sdr-escalation/engine/build-summary.ts`), `escalateToHuman` (`_shared/sdr-escalation/engine/escalate.ts`); `callAnthropic`/`callOpenAI`/`callOpenRouter`/`computeCostBRL`/`LlmRequest` (`_shared/ai/adapters.ts`); `verifyWorkerSecret` (Task 4); `dispatchSdrReply` (Task 8).
- Produces: endpoint público `POST /functions/v1/sdr-respond` `{ conversationId: string }` — consumido pelas Tasks 10 (tick) e 11 (webhook).

- [ ] **Step 1: Implementar**

Create `supabase/functions/sdr-respond/index.ts`:

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * sdr-respond — a próxima do catálogo. Proxy interno (nunca chamado por
 * usuário logado — só por sdr-backstop-tick e pelo whatsapp-webhook, ambos
 * fire-and-forget) que roda um turno do agente SDR de recepção/triagem
 * (docs/superpowers/specs/2026-07-15-sdr-producao-parte-b-ativacao-design.md).
 *
 * Pública (verify_jwt off), protegida por x-worker-secret (SDR_WORKER_SECRET)
 * — mesmo padrão do scheduled-send-worker.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requiredEnv } from "../_shared/env.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { verifyWorkerSecret } from "../_shared/workerAuth.ts";
import {
  callAnthropic,
  callOpenAI,
  callOpenRouter,
  computeCostBRL,
  type LlmRequest,
  type LlmResult,
} from "../_shared/ai/adapters.ts";
import { chooseHumanSeller, type IChooseSellerInput } from "../_shared/sdr-escalation/engine/choose-seller.ts";
import { buildContextSummary } from "../_shared/sdr-escalation/engine/build-summary.ts";
import { escalateToHuman, type IEscalateToHumanInput } from "../_shared/sdr-escalation/engine/escalate.ts";
import { containsCommercialValue } from "./guardrails.ts";
import { parseSdrLlmDecision, type ISdrLlmDecision } from "./llmDecision.ts";
import { enforceSdrGuardrails } from "./enforceGuardrails.ts";
import { buildSdrSystemPrompt } from "./systemPrompt.ts";
import { computeCustomerEnrichmentPatch } from "./enrichment.ts";
import { dispatchSdrReply } from "./dispatch.ts";

const WORKER_SECRET_NAME = "SDR_WORKER_SECRET";
const LLM_TIMEOUT_MS = 60_000;
const MAX_REPLY_TOKENS = 500;
const KEY_BY_PROVIDER: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

interface RoutingEntry {
  feature: string;
  enabled: boolean;
  providerId: string;
  model: string;
  params?: { temperature?: number; maxTokens?: number; topP?: number };
  systemPrompt?: string;
}
interface AiSettingsRow {
  master_enabled: boolean;
  budget: { monthlyCapBRL: number; alertThresholdPct: number; usdToBrl: number };
  providers: Array<{
    provider: string;
    models: Array<{ id: string; inputPricePer1kUsd: number; outputPricePer1kUsd: number }>;
  }>;
  routing: RoutingEntry[];
}

function dispatchLlm(
  providerId: string,
  apiKey: string,
  req: LlmRequest,
  signal: AbortSignal,
): Promise<LlmResult> {
  if (providerId === "anthropic") return callAnthropic(apiKey, req, signal);
  if (providerId === "openai") return callOpenAI(apiKey, req, signal);
  return callOpenRouter(apiKey, req, signal);
}

async function monthSpendBRL(admin: SupabaseClient): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { data } = await admin.from("ai_usage_events").select("cost_brl").gte("ts", start.toISOString());
  return (data ?? []).reduce((a: number, r: { cost_brl: number | string }) => a + Number(r.cost_brl), 0);
}

servePost(async (req, ctx) => {
  const admin = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  const expected = await createSecretResolver(admin)(WORKER_SECRET_NAME);
  const provided = req.headers.get("x-worker-secret") ?? "";
  if (!verifyWorkerSecret(provided, expected)) throw new HttpError(401, "unauthorized");

  const body = await parseJsonBody(req);
  const conversationId = String(body.conversationId ?? "");
  if (!conversationId) throw new HttpError(400, "conversationId é obrigatório");

  // 1. Conversation + customer.
  const { data: conv } = await admin
    .from("conversations")
    .select("id, store_id, customer_id, is_sdr_active")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return json({ skipped: "conversation not found" }, 200);
  if (!conv.is_sdr_active) return json({ skipped: "sdr not active on this conversation" }, 200);
  const storeId = conv.store_id as string;

  // 2. sdr_settings kill-switch.
  const { data: pilot } = await admin
    .from("sdr_settings")
    .select("sdr_enabled")
    .eq("store_id", storeId)
    .maybeSingle();
  if (!pilot?.sdr_enabled) return json({ skipped: "sdr disabled for this store" }, 200);

  // 3. ai_settings routing.
  const { data: aiSettings } = await admin
    .from("ai_settings")
    .select("master_enabled, budget, providers, routing")
    .eq("id", 1)
    .maybeSingle<AiSettingsRow>();
  if (!aiSettings?.master_enabled) return json({ skipped: "ai master switch off" }, 200);
  const route = aiSettings.routing.find((r) => r.feature === "sdr");
  if (!route?.enabled) return json({ skipped: "sdr feature routing disabled" }, 200);
  const providerId = route.providerId;
  if (!KEY_BY_PROVIDER[providerId]) return json({ skipped: "unsupported provider" }, 200);

  // 4. Budget hard cap (best-effort).
  const spent = await monthSpendBRL(admin);
  if (aiSettings.budget.monthlyCapBRL > 0 && spent >= aiSettings.budget.monthlyCapBRL) {
    return json({ skipped: "ai budget exhausted" }, 200);
  }

  // 5. Customer + prior-conversation context (returning-customer detection).
  let preferredName: string | undefined;
  let customerName: string | null = null;
  let customerCity: string | null = null;
  let customerId: string | null = null;
  if (conv.customer_id) {
    customerId = conv.customer_id as string;
    const { data: customer } = await admin
      .from("customers")
      .select("full_name, city, seller_id")
      .eq("id", customerId)
      .maybeSingle();
    customerName = (customer?.full_name as string | null) ?? null;
    customerCity = (customer?.city as string | null) ?? null;
  }
  const { count: priorConvCount } = await admin
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId ?? "")
    .neq("id", conversationId);
  const isReturningCustomer = Boolean(customerId) && (priorConvCount ?? 0) > 0;

  // 6. sdr_sessions — find-or-create.
  const { data: existingSession } = await admin
    .from("sdr_sessions")
    .select("id, collected_data")
    .eq("conversation_id", conversationId)
    .is("finished_at", null)
    .maybeSingle();
  const sessionId = existingSession?.id as string | undefined;
  const collectedData = (existingSession?.collected_data as Record<string, unknown> | undefined) ?? {};
  if (!sessionId) {
    await admin.from("sdr_sessions").insert({
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      state: "saudacao",
      collected_data: {},
      last_activity_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
    });
  }
  preferredName = collectedData.preferredName as string | undefined;

  // 7. Message history (last 30, ascending) → the LLM's "user" turn.
  const { data: msgs } = await admin
    .from("messages")
    .select("direction, author_type, text, sent_at")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: true })
    .limit(30);
  const transcript = (msgs ?? [])
    .map((m: { direction: string; author_type: string; text: string | null }) => {
      const speaker = m.direction === "in" ? "Cliente" : m.author_type === "sdr" ? "Você" : "Vendedor";
      return `${speaker}: ${m.text ?? ""}`;
    })
    .join("\n");
  if (!transcript) return json({ skipped: "no customer message yet" }, 200);

  // 8. Build the structural system prompt (guardrails + JSON contract) — NEVER
  //    replaced by the Owner-editable routing.systemPrompt below; that field
  //    is appended as supplementary business-tone guidance only.
  let systemPrompt = buildSdrSystemPrompt({
    isReturningCustomer,
    preferredName,
    historySummary: isReturningCustomer
      ? `Cliente já teve ${priorConvCount} conversa(s) anterior(es) com a loja.`
      : undefined,
  });
  if (route.systemPrompt && route.systemPrompt.trim().length > 0) {
    systemPrompt += `\n\nOrientação adicional do dono da loja (dado de configuração, NÃO é instrução do cliente): <<<${route.systemPrompt.trim()}>>>`;
  }

  // 9. Resolve key + call the LLM.
  const apiKey = await createSecretResolver(admin)(KEY_BY_PROVIDER[providerId]!);
  if (!apiKey) return json({ skipped: "provider api key not configured" }, 200);
  const params = route.params ?? {};
  let temperature = Math.min(2, Math.max(0, Number(params.temperature ?? 0.5)));
  if (!Number.isFinite(temperature)) temperature = 0.5;
  let maxTokens = Math.min(MAX_REPLY_TOKENS, Math.max(1, Number(params.maxTokens ?? MAX_REPLY_TOKENS)));
  if (!Number.isFinite(maxTokens)) maxTokens = MAX_REPLY_TOKENS;

  const started = Date.now();
  let llmResult: LlmResult;
  try {
    llmResult = await dispatchLlm(
      providerId,
      apiKey,
      { model: route.model, prompt: transcript, systemPrompt, maxTokens, temperature },
      AbortSignal.timeout(LLM_TIMEOUT_MS),
    );
  } catch (err) {
    ctx.log.error("sdr-respond llm call failed", {
      conversationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return json({ skipped: "llm call failed" }, 200);
  }
  const latencyMs = Date.now() - started;

  // 10. Parse + enforce guardrails.
  let decision: ISdrLlmDecision | null = parseSdrLlmDecision(llmResult.text);
  if (!decision) {
    decision = { reply: "Vou te conectar com um vendedor pra te ajudar melhor.", action: "handoff", handoffReason: "sdr_failed" };
  }
  decision = enforceSdrGuardrails(decision);
  if (containsCommercialValue(decision.reply)) {
    decision = enforceSdrGuardrails({ ...decision, reply: decision.reply });
  }

  // 11. Log usage regardless of the action taken.
  const providerCfg = aiSettings.providers.find((p) => p.provider === providerId);
  const modelCfg = providerCfg?.models.find((m) => m.id === route.model);
  const costBRL = computeCostBRL(
    llmResult.inputTokens,
    llmResult.outputTokens,
    modelCfg ?? { inputPricePer1kUsd: 0, outputPricePer1kUsd: 0 },
    aiSettings.budget.usdToBrl,
    llmResult.usdCost,
  );
  await admin.from("ai_usage_events").insert({
    source: "routed",
    feature: "sdr",
    provider_id: providerId,
    model: route.model,
    input_tokens: llmResult.inputTokens,
    output_tokens: llmResult.outputTokens,
    cost_brl: costBRL,
    latency_ms: latencyMs,
    status: "ok",
    caller_id: null,
    store_id: storeId,
  });

  // 12. Non-destructive enrichment.
  if (decision.collectedData && customerId) {
    const patch = computeCustomerEnrichmentPatch(
      { name: customerName, city: customerCity },
      { preferredName: decision.collectedData.preferredName, location: decision.collectedData.location },
    );
    if (Object.keys(patch).length > 0) {
      await admin
        .from("customers")
        .update({ ...(patch.name ? { full_name: patch.name } : {}), ...(patch.city ? { city: patch.city } : {}) })
        .eq("id", customerId);
    }
  }

  // 13. Persist session state.
  const nextCollectedData = { ...collectedData, ...decision.collectedData };
  const isFinishing = decision.action === "handoff" || decision.action === "close";
  await admin
    .from("sdr_sessions")
    .update({
      state: decision.action === "handoff" ? "aguardando_humano" : "qualificacao",
      collected_data: nextCollectedData,
      last_activity_at: new Date().toISOString(),
      ...(isFinishing
        ? {
            finished_at: new Date().toISOString(),
            finish_reason: decision.action === "handoff" ? "escalated" : "completed",
          }
        : {}),
    })
    .eq("conversation_id", conversationId)
    .is("finished_at", null);

  // 14. Send the reply (unless the SDR is closing with nothing to say).
  if (decision.reply && decision.reply.trim().length > 0) {
    await dispatchSdrReply(admin, ctx.traceId, conversationId, storeId, decision.reply);
  }

  // 15. Handoff → escalate to a human seller.
  if (decision.action === "handoff" && decision.handoffReason) {
    const { data: sellers } = await admin
      .from("sellers")
      .select("id, full_name, availability, active, store_id")
      .eq("store_id", storeId)
      .eq("active", true);
    const sellerRows = (sellers ?? []) as Array<{
      id: string;
      full_name: string;
      availability: "online" | "ausente" | "ocupado" | "offline";
      active: boolean;
      store_id: string;
    }>;
    // Only the 5 fields chooseHumanSeller actually reads — cast bridges the
    // narrow DB row shape to the full domain ISeller type it's typed against.
    const sellersForCascade = sellerRows.map((s) => ({
      id: s.id,
      fullName: s.full_name,
      availability: s.availability,
      active: s.active,
      storeId: s.store_id,
    })) as unknown as IChooseSellerInput["sellers"];

    const { data: openConvCounts } = await admin
      .from("conversations")
      .select("assigned_seller_id")
      .eq("store_id", storeId)
      .eq("status", "aguardando")
      .not("assigned_seller_id", "is", null);
    const loadBySeller: Record<string, number> = {};
    for (const row of openConvCounts ?? []) {
      const id = row.assigned_seller_id as string;
      loadBySeller[id] = (loadBySeller[id] ?? 0) + 1;
    }

    const { data: customerRow } = customerId
      ? await admin.from("customers").select("seller_id").eq("id", customerId).maybeSingle()
      : { data: null };

    const summary = buildContextSummary({
      session: {
        id: sessionId ?? crypto.randomUUID(),
        conversationId,
        state: "aguardando_humano",
        collectedData: nextCollectedData,
        lastActivityAt: new Date().toISOString(),
        startedAt: existingSession ? new Date().toISOString() : new Date().toISOString(),
      } as unknown as Parameters<typeof buildContextSummary>[0]["session"],
      conversation: { id: conversationId } as unknown as Parameters<typeof buildContextSummary>[0]["conversation"],
      messages: [] as unknown as Parameters<typeof buildContextSummary>[0]["messages"],
      reasonText: decision.reply,
    });

    const escalateInput: IEscalateToHumanInput = {
      sessionId: sessionId ?? crypto.randomUUID(),
      conversationId,
      storeId,
      customerId: customerId ?? undefined,
      reason: decision.handoffReason,
      context: summary,
      selection: {
        storeId,
        sellers: sellersForCascade,
        loadBySeller,
        carteiraSellerId: (customerRow?.seller_id as string | null) ?? undefined,
        excludeSellerIds: [],
      },
    };
    const { escalation, selection } = escalateToHuman(escalateInput);
    await admin.from("sdr_escalations").insert({
      id: escalation.id,
      session_id: escalation.sessionId,
      conversation_id: conversationId,
      customer_id: customerId,
      store_id: storeId,
      reason: escalation.reason,
      mode: escalation.mode,
      context_summary: escalation.contextSummary,
      assigned_seller_id: selection.selectedSellerId,
      assigned_at: selection.selectedSellerId ? new Date().toISOString() : null,
      status: selection.selectedSellerId ? "assigned" : "pending",
      specialty_matched: selection.specialtyMatched,
    });
    if (selection.selectedSellerId) {
      await admin
        .from("conversations")
        .update({ assigned_seller_id: selection.selectedSellerId, is_sdr_active: false })
        .eq("id", conversationId);
    }
  } else if (decision.action === "close") {
    await admin.from("conversations").update({ is_sdr_active: false }).eq("id", conversationId);
  }

  return json({ action: decision.action, traceId: ctx.traceId }, 200);
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/sdr-respond/index.ts
git commit -m "feat(sdr-respond): add the production handler"
```

(Sem teste automatizado — mesma nota da Task 8. Verificação é revisão cuidadosa desta task contra as assinaturas reais citadas em "Interfaces". Smoke real só acontece após deploy, gated no dono.)

---

### Task 10: `sdr-backstop-tick` — Edge Function + migration do cron

**Files:**
- Create: `supabase/functions/sdr-backstop-tick/index.ts`
- Create: `supabase/migrations/20260715150000_sdr_backstop_cron_trigger.sql` (aplicada **depois** do deploy da function — ver comentário no arquivo)

**Interfaces:**
- Consumes: `isWithinBusinessHours` (`_shared/distribution/engine/businessHours.ts`, Task 3); `verifyWorkerSecret` (Task 4); `integration_secret_get` (RPC já existente, usada por `scheduled_send_cron_trigger.sql`).
- Produces: endpoint público `POST /functions/v1/sdr-backstop-tick` (chamado só pelo `pg_cron`); dispara `sdr-respond` (Task 9) via fetch fire-and-forget.

- [ ] **Step 1: Implementar a Edge Function**

Create `supabase/functions/sdr-backstop-tick/index.ts`:

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * sdr-backstop-tick — agendada via pg_cron a cada 1 minuto (mesmo padrão de
 * scheduled-send-tick). Varre conversas em fila das lojas com sdr_enabled=true,
 * calcula o threshold por loja (0 fora do horário comercial,
 * backstop_timeout_minutes dentro dele) e liga o SDR nas que estouraram.
 *
 * docs/superpowers/specs/2026-07-15-sdr-producao-parte-b-ativacao-design.md
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requiredEnv } from "../_shared/env.ts";
import { HttpError, json } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { verifyWorkerSecret } from "../_shared/workerAuth.ts";
import { isWithinBusinessHours } from "../_shared/distribution/engine/businessHours.ts";

const WORKER_SECRET_NAME = "SDR_WORKER_SECRET";

interface IQueuedConversationRow {
  id: string;
  store_id: string;
  queued_at: string;
}
interface IPilotStoreRow {
  store_id: string;
  backstop_timeout_minutes: number;
}

servePost(async (req, ctx) => {
  const admin = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  const expected = await createSecretResolver(admin)(WORKER_SECRET_NAME);
  const provided = req.headers.get("x-worker-secret") ?? "";
  if (!verifyWorkerSecret(provided, expected)) throw new HttpError(401, "unauthorized");

  // 1. Only stores opted into the pilot.
  const { data: pilotStores } = await admin
    .from("sdr_settings")
    .select("store_id, backstop_timeout_minutes")
    .eq("sdr_enabled", true);
  const pilotRows = (pilotStores ?? []) as IPilotStoreRow[];
  if (pilotRows.length === 0) return json({ activated: 0 }, 200);
  const timeoutByStore = new Map(pilotRows.map((r) => [r.store_id, r.backstop_timeout_minutes]));

  // 2. Queued conversations for those stores (uses conversations_sdr_backstop_queue_idx).
  const { data: queued } = await admin
    .from("conversations")
    .select("id, store_id, queued_at")
    .in("store_id", pilotRows.map((r) => r.store_id))
    .is("assigned_seller_id", null)
    .eq("is_sdr_active", false)
    .eq("status", "aguardando")
    .not("queued_at", "is", null);
  const rows = (queued ?? []) as IQueuedConversationRow[];
  if (rows.length === 0) return json({ activated: 0 }, 200);

  // 3. Business hours per store (jsonb blob — see stores.settings.distribution.businessHours).
  const storeIds = [...new Set(rows.map((r) => r.store_id))];
  const { data: stores } = await admin.from("stores").select("id, settings").in("id", storeIds);
  const businessHoursByStore = new Map<string, boolean>();
  const now = new Date();
  for (const store of stores ?? []) {
    const settings = store.settings as { distribution?: { businessHours?: unknown } } | null;
    const windows = (settings?.distribution?.businessHours ?? []) as Parameters<
      typeof isWithinBusinessHours
    >[1];
    businessHoursByStore.set(store.id as string, isWithinBusinessHours(now, windows));
  }

  // 4. Activate whoever crossed the threshold, fire sdr-respond fire-and-forget.
  const sdrRespondUrl = `${requiredEnv("SUPABASE_URL")}/functions/v1/sdr-respond`;
  const workerSecret = expected!;
  let activated = 0;
  for (const row of rows) {
    const withinHours = businessHoursByStore.get(row.store_id) ?? false;
    const thresholdMinutes = withinHours ? (timeoutByStore.get(row.store_id) ?? 2) : 0;
    const elapsedMs = now.getTime() - new Date(row.queued_at).getTime();
    if (elapsedMs < thresholdMinutes * 60_000) continue;

    const { error: updErr } = await admin
      .from("conversations")
      .update({ is_sdr_active: true })
      .eq("id", row.id)
      .eq("is_sdr_active", false); // idempotency guard against concurrent ticks
    if (updErr) {
      ctx.log.error("sdr-backstop-tick activation failed", { conversationId: row.id, error: updErr.message });
      continue;
    }
    activated++;
    fetch(sdrRespondUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-worker-secret": workerSecret },
      body: JSON.stringify({ conversationId: row.id }),
    }).catch((err) => ctx.log.warn("sdr-respond dispatch failed", { conversationId: row.id, error: String(err) }));
  }

  return json({ activated }, 200);
});
```

- [ ] **Step 2: Escrever a migration do cron (comentário deixa claro que é pós-deploy)**

Create `supabase/migrations/20260715150000_sdr_backstop_cron_trigger.sql`:

```sql
-- SDR backstop tick: periodic trigger (Parte B activation).
--
-- Same pattern as scheduled-send-tick (20260613120100). pg_net is already
-- enabled by that migration — `create extension if not exists` here is just
-- defensive idempotency.
--
-- ORDER OF OPERATIONS at apply time: this migration must run AFTER
-- sdr-backstop-tick is deployed, so the very first tick hits a live endpoint.
-- It also assumes SDR_WORKER_SECRET already exists (minted by
-- 20260715130000_sdr_activation_schema.sql).

create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'sdr-backstop-tick';

select cron.schedule(
  'sdr-backstop-tick',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://njizaasajkdqptlxddqn.supabase.co/functions/v1/sdr-backstop-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', public.integration_secret_get('SDR_WORKER_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $cron$
);
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/sdr-backstop-tick/index.ts supabase/migrations/20260715150000_sdr_backstop_cron_trigger.sql
git commit -m "feat(sdr): add sdr-backstop-tick worker and cron trigger migration"
```

---

### Task 11: Webhook — continuidade da conversa (`onSdrTurn`)

**Files:**
- Modify: `supabase/functions/_shared/whatsapp/webhook/core.ts`
- Modify: `supabase/functions/whatsapp-webhook/index.ts`

**Interfaces:**
- Consumes: `sdr-respond` (Task 9, chamado via fetch fire-and-forget).
- Produces: `onSdrTurn?` disponível na interface de deps do webhook core — sem consumidores futuros neste plano (é a última peça de wiring).

- [ ] **Step 1: Ampliar `findOpenConversation` para trazer `is_sdr_active`**

In `supabase/functions/whatsapp-webhook/index.ts:313-329`, replace:

```ts
    async findOpenConversation(customerId, accountId, includeTerminal) {
      // Default: OPEN-ONLY (excludes resolvida/arquivada) — used by the
      // outbound echo path, which must never reuse/reopen a closed
      // conversation (spec 2026-07-03 §1.5). Customer-inbound passes
      // includeTerminal:true to also see closed ones so it can reopen them
      // via reopenConversation below rather than filtering them out here.
      let query = admin
        .from("conversations")
        .select("id, status")
        .eq("customer_id", customerId)
        .eq("whatsapp_account_id", accountId);
      if (!includeTerminal) {
        query = query.not("status", "in", `(${CLOSED_CONVERSATION_STATUSES.join(",")})`);
      }
      const { data } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data ? { id: data.id as string, status: data.status as string } : null;
    },
```

with:

```ts
    async findOpenConversation(customerId, accountId, includeTerminal) {
      // Default: OPEN-ONLY (excludes resolvida/arquivada) — used by the
      // outbound echo path, which must never reuse/reopen a closed
      // conversation (spec 2026-07-03 §1.5). Customer-inbound passes
      // includeTerminal:true to also see closed ones so it can reopen them
      // via reopenConversation below rather than filtering them out here.
      let query = admin
        .from("conversations")
        .select("id, status, is_sdr_active")
        .eq("customer_id", customerId)
        .eq("whatsapp_account_id", accountId);
      if (!includeTerminal) {
        query = query.not("status", "in", `(${CLOSED_CONVERSATION_STATUSES.join(",")})`);
      }
      const { data } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data
        ? { id: data.id as string, status: data.status as string, isSdrActive: Boolean(data.is_sdr_active) }
        : null;
    },
```

- [ ] **Step 2: Ampliar o tipo de retorno na interface `IWebhookDb`**

In `supabase/functions/_shared/whatsapp/webhook/core.ts:97-101`, replace:

```ts
  findOpenConversation(
    customerId: string,
    accountId: string,
    includeTerminal?: boolean,
  ): Promise<{ id: string; status: string } | null>;
```

with:

```ts
  findOpenConversation(
    customerId: string,
    accountId: string,
    includeTerminal?: boolean,
  ): Promise<{ id: string; status: string; isSdrActive: boolean } | null>;
```

(As duas variáveis locais tipadas explicitamente que recebem o retorno desta função — linhas ~607 e ~736 — continuam compilando sem alteração: TypeScript permite atribuir um retorno de função com propriedades extras a uma variável de tipo mais estreito. O Step 4 abaixo acessa `isSdrActive` via cast pontual na chamada relevante.)

- [ ] **Step 3: Adicionar o callback `onSdrTurn?`**

In `supabase/functions/_shared/whatsapp/webhook/core.ts`, right after the `onCustomerAutoCreated?` declaration (~line 210-217), add:

```ts
  /**
   * Fire-and-forget hook invoked when an inbound message lands on a
   * conversation the SDR is already driving (`is_sdr_active=true`). The Edge
   * wiring calls sdr-respond in the background to continue the turn. MUST
   * NOT block or throw — the webhook stays fail-closed and answers 200 fast
   * regardless (SDR Parte B, 2026-07-15).
   */
  onSdrTurn?: (input: { conversationId: string }) => void;
```

- [ ] **Step 4: Invocar o callback no ponto certo**

In the same file, in the main inbound flow (~line 736-764, right after `conversation` is resolved and before the message INSERT), add:

```ts
  if (conversation && !customerCreated && (conversation as { isSdrActive?: boolean }).isSdrActive) {
    args.onSdrTurn?.({ conversationId: conversation.id });
  }
```

(Posicionado depois da resolução de `conversation` — que já carrega `isSdrActive` a partir da Task anterior — e antes do INSERT da mensagem atual, para o estado lido reflita o momento pré-mensagem, igual ao ponto onde `didReopen` já é decidido.)

- [ ] **Step 5: Rodar o mirror do whatsapp**

Run: `bun run scripts/sync-whatsapp-shared.ts`
Expected: reporta os arquivos sincronizados, incluindo o `core.ts` alterado.

- [ ] **Step 6: Wiring no `index.ts` — dispara `sdr-respond` via fetch fire-and-forget**

In `supabase/functions/whatsapp-webhook/index.ts`, near the existing `runInBackground`/`scheduleAvatarFetch` helpers (~line 695), add a new function. It reuses `deps.resolveSecret` — the same `IEngineDeps` resolver already built at the top of the file and passed into `scheduleAvatarFetch` — instead of constructing a second secret resolver:

```ts
function scheduleSdrTurn(deps: IEngineDeps, log: Logger, input: { conversationId: string }): void {
  runInBackground(
    (async () => {
      try {
        const secret = await deps.resolveSecret("SDR_WORKER_SECRET");
        if (!secret) return;
        await fetch(`${requiredEnv("SUPABASE_URL")}/functions/v1/sdr-respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-worker-secret": secret },
          body: JSON.stringify({ conversationId: input.conversationId }),
        });
      } catch (err) {
        log.warn("sdr turn dispatch failed", {
          conversationId: input.conversationId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })(),
  );
}
```

Wire the callback in the `Deno.serve` call, right next to `onCustomerAutoCreated` (~line 955-958):

```ts
      onSdrTurn: (input) => scheduleSdrTurn(deps, log, input),
```

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/whatsapp/webhook/core.ts supabase/functions/whatsapp-webhook/index.ts
git commit -m "feat(sdr): wire onSdrTurn continuation into the real webhook"
```

(Sem teste automatizado neste arquivo — mesma nota das Tasks 8/9/10. Este é o ponto de maior atenção na revisão: o webhook real é código sensível e já testado em produção; a mudança deve ser mínima e aditiva, sem alterar nenhum comportamento existente para conversas fora do piloto.)

---

### Task 12: Documentação

**Files:**
- Create: `docs/dev/sdr-production-activation.md`

**Interfaces:**
- Consumes: nada.
- Produces: nada (documentação, folha da árvore).

- [ ] **Step 1: Escrever o doc, no padrão de `docs/dev/whatsapp-failover.md`**

Create `docs/dev/sdr-production-activation.md` cobrindo: arquitetura dos dois workers (`sdr-respond`/`sdr-backstop-tick`), o dual-pipeline de dispatch (legado vs. WAHA) e por quê, onde fica cada peça de configuração (aba SDR vs. aba Funcionalidades), como ativar uma loja piloto (checklist manual: aplicar as 2 migrations, deployar as 2 functions, ligar o toggle na UI), e os gaps conhecidos herdados da Parte A (delimitador anti-injection, guardrail de valor por extenso).

- [ ] **Step 2: Commit**

```bash
git add docs/dev/sdr-production-activation.md
git commit -m "docs: add SDR production activation guide"
```

---

## Depois deste plano (fora de escopo, gated no dono)

1. Revisão de branch inteira (achados cross-task, como na Parte A).
2. Aplicar as migrations das Tasks 1 e 10 via MCP (a segunda só depois do deploy das duas novas functions).
3. Deploy de `sdr-respond` e `sdr-backstop-tick`.
4. Escolher uma loja piloto e ligar `sdr_enabled` na aba SDR.
5. Smoke manual com uma conversa real.
