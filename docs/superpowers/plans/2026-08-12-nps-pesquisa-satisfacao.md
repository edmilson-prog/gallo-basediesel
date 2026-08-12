# NPS — Pesquisa de Satisfação · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o ciclo completo de NPS transacional — disparo automático após conversa resolvida, coleta por landing pública com token de uso único, cálculo honesto em janela móvel e leitura no Cockpit e em `/app/nps`.

**Architecture:** A conversa de WhatsApp já existe quando é resolvida, então a pesquisa vai como mensagem na própria thread, pelo mesmo pipeline que o `scheduled-send-worker` usa. O envio fica atrás da interface `INpsSurveySender`, para que trocar pelo dispatch da Onda 8 seja um swap de implementação. Um `nps-scheduler` (pg_cron horário) decide *quando* e *para quem*; um `nps-submit` público recebe a resposta; o front lê por Provider Pattern.

**Tech Stack:** TypeScript strict · React + TanStack Router/Query · Tailwind v4 + shadcn/ui · Supabase (Postgres, RLS, Edge Functions Deno, pg_cron, pg_net) · Vitest · bun.

**Spec:** `docs/superpowers/specs/2026-08-12-nps-pesquisa-satisfacao-design.md`
**PRD:** `docs/prds/PRD-148B-nps-pesquisa-satisfacao.md`

## Global Constraints

- **Gerenciador de pacotes:** `bun`. Testes: `bun run test`. Build: `bun run build`.
- **`bun run build` NÃO faz type-check.** Type-check é `bunx tsc --noEmit`, que tem ~315 erros de baseline pré-existentes — avalie **apenas o delta** dos arquivos criados nesta branch.
- **Schema é `public`**, nunca `crm`. Tabelas e colunas em `snake_case`.
- **TypeScript `strict: true`.** Interfaces de domínio prefixadas com `I`. Evitar `any`.
- **Temas:** componentes consomem **apenas tokens semânticos** (`bg-background`, `text-foreground`, `border-border`, `text-/bg-/border-severity-*`). Nunca primitivos `--gallo-*` nem hex direto.
- **Provider Pattern:** features acessam dados só via `@/providers/data`. Importar `@/mocks`, `@/providers/data/impl/*`, `@/providers/data/factory` ou contratos individuais fora das pastas permitidas é barrado por ESLint.
- **Texto de UI em português do Brasil com acentuação correta.** Código, comentários e nomes em inglês.
- **Toda migration aplicada via MCP deve ser exportada para `supabase/migrations/` no mesmo PR.** Mergear o PR **não** aplica a migration — aplicação em produção é manual e exige OK explícito do dono. O mesmo vale para `npx supabase functions deploy`.
- **Commits:** Conventional Commits em inglês, atômicos.
- `routeTree.gen.ts` é **gerado** — nunca editar à mão.
- Timestamps de migration nesta branch começam em `20260812` (o último em `main` é `20260811190000`).
- Nomes fixados pela spec: tabelas `nps_surveys` / `nps_settings`; Edge `nps-scheduler` / `nps-submit`; pasta `src/features/nps/`; hooks `useNpsMetrics` / `useNpsSurveys`; páginas `NpsAnalyticsPage` / `NpsSurveyPublicPage` / `NpsSettingsPage`.
- **Nunca** criar coluna `classification` — promotor/neutro/detrator é sempre derivado do score.
- **Nunca** expor ranking de NPS por vendedor.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20260812140000_nps_schema.sql` | tabelas, índices, RLS, seed RBAC |
| `supabase/migrations/20260812140100_nps_scheduler_cron.sql` | agendamento pg_cron (aplicar **depois** do deploy da Edge) |
| `src/shared/types/nps.ts` | modelo de domínio `INpsSurvey`, `INpsSettings`, `INpsResult` |
| `src/features/nps/engine/computeNps.ts` | cálculo puro do score |
| `supabase/functions/nps-scheduler/eligibility.ts` | decisão pura de elegibilidade |
| `supabase/functions/nps-scheduler/sender.ts` | `INpsSurveySender` + implementação WhatsApp |
| `supabase/functions/nps-scheduler/index.ts` | orquestração do ciclo |
| `supabase/functions/nps-submit/index.ts` | GET de contexto + POST de resposta |
| `src/providers/data/contracts/nps.ts` | contrato do provider |
| `src/providers/data/impl/supabase/nps.ts` | implementação Supabase |
| `src/providers/data/impl/mock/nps.ts` | implementação Mock |
| `src/features/nps/hooks/useNpsMetrics.ts` | leitura agregada |
| `src/features/nps/hooks/useNpsSurveys.ts` | leitura da tabela |
| `src/features/nps/pages/NpsAnalyticsPage.tsx` | página `/app/nps` |
| `src/features/nps/pages/NpsSettingsPage.tsx` | `/app/configuracoes/nps` |
| `src/features/nps/pages/NpsSurveyPublicPage.tsx` | landing pública |
| `src/routes/nps.tsx`, `src/routes/pesquisa.$token.tsx`, `src/routes/app.configuracoes.nps.tsx` | rotas |
| `docs/dev/nps.md` | metodologia, anti-fadiga, guia do Gestor |

---

## Task 1: Schema, RLS e recurso RBAC

**Files:**
- Create: `supabase/migrations/20260812140000_nps_schema.sql`
- Modify: `src/features/rbac/permissions/matrix.ts`
- Test: `supabase/tests/rls-regression.sql` (acrescentar bloco)

**Interfaces:**
- Consumes: tabelas existentes `stores`, `customers`, `conversations`, `orders`, `rbac_resources`, `role_permissions`.
- Produces: tabelas `public.nps_surveys` e `public.nps_settings`; recursos RBAC `nps` e `settings_nps`.

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/20260812140000_nps_schema.sql`:

```sql
-- NPS transacional (PRD-148B, redesenhado em docs/superpowers/specs/
-- 2026-08-12-nps-pesquisa-satisfacao-design.md).
--
-- Divergências deliberadas do PRD, por evidência de produção (12/08/2026):
--   * schema `public`, não `crm` (o schema crm não existe neste projeto);
--   * customer_id NULLABLE — 293 das 348 conversas resolvidas nos últimos
--     30 dias pertencem a leads, não a clientes cadastrados;
--   * config em tabela própria (o `platform_settings` do PRD não existe),
--     seguindo o padrão de `sdr_settings`.
--
-- Sem coluna `classification`: promotor/neutro/detrator é SEMPRE derivado
-- do score, como o PRD exige.

create table public.nps_surveys (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),

  conversation_id uuid references public.conversations(id) on delete set null,
  customer_id uuid references public.customers(id),
  lead_id text,                        -- conversations.lead_id é TEXT aqui
  phone_digits text not null,          -- chave de cooldown, atravessa lead/cliente
  recipient_name text,

  trigger text not null
    check (trigger in ('conversation_resolved','order_delivered','manual')),
  order_id uuid references public.orders(id),

  token text unique not null,
  channel text check (channel in ('whatsapp','email')),
  status text not null default 'pending'
    check (status in ('pending','sent','responded','expired','suppressed','failed')),

  score smallint check (score between 0 and 10),
  comment text,

  sent_at timestamptz,
  responded_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.nps_surveys is
  'PRD-148B: pesquisas de NPS transacional. Mutações exclusivas de service_role (nps-scheduler e nps-submit).';

create index nps_surveys_store_status_idx on public.nps_surveys (store_id, status);
create index nps_surveys_phone_created_idx on public.nps_surveys (phone_digits, created_at desc);
create index nps_surveys_responded_idx on public.nps_surveys (responded_at) where status = 'responded';
create unique index nps_surveys_conversation_uniq
  on public.nps_surveys (conversation_id) where conversation_id is not null;

create table public.nps_settings (
  store_id uuid primary key references public.stores(id),
  enabled boolean not null default false,
  trigger_conversation_enabled boolean not null default true,
  trigger_conversation_delay_hours integer not null default 2,
  trigger_order_enabled boolean not null default false,
  trigger_order_delay_hours integer not null default 24,
  cooldown_days integer not null default 30,
  token_expiry_days integer not null default 7,
  window_days integer not null default 90,
  sampling_rate numeric not null default 1.0 check (sampling_rate between 0 and 1),
  send_window_start_hour integer not null default 9,
  send_window_end_hour integer not null default 20,
  min_responses_for_score integer not null default 5,
  max_backfill_days integer not null default 3,
  daily_cap integer not null default 50,
  whatsapp_account_id uuid references public.whatsapp_accounts(id),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

comment on column public.nps_settings.max_backfill_days is
  'Backstop anti-disparo em massa: o scheduler ignora conversas resolvidas há mais que isto. Sem ele, ligar o switch dispararia para todo o backlog histórico.';
comment on column public.nps_settings.daily_cap is
  'Backstop anti-disparo em massa: teto de pesquisas por loja por dia.';

alter table public.nps_surveys enable row level security;
alter table public.nps_settings enable row level security;

-- Leitura: Owner cross-store; Gestor na própria loja; Vendedor só a própria
-- carteira. Mutações não têm policy — apenas service_role escreve.
create policy nps_surveys_select on public.nps_surveys for select to authenticated
using (
  public.is_owner()
  or (public.is_staff() and store_id = any (public.current_user_store_ids()))
  or exists (
    select 1 from public.customers c
    where c.id = nps_surveys.customer_id
      and c.seller_id = public.current_seller_id()
  )
);

create policy nps_settings_select on public.nps_settings for select to authenticated
using (public.is_owner() or store_id = any (public.current_user_store_ids()));

create policy nps_settings_write on public.nps_settings for all to authenticated
using (public.is_owner()) with check (public.is_owner());

-- RBAC: sem estas linhas o menu some para TODOS, inclusive o Owner.
insert into public.rbac_resources (key, label, "group", sort_order) values
  ('nps',          'NPS — Satisfação', 'Atendimento',  36),
  ('settings_nps', 'NPS',              'Configuração', 44)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, resource, actions, scope) values
  ('Owner',  'nps',          array['view'],         'all'),
  ('Owner',  'settings_nps', array['view','edit'],  'all'),
  ('Gestor', 'nps',          array['view'],         'store'),
  ('Gestor', 'settings_nps', array['view'],         'store')
on conflict (role_id, resource) do nothing;
```

> ⚠️ Antes de aplicar, **confirmar os nomes reais** dos helpers de RLS
> (`is_owner`, `is_staff`, `current_user_store_ids`, `current_seller_id`) e da
> coluna de dono em `customers` (`seller_id`) com:
> `select routine_name from information_schema.routines where routine_schema='public' and routine_name like '%owner%' or routine_name like '%store_ids%';`
> Ajustar a policy aos nomes que existirem. Helper booleano em policy roda uma
> vez por linha — se algum for escalar e custoso, trocar por junção direta
> (lição de `project_rls_ci_cross_leak_instance_gate`).

- [ ] **Step 2: Aplicar a migration e conferir**

Aplicar via MCP `apply_migration` com `version = 20260812140000_nps_schema`. Depois validar:

```sql
select count(*) from public.nps_surveys;                     -- 0, sem erro
select key from public.rbac_resources where key like 'nps%' or key = 'settings_nps';
```

Esperado: as duas chaves presentes, tabela vazia e legível.

- [ ] **Step 3: Espelhar o recurso nos TRÊS arquivos do RBAC**

O recurso aparece em três lugares no código, não um. Deixar qualquer um de fora
produz um recurso meio-registrado.

**3a.** `src/features/rbac/permissions/resources.ts` — acrescentar as chaves à
lista (formato: uma string por linha, como `"service_volume",` na linha 46):

```ts
  "nps",
  "settings_nps",
```

**3b.** `src/features/rbac/permissions/seed.ts` — acrescentar nos **dois** mapas
(rótulo por volta da linha 73, grupo por volta da linha 117):

```ts
  nps: "NPS — Satisfação",          // mapa de rótulos
  settings_nps: "NPS",

  nps: "Atendimento",                // mapa de grupos
  settings_nps: "Configuração",
```

**3c.** `src/features/rbac/permissions/matrix.ts` — formato `p(resource, actions, scope)`, como `service_volume` (linhas 69 e 134) e `settings_sdr` (linhas 86 e 150). No bloco do Owner:

```ts
  p("nps", ["view"], "all"),
  p("settings_nps", ["view", "edit"], "all"),
```

No bloco do Gestor:

```ts
  p("nps", ["view"], "store"),
  p("settings_nps", ["view"], "store"),
```

Os rótulos e grupos aqui devem bater **exatamente** com os valores inseridos em
`rbac_resources` no Step 1 — o editor de papéis lê do banco, e uma divergência
faz a mesma linha aparecer com dois nomes conforme a origem.

- [ ] **Step 4: Rodar o gate**

Run: `bun run test && bun run build`
Expected: PASS nos dois.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260812140000_nps_schema.sql src/features/rbac/permissions/matrix.ts
git commit -m "feat(nps): add nps_surveys and nps_settings schema with RLS and RBAC seed"
```

---

## Task 2: Tipos de domínio e cálculo do score

**Files:**
- Create: `src/shared/types/nps.ts`, `src/features/nps/engine/computeNps.ts`, `src/features/nps/engine/computeNps.test.ts`, `src/features/nps/engine/index.ts`
- Modify: `src/shared/types/index.ts` (exportar o barrel)

**Interfaces:**
- Produces: `INpsSurvey`, `INpsSettings`, `INpsResult`, `INpsClass`, `computeNps`, `classifyScore`.

- [ ] **Step 1: Definir os tipos**

Criar `src/shared/types/nps.ts`:

```ts
/** NPS transacional (PRD-148B). Classe é sempre derivada do score. */
export type INpsClass = "detractor" | "passive" | "promoter";

export type INpsTrigger = "conversation_resolved" | "order_delivered" | "manual";

export type INpsSurveyStatus =
  | "pending" | "sent" | "responded" | "expired" | "suppressed" | "failed";

export interface INpsSurvey {
  id: string;
  storeId: string;
  conversationId: string | null;
  customerId: string | null;
  leadId: string | null;
  phoneDigits: string;
  recipientName: string | null;
  trigger: INpsTrigger;
  orderId: string | null;
  channel: "whatsapp" | "email" | null;
  status: INpsSurveyStatus;
  score: number | null;
  comment: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

/** Resultado do cálculo. `collecting` = amostra menor que o mínimo honesto. */
export interface INpsResult {
  state: "ok" | "collecting";
  score: number | null;
  n: number;
  sent: number;
  responseRate: number;
  promoters: number;
  passives: number;
  detractors: number;
}

export interface INpsSettings {
  storeId: string;
  enabled: boolean;
  triggerConversationEnabled: boolean;
  triggerConversationDelayHours: number;
  triggerOrderEnabled: boolean;
  triggerOrderDelayHours: number;
  cooldownDays: number;
  tokenExpiryDays: number;
  windowDays: number;
  samplingRate: number;
  sendWindowStartHour: number;
  sendWindowEndHour: number;
  minResponsesForScore: number;
  maxBackfillDays: number;
  dailyCap: number;
  whatsappAccountId: string | null;
}
```

Acrescentar `export * from "./nps";` em `src/shared/types/index.ts`.

- [ ] **Step 2: Escrever os testes que falham**

Criar `src/features/nps/engine/computeNps.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyScore, computeNps } from "./computeNps";

describe("classifyScore", () => {
  it("classifies the 6/7 boundary", () => {
    expect(classifyScore(6)).toBe("detractor");
    expect(classifyScore(7)).toBe("passive");
  });

  it("classifies the 8/9 boundary", () => {
    expect(classifyScore(8)).toBe("passive");
    expect(classifyScore(9)).toBe("promoter");
  });

  it("classifies the extremes", () => {
    expect(classifyScore(0)).toBe("detractor");
    expect(classifyScore(10)).toBe("promoter");
  });
});

describe("computeNps", () => {
  const responses = (scores: number[]) => scores.map((score) => ({ score }));

  it("returns collecting below the minimum, never a number", () => {
    const result = computeNps(responses([10, 10, 9]), { minResponses: 5, sent: 10 });
    expect(result.state).toBe("collecting");
    expect(result.score).toBeNull();
    expect(result.n).toBe(3);
  });

  it("computes the PRD acceptance case: 12 promoters, 4 passives, 4 detractors", () => {
    const scores = [
      ...Array(12).fill(10),
      ...Array(4).fill(8),
      ...Array(4).fill(3),
    ];
    const result = computeNps(responses(scores), { minResponses: 5, sent: 40 });
    expect(result.state).toBe("ok");
    expect(result.score).toBe(40);   // 60% promotores - 20% detratores
    expect(result.n).toBe(20);
    expect(result.responseRate).toBe(0.5);
  });

  it("rounds to the nearest integer", () => {
    // 1 promotor, 2 detratores em 3 -> 33.33% - 66.67% = -33.33 -> -33
    const result = computeNps(responses([9, 3, 3]), { minResponses: 1, sent: 3 });
    expect(result.score).toBe(-33);
  });

  it("handles an empty set without dividing by zero", () => {
    const result = computeNps([], { minResponses: 5, sent: 0 });
    expect(result.state).toBe("collecting");
    expect(result.score).toBeNull();
    expect(result.n).toBe(0);
    expect(result.responseRate).toBe(0);
  });
});
```

- [ ] **Step 2b: Rodar e confirmar que falha**

Run: `bun run test src/features/nps/engine/computeNps.test.ts`
Expected: FAIL — módulo `./computeNps` não existe.

- [ ] **Step 3: Implementar**

Criar `src/features/nps/engine/computeNps.ts`:

```ts
import type { INpsClass, INpsResult } from "@/shared/types";

/**
 * NPS clássico: 0-6 detrator, 7-8 neutro, 9-10 promotor. A classe nunca é
 * persistida — é sempre derivada aqui (regra explícita do PRD-148B).
 */
export function classifyScore(score: number): INpsClass {
  if (score <= 6) return "detractor";
  if (score <= 8) return "passive";
  return "promoter";
}

/**
 * Score = round(%promotores - %detratores) sobre as respostas da janela.
 *
 * Abaixo de `minResponses` devolve `state: 'collecting'` e `score: null`: um
 * "NPS 100" de duas respostas é desinformação executiva, então nenhuma
 * superfície pode receber um número para exibir.
 */
export function computeNps(
  responses: ReadonlyArray<{ score: number }>,
  opts: { minResponses: number; sent: number },
): INpsResult {
  let promoters = 0;
  let passives = 0;
  let detractors = 0;

  for (const response of responses) {
    const npsClass = classifyScore(response.score);
    if (npsClass === "promoter") promoters += 1;
    else if (npsClass === "passive") passives += 1;
    else detractors += 1;
  }

  const n = responses.length;
  const responseRate = opts.sent > 0 ? n / opts.sent : 0;
  const base = { n, sent: opts.sent, responseRate, promoters, passives, detractors };

  if (n < opts.minResponses) {
    return { ...base, state: "collecting", score: null };
  }
  return {
    ...base,
    state: "ok",
    score: Math.round((promoters / n) * 100 - (detractors / n) * 100),
  };
}
```

Criar `src/features/nps/engine/index.ts` com `export * from "./computeNps";`.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test src/features/nps/engine/computeNps.test.ts`
Expected: PASS — 7 testes.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/nps.ts src/shared/types/index.ts src/features/nps/engine/
git commit -m "feat(nps): add domain types and pure NPS score engine"
```

---

## Task 3: Motor de elegibilidade

**Files:**
- Create: `supabase/functions/nps-scheduler/eligibility.ts`, `supabase/functions/nps-scheduler/eligibility.test.ts`

**Interfaces:**
- Consumes: nada de tarefas anteriores (puro, sem I/O).
- Produces: `evaluateEligibility(candidate, settings, ctx)`, `decideSurveys(candidates, settings, ctx)`, tipos `INpsCandidate`, `INpsSchedulerSettings`, `IEligibilityVerdict`, `ISuppressionReason`.

O arquivo é auto-contido (Deno não resolve `@/`), espelhando `sdr-backstop-tick/eligibility.ts`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `supabase/functions/nps-scheduler/eligibility.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decideSurveys, evaluateEligibility, type INpsCandidate, type INpsSchedulerSettings } from "./eligibility";

const SETTINGS: INpsSchedulerSettings = {
  enabled: true,
  triggerConversationEnabled: true,
  triggerConversationDelayHours: 2,
  cooldownDays: 30,
  samplingRate: 1,
  sendWindowStartHour: 9,
  sendWindowEndHour: 20,
  maxBackfillDays: 3,
  dailyCap: 50,
};

const NOW = new Date("2026-08-12T14:00:00Z");   // 14h UTC, dentro da janela

const candidate = (patch: Partial<INpsCandidate> = {}): INpsCandidate => ({
  conversationId: "11111111-1111-1111-1111-111111111111",
  storeId: "22222222-2222-2222-2222-222222222222",
  phoneDigits: "5555999998888",
  closedAt: new Date("2026-08-12T10:00:00Z").toISOString(),  // 4h atrás
  lastSurveyAt: null,
  hasActiveSurvey: false,
  optOut: false,
  hasHumanMessage: true,
  ...patch,
});

describe("evaluateEligibility", () => {
  it("accepts a conversation resolved past the delay, inside the window", () => {
    expect(evaluateEligibility(candidate(), SETTINGS, { now: NOW, sentToday: 0 }))
      .toEqual({ eligible: true });
  });

  it("rejects a conversation resolved more recently than the delay", () => {
    const fresh = candidate({ closedAt: new Date("2026-08-12T13:30:00Z").toISOString() });
    expect(evaluateEligibility(fresh, SETTINGS, { now: NOW, sentToday: 0 }))
      .toEqual({ eligible: false, reason: "delay" });
  });

  it("rejects the historical backlog via the retroactive window", () => {
    const old = candidate({ closedAt: new Date("2026-07-01T10:00:00Z").toISOString() });
    expect(evaluateEligibility(old, SETTINGS, { now: NOW, sentToday: 0 }))
      .toEqual({ eligible: false, reason: "backfill" });
  });

  it("rejects a phone surveyed inside the cooldown", () => {
    const recent = candidate({ lastSurveyAt: new Date("2026-07-31T10:00:00Z").toISOString() });
    expect(evaluateEligibility(recent, SETTINGS, { now: NOW, sentToday: 0 }))
      .toEqual({ eligible: false, reason: "cooldown" });
  });

  it("accepts a phone surveyed before the cooldown expired", () => {
    const old = candidate({ lastSurveyAt: new Date("2026-06-01T10:00:00Z").toISOString() });
    expect(evaluateEligibility(old, SETTINGS, { now: NOW, sentToday: 0 }))
      .toEqual({ eligible: true });
  });

  it("rejects when a survey is already in flight", () => {
    expect(evaluateEligibility(candidate({ hasActiveSurvey: true }), SETTINGS, { now: NOW, sentToday: 0 }))
      .toEqual({ eligible: false, reason: "active_survey" });
  });

  it("respects contact opt-out", () => {
    expect(evaluateEligibility(candidate({ optOut: true }), SETTINGS, { now: NOW, sentToday: 0 }))
      .toEqual({ eligible: false, reason: "opt_out" });
  });

  it("rejects a conversation with no human message", () => {
    expect(evaluateEligibility(candidate({ hasHumanMessage: false }), SETTINGS, { now: NOW, sentToday: 0 }))
      .toEqual({ eligible: false, reason: "no_human_message" });
  });

  it("defers outside the send window instead of sending", () => {
    const night = new Date("2026-08-12T23:00:00Z");
    expect(evaluateEligibility(candidate(), SETTINGS, { now: night, sentToday: 0 }))
      .toEqual({ eligible: false, reason: "send_window" });
  });

  it("rejects once the daily cap is reached", () => {
    expect(evaluateEligibility(candidate(), SETTINGS, { now: NOW, sentToday: 50 }))
      .toEqual({ eligible: false, reason: "daily_cap" });
  });

  it("rejects everything when the master switch is off", () => {
    const off = { ...SETTINGS, enabled: false };
    expect(evaluateEligibility(candidate(), off, { now: NOW, sentToday: 0 }))
      .toEqual({ eligible: false, reason: "disabled" });
  });
});

describe("sampling", () => {
  it("is deterministic — the same conversation always decides the same way", () => {
    const half = { ...SETTINGS, samplingRate: 0.5 };
    const ctx = { now: NOW, sentToday: 0 };
    const first = evaluateEligibility(candidate(), half, ctx);
    const second = evaluateEligibility(candidate(), half, ctx);
    expect(first).toEqual(second);
  });

  it("drops roughly half the population at 0.5", () => {
    const half = { ...SETTINGS, samplingRate: 0.5 };
    const many = Array.from({ length: 200 }, (_, i) =>
      candidate({ conversationId: `conv-${i}`, phoneDigits: `55559999${i}` }));
    const accepted = many.filter((c) =>
      evaluateEligibility(c, half, { now: NOW, sentToday: 0 }).eligible).length;
    expect(accepted).toBeGreaterThan(60);
    expect(accepted).toBeLessThan(140);
  });

  it("accepts everyone at rate 1", () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      candidate({ conversationId: `conv-${i}`, phoneDigits: `55559999${i}` }));
    const accepted = many.filter((c) =>
      evaluateEligibility(c, SETTINGS, { now: NOW, sentToday: 0 }).eligible).length;
    expect(accepted).toBe(50);
  });
});

describe("decideSurveys", () => {
  it("enforces the daily cap across the batch, never silently", () => {
    const capped = { ...SETTINGS, dailyCap: 3 };
    const many = Array.from({ length: 10 }, (_, i) =>
      candidate({ conversationId: `conv-${i}`, phoneDigits: `55559999${i}` }));
    const result = decideSurveys(many, capped, { now: NOW, sentToday: 0 });
    expect(result.accepted).toHaveLength(3);
    expect(result.rejected.filter((r) => r.reason === "daily_cap")).toHaveLength(7);
  });

  it("does not survey the same phone twice in one batch", () => {
    const twins = [
      candidate({ conversationId: "conv-a", phoneDigits: "5555999998888" }),
      candidate({ conversationId: "conv-b", phoneDigits: "5555999998888" }),
    ];
    const result = decideSurveys(twins, SETTINGS, { now: NOW, sentToday: 0 });
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe("cooldown");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun run test supabase/functions/nps-scheduler/eligibility.test.ts`
Expected: FAIL — módulo `./eligibility` não existe.

- [ ] **Step 3: Implementar**

Criar `supabase/functions/nps-scheduler/eligibility.ts`:

```ts
/**
 * Decisão pura de elegibilidade do NPS — sem I/O, testada com Vitest
 * (mesmo arranjo de sdr-backstop-tick/eligibility.ts).
 *
 * A ordem das guardas importa: `backfill` e `daily_cap` são os backstops que
 * impedem que ligar o master switch dispare para todo o backlog histórico —
 * o incidente de disparo em massa do SDR, repetido. Nenhuma delas depende de
 * a anterior estar correta.
 */

export type ISuppressionReason =
  | "disabled" | "trigger_off" | "backfill" | "delay" | "cooldown"
  | "active_survey" | "opt_out" | "no_human_message" | "sampling"
  | "send_window" | "daily_cap";

export interface INpsCandidate {
  conversationId: string;
  storeId: string;
  phoneDigits: string;
  closedAt: string;
  /** Última pesquisa para este telefone, de qualquer gatilho. */
  lastSurveyAt: string | null;
  hasActiveSurvey: boolean;
  optOut: boolean;
  hasHumanMessage: boolean;
}

export interface INpsSchedulerSettings {
  enabled: boolean;
  triggerConversationEnabled: boolean;
  triggerConversationDelayHours: number;
  cooldownDays: number;
  samplingRate: number;
  sendWindowStartHour: number;
  sendWindowEndHour: number;
  maxBackfillDays: number;
  dailyCap: number;
}

export interface IEligibilityContext {
  now: Date;
  sentToday: number;
}

export type IEligibilityVerdict =
  | { eligible: true }
  | { eligible: false; reason: ISuppressionReason };

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * Hash determinístico (FNV-1a) do id da conversa. Re-executar o scheduler
 * nunca re-sorteia — a mesma conversa decide sempre igual, que é o que torna
 * o ciclo idempotente mesmo com amostragem ativa.
 */
function stableFraction(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash / 0xffffffff;
}

export function evaluateEligibility(
  candidate: INpsCandidate,
  settings: INpsSchedulerSettings,
  ctx: IEligibilityContext,
): IEligibilityVerdict {
  const reject = (reason: ISuppressionReason): IEligibilityVerdict => ({ eligible: false, reason });

  if (!settings.enabled) return reject("disabled");
  if (!settings.triggerConversationEnabled) return reject("trigger_off");

  const nowMs = ctx.now.getTime();
  const closedMs = new Date(candidate.closedAt).getTime();

  if (nowMs - closedMs > settings.maxBackfillDays * DAY_MS) return reject("backfill");
  if (nowMs - closedMs < settings.triggerConversationDelayHours * HOUR_MS) return reject("delay");

  if (candidate.optOut) return reject("opt_out");
  if (!candidate.hasHumanMessage) return reject("no_human_message");
  if (candidate.hasActiveSurvey) return reject("active_survey");

  if (candidate.lastSurveyAt !== null) {
    const lastMs = new Date(candidate.lastSurveyAt).getTime();
    if (nowMs - lastMs < settings.cooldownDays * DAY_MS) return reject("cooldown");
  }

  const hour = ctx.now.getUTCHours();
  if (hour < settings.sendWindowStartHour || hour >= settings.sendWindowEndHour) {
    return reject("send_window");
  }

  if (ctx.sentToday >= settings.dailyCap) return reject("daily_cap");
  if (settings.samplingRate < 1 && stableFraction(candidate.conversationId) >= settings.samplingRate) {
    return reject("sampling");
  }
  return { eligible: true };
}

export interface IBatchDecision {
  accepted: INpsCandidate[];
  rejected: Array<{ candidate: INpsCandidate; reason: ISuppressionReason }>;
}

/**
 * Aplica a decisão ao lote inteiro, mantendo o teto diário e impedindo que
 * dois candidatos do mesmo telefone passem no mesmo ciclo.
 */
export function decideSurveys(
  candidates: INpsCandidate[],
  settings: INpsSchedulerSettings,
  ctx: IEligibilityContext,
): IBatchDecision {
  const accepted: INpsCandidate[] = [];
  const rejected: IBatchDecision["rejected"] = [];
  const seenPhones = new Set<string>();
  let sentToday = ctx.sentToday;

  for (const candidate of candidates) {
    if (seenPhones.has(candidate.phoneDigits)) {
      rejected.push({ candidate, reason: "cooldown" });
      continue;
    }
    const verdict = evaluateEligibility(candidate, settings, { ...ctx, sentToday });
    if (verdict.eligible) {
      accepted.push(candidate);
      seenPhones.add(candidate.phoneDigits);
      sentToday += 1;
    } else {
      rejected.push({ candidate, reason: verdict.reason });
    }
  }
  return { accepted, rejected };
}
```

> Nota sobre a janela de envio: `getUTCHours()` é usado porque o Postgres
> entrega timestamps em UTC e o horário local de Frederico Westphalen é
> UTC-3. Ao ligar em produção, ajustar `send_window_start_hour` /
> `send_window_end_hour` em UTC (09h local = 12h UTC) **ou** converter aqui —
> decidir com o dono na Task 10 e documentar em `docs/dev/nps.md`.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test supabase/functions/nps-scheduler/eligibility.test.ts`
Expected: PASS — 15 testes.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/nps-scheduler/eligibility.ts supabase/functions/nps-scheduler/eligibility.test.ts
git commit -m "feat(nps): add pure eligibility engine with mass-dispatch backstops"
```

---

## Task 4: Scheduler e envio

**Files:**
- Create: `supabase/functions/nps-scheduler/index.ts`, `supabase/functions/nps-scheduler/sender.ts`, `supabase/migrations/20260812140100_nps_scheduler_cron.sql`
- Read first: `supabase/functions/sdr-backstop-tick/index.ts` (auth e formato), `supabase/functions/scheduled-send-worker/index.ts` (como despachar por WAHA vs demais engines)

**Interfaces:**
- Consumes: `decideSurveys`, `INpsCandidate`, `INpsSchedulerSettings` da Task 3.
- Produces: endpoint `POST /nps-scheduler`; segredo `NPS_WORKER_SECRET`; `INpsSurveySender`.

- [ ] **Step 1: Escrever o sender**

Criar `supabase/functions/nps-scheduler/sender.ts`. A interface é o ponto de troca para a Onda 8:

```ts
/**
 * Fronteira de envio do NPS. Hoje entrega pela thread de WhatsApp que já
 * existe; quando o notification-dispatch (PRD-141) existir, basta um segundo
 * implementador desta interface — o scheduler não muda.
 */
export interface INpsSurveyDispatch {
  conversationId: string;
  storeId: string;
  whatsappAccountId: string | null;
  recipientFirstName: string;
  surveyUrl: string;
}

export interface INpsSendResult {
  channel: "whatsapp";
  status: "sent" | "failed";
  error?: string;
}

export interface INpsSurveySender {
  send(dispatch: INpsSurveyDispatch): Promise<INpsSendResult>;
}

/** Copy da pesquisa. Tom validado com o dono antes de ligar o switch. */
export function buildSurveyMessage(firstName: string, surveyUrl: string): string {
  const greeting = firstName.trim().length > 0 ? `Oi, ${firstName.trim()}!` : "Oi!";
  return (
    `${greeting} Aqui é da GALLO Base Diesel. Seu atendimento foi concluído — ` +
    `de 0 a 10, qual a chance de você nos recomendar para um colega? ` +
    `É rapidinho: ${surveyUrl}`
  );
}
```

Acrescentar no mesmo arquivo `makeWhatsAppSender(admin)`, que resolve o `provider` da conta (`whatsapp_accounts.provider`) e despacha por `dispatchWahaText` (de `../_shared/wahaSendAdapter.ts`) quando for `waha`, ou por `processSendRequest` (de `../_shared/whatsapp/send/core.ts`) nos demais casos — **exatamente a bifurcação que `scheduled-send-worker/index.ts` já faz**. Copiar de lá a montagem de `makeSendDb` / `makeEngineDeps` / `buildWhatsAppEngine` em vez de reinventar; ler aquele arquivo antes de escrever este passo.

- [ ] **Step 2: Escrever o teste do copy**

Criar `supabase/functions/nps-scheduler/sender.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildSurveyMessage } from "./sender";

describe("buildSurveyMessage", () => {
  it("greets by first name and carries the link", () => {
    const message = buildSurveyMessage("João", "https://crm.gallobasediesel.com.br/pesquisa/abc123");
    expect(message).toContain("Oi, João!");
    expect(message).toContain("https://crm.gallobasediesel.com.br/pesquisa/abc123");
    expect(message).toContain("de 0 a 10");
  });

  it("falls back to a neutral greeting when the name is missing", () => {
    const message = buildSurveyMessage("   ", "https://x/y");
    expect(message).toContain("Oi!");
    expect(message).not.toContain("Oi, !");
  });
});
```

Run: `bun run test supabase/functions/nps-scheduler/sender.test.ts` — Expected: PASS.

- [ ] **Step 3: Escrever o `index.ts` do scheduler**

Criar `supabase/functions/nps-scheduler/index.ts` seguindo o esqueleto de `sdr-backstop-tick/index.ts`: `servePost`, `createClient` com service role, `createSecretResolver` + `verifyWorkerSecret` com `NPS_WORKER_SECRET`, e então o ciclo:

1. carrega `nps_settings` das lojas com `enabled = true`; se nenhuma, devolve `{ stores: 0 }`;
2. para cada loja, monta os candidatos com **uma** consulta relacional: conversas `status = 'resolvida'` com `closed_at` dentro de `max_backfill_days`, com `customer_id` ou `lead_id`, mais o telefone resolvido (`customers.phone_digits` ou `leads.phone_digits`), `lastSurveyAt` (máximo `created_at` em `nps_surveys` para o telefone), `hasActiveSurvey`, `optOut` (de `contacts`) e `hasHumanMessage` (existe mensagem `direction='outbound'` com `author_type` humano);
3. `sentToday` = contagem de `nps_surveys` da loja com `created_at >= date_trunc('day', now())`;
4. aplica `decideSurveys`;
5. para cada aceito: gera token com `crypto.randomUUID().replace(/-/g, "")` **duas vezes concatenadas** (64 chars, bem acima do mínimo de 32), insere o survey com `expires_at = now() + token_expiry_days`, chama o sender, e grava `channel`/`status`/`sent_at`;
6. expira: `update nps_surveys set status='expired' where status='sent' and expires_at < now()`;
7. audita cada rejeição agregada por `reason` e cada envio;
8. devolve `{ eligible, created, sent, failed, expired, suppressed: { cooldown: n, ... } }` — **nunca truncar em silêncio**.

> A consulta do passo 2 é complexa o bastante para justificar uma RPC
> `nps_survey_candidates(p_store_id uuid, p_backfill_days int)` em SQL, como o
> `sdr_backstop_candidates` faz. Preferir a RPC: mantém o filtro relacional em
> um round-trip e testável por SQL. Se optar pela RPC, ela entra nesta mesma
> migration da Task 1 ou numa própria — exportada para `supabase/migrations/`.

- [ ] **Step 4: Escrever a migration do cron**

Criar `supabase/migrations/20260812140100_nps_scheduler_cron.sql`, no formato de `20260715150000_sdr_backstop_cron_trigger.sql`:

```sql
-- NPS scheduler: tick horário.
--
-- ORDEM DE APLICAÇÃO: esta migration deve rodar DEPOIS do deploy de
-- nps-scheduler, para que o primeiro tick encontre o endpoint vivo.
-- Requer o segredo NPS_WORKER_SECRET já cadastrado no Vault.
--
-- De hora em hora (e não a cada minuto como o SDR): a pesquisa não é urgente,
-- e a janela de envio já segura o disparo fora do horário comercial.

create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'nps-scheduler';

select cron.schedule(
  'nps-scheduler',
  '5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://njizaasajkdqptlxddqn.supabase.co/functions/v1/nps-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', public.integration_secret_get('NPS_WORKER_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $cron$
);
```

- [ ] **Step 5: Verificar o efeito colateral na conversa resolvida**

A pesquisa é enviada numa conversa cujo status é `resolvida`. Este projeto já
teve duas patologias vizinhas: o eco do envio criando uma **conversa nova**
depois do encerramento (`project_conversation_split_echo_after_close`) e a
regra de que inbound reabre mas eco não (`project_attendance_close_history`).

Antes de considerar a tarefa pronta, ler `_shared/whatsapp/send/core.ts` e o
tratamento de eco no webhook e responder por escrito:

1. enviar nesta conversa muda o `status` dela de volta para `em_andamento`?
2. o eco do provedor cria uma segunda conversa?

Se qualquer resposta for sim, a mensagem do NPS precisa ser marcada para não
reabrir (ou o envio precisa preservar o status), e isso entra como passo extra
aqui. **Não deixar para descobrir em produção** — uma pesquisa que reabre 50
conversas por dia devolve o Inbox ao caos que o encerramento resolveu.

- [ ] **Step 6: Rodar o gate e commitar**

Run: `bun run test && bun run build`
Expected: PASS.

```bash
git add supabase/functions/nps-scheduler/ supabase/migrations/20260812140100_nps_scheduler_cron.sql
git commit -m "feat(nps): add nps-scheduler edge function with WhatsApp sender and cron"
```

> ⚠️ **Não aplicar a migration do cron nem deployar a Edge sem OK explícito do
> dono.** O switch `enabled` nasce `false`, então mesmo aplicada nada dispara —
> mas a ordem (deploy → migration → ligar o switch) é obrigatória.

---

## Task 5: Submissão pública

**Files:**
- Create: `supabase/functions/nps-submit/index.ts`, `supabase/functions/nps-submit/rateLimit.ts`, `supabase/functions/nps-submit/rateLimit.test.ts`

**Interfaces:**
- Consumes: tabela `nps_surveys` (Task 1).
- Produces: `GET /nps-submit?token=` → `{ state, recipientFirstName, contextLabel }`; `POST /nps-submit` → 200 / 409 / 429.

- [ ] **Step 1: Escrever o teste do rate limit**

Criar `supabase/functions/nps-submit/rateLimit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rateLimit";

describe("createRateLimiter", () => {
  it("allows up to the limit inside the window", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
    let now = 0;
    expect(limiter.check("1.2.3.4", now)).toBe(true);
    expect(limiter.check("1.2.3.4", now)).toBe(true);
    expect(limiter.check("1.2.3.4", now)).toBe(true);
    expect(limiter.check("1.2.3.4", now)).toBe(false);
  });

  it("isolates distinct IPs", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.check("1.1.1.1", 0)).toBe(true);
    expect(limiter.check("1.1.1.1", 0)).toBe(false);
    expect(limiter.check("2.2.2.2", 0)).toBe(true);
  });

  it("frees the budget after the window passes", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.check("1.1.1.1", 0)).toBe(true);
    expect(limiter.check("1.1.1.1", 30_000)).toBe(false);
    expect(limiter.check("1.1.1.1", 60_001)).toBe(true);
  });
});
```

Run: `bun run test supabase/functions/nps-submit/rateLimit.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implementar o rate limit**

Criar `supabase/functions/nps-submit/rateLimit.ts`:

```ts
/**
 * Rate limit em memória por IP. A instância da Edge Function é efêmera, então
 * isto não é uma barreira dura — é o freio barato contra varredura de tokens.
 * A barreira real é o token opaco de 64 chars, que não enumera.
 */
export interface IRateLimiter {
  check(key: string, nowMs: number): boolean;
}

export function createRateLimiter(opts: { limit: number; windowMs: number }): IRateLimiter {
  const hits = new Map<string, number[]>();
  return {
    check(key, nowMs) {
      const cutoff = nowMs - opts.windowMs;
      const recent = (hits.get(key) ?? []).filter((stamp) => stamp > cutoff);
      if (recent.length >= opts.limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(nowMs);
      hits.set(key, recent);
      return true;
    },
  };
}
```

Run: `bun run test supabase/functions/nps-submit/rateLimit.test.ts` — Expected: PASS.

- [ ] **Step 3: Implementar o endpoint**

Criar `supabase/functions/nps-submit/index.ts`. Diferente das demais funções, esta é **pública sem `x-worker-secret`** — a posse do token é a autorização, e nada além. Precisa de `verify_jwt = false` no `supabase/config.toml` (conferir como `waha-webhook` está declarado e seguir o mesmo padrão).

Comportamento:

- **GET** `?token=` — carrega o survey por token. Devolve `{ state: 'valid' | 'expired' | 'responded' | 'invalid', recipientFirstName, contextLabel }`. Token inexistente e token expirado devolvem estados distintos **apenas quando o token existe**: um token que não existe é sempre `invalid`, nunca revela se já existiu. Sem PII além do primeiro nome.
- **POST** `{ token, score, comment }` — valida `score` inteiro em 0..10 e `comment` com no máximo 1000 chars; rate limit de 10/min por IP (`x-forwarded-for`), respondendo **429** ao estourar; token já respondido → **409**; token expirado → **410**. No sucesso grava `score`, `comment`, `responded_at`, `status='responded'` com um `update ... where status = 'sent'` que **falha se nenhuma linha for afetada** — é isso que torna a segunda submissão um 409 mesmo sob corrida.
- Quando `score <= 6`, insere em `notifications` o alerta de detrator:

```ts
await admin.from("notifications").insert({
  dedupe_key: `nps.detractor.${survey.id}`,
  lifecycle: "emitted",
  type: "nps.detratorRespondeu",
  category: "operational",
  severity: "warning",
  recipient_type: "role",
  recipient_id: "Gestor",
  store_id: survey.store_id,
  title: "Detrator no NPS",
  body: `${survey.recipient_name ?? "Cliente"} deu nota ${score}.`,
  entity_ref: { kind: "conversation", id: survey.conversation_id },
  channels: ["inApp", "toast"],
  source: "nps-submit",
});
```

> Conferir os valores aceitos de `lifecycle`, `category`, `severity`,
> `recipient_type` e `type` contra as constraints reais de `notifications` e
> contra `src/providers/notifications/events.ts` antes de escrever. Se `type`
> tiver constraint de enum, acrescentar `nps.detratorRespondeu` ao catálogo na
> mesma migration da Task 1.

- [ ] **Step 4: Rodar o gate e commitar**

Run: `bun run test && bun run build` — Expected: PASS.

```bash
git add supabase/functions/nps-submit/ supabase/config.toml
git commit -m "feat(nps): add public nps-submit edge function with rate limit and detractor alert"
```

---

## Task 6: Landing pública

**Files:**
- Create: `src/features/nps/pages/NpsSurveyPublicPage.tsx`, `src/routes/pesquisa.$token.tsx`
- Modify: `index.html` (nada a mudar se o `noindex` for por meta na página — verificar)

**Interfaces:**
- Consumes: `GET/POST /nps-submit` (Task 5).
- Produces: rota pública `/pesquisa/$token`.

- [ ] **Step 1: Criar a rota**

Criar `src/routes/pesquisa.$token.tsx` no nível **raiz** do router — fora de `/app`, `/loja`, `/pwa`, `/portal` e portanto fora de todos os guards de autenticação:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { NpsSurveyPublicPage } from "@/features/nps";

export const Route = createFileRoute("/pesquisa/$token")({
  component: NpsSurveyPublicPage,
});
```

Não editar `routeTree.gen.ts` — o plugin do Vite regenera.

- [ ] **Step 2: Implementar a página**

Criar `src/features/nps/pages/NpsSurveyPublicPage.tsx`, mobile-first, **só tokens semânticos**:

- carrega o contexto no mount (`GET /nps-submit?token=`), com estado de carregando;
- `state === 'valid'`: pergunta "De 0 a 10, qual a chance de você recomendar a GALLO para um colega ou amigo?", 11 botões em grade, alvo de toque ≥ 48px, gradiente semântico de `severity` (0 vermelho → 10 verde), `aria-label` por nota; ao escolher, revela o comentário opcional (≤ 1000 chars) e o botão "Enviar";
- `?score=N` na query pré-seleciona a nota, mas o envio ainda exige confirmação;
- após enviar: agradecimento — variação de detrator ("Sentimos muito pela experiência. Nosso time vai entrar em contato.") quando a nota for ≤ 6;
- estados `expired`, `responded`, `invalid` com telas próprias, sem vazar dado nenhum;
- `<meta name="robots" content="noindex">` e `<meta name="referrer" content="no-referrer">` injetados pela própria página.

**Acessibilidade obrigatória (WCAG 2.1 AA):** a escala é um `radiogroup` navegável por teclado, com foco visível e `aria-checked`. Cor nunca é o único portador de significado — cada botão mostra o número.

- [ ] **Step 3: Verificar manualmente que a rota compila**

Run: `bun run build`
Expected: PASS, e `src/routeTree.gen.ts` passa a conter `/pesquisa/$token`.

> Não abrir navegador para validar visual — o dono testa (preferência
> registrada). Descrever em texto o que foi construído.

- [ ] **Step 4: Commit**

```bash
git add src/features/nps/pages/NpsSurveyPublicPage.tsx src/routes/pesquisa.\$token.tsx src/routeTree.gen.ts
git commit -m "feat(nps): add public survey landing page at /pesquisa/:token"
```

---

## Task 7: Provider e hooks

**Files:**
- Create: `src/providers/data/contracts/nps.ts`, `src/providers/data/impl/supabase/nps.ts`, `src/providers/data/impl/mock/nps.ts`, `src/features/nps/hooks/useNpsMetrics.ts`, `src/features/nps/hooks/useNpsSurveys.ts`
- Modify: `src/providers/data/contracts/index.ts`, `src/providers/data/factory.ts`, `src/providers/data/index.ts`

**Interfaces:**
- Consumes: `INpsSurvey`, `INpsResult`, `computeNps` (Task 2).
- Produces: `useNpsProvider()`, `useNpsMetrics(filters)`, `useNpsSurveys(filters)`.

- [ ] **Step 1: Definir o contrato**

Criar `src/providers/data/contracts/nps.ts`:

```ts
import type { INpsResult, INpsSurvey } from "@/shared/types";

export interface INpsFilters {
  storeId?: string;
  windowDays: number;
  trigger?: "conversation_resolved" | "order_delivered" | "manual";
  /** 'customer' = só clientes cadastrados; 'contact' = só contatos do pool. */
  audience?: "customer" | "contact";
}

export interface INpsMonthlyPoint {
  month: string;         // 'YYYY-MM'
  score: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  n: number;
}

export interface INpsProvider {
  metrics(filters: INpsFilters): Promise<INpsResult & { monthly: INpsMonthlyPoint[] }>;
  list(filters: INpsFilters & { page?: number; pageSize?: number; search?: string }):
    Promise<{ data: INpsSurvey[]; total: number }>;
}
```

Registrar no barrel `contracts/index.ts` e no `factory.ts`, seguindo exatamente o que `pixKey` faz nos três arquivos.

- [ ] **Step 2: Implementar o provider Supabase**

Criar `src/providers/data/impl/supabase/nps.ts`, mapeando `snake_case ↔ camelCase` com `rowToNpsSurvey`, no molde de `impl/supabase/pixKey.ts`.

⚠️ **Paginação:** usar `.range()` explícito e devolver `total` do `count`. O
truncamento silencioso do `list()` já mordeu este projeto
(`project_provider_list_pagination_truncation_fix`) — provider **e** consumidor
são as duas metades do bug.

⚠️ **Filtros `.in()`:** se a lista de ids crescer, o overflow de URL do
PostgREST derruba a query (`project_analytics_in_url_overflow_bug`). Preferir
junção no servidor a montar `.in()` gigante no cliente.

- [ ] **Step 3: Implementar o provider Mock**

Criar `src/providers/data/impl/mock/nps.ts` gerando surveys com Faker em
distribuição plausível (~60% promotores, 20% neutros, 20% detratores), com seed
determinística como o resto da camada de mocks.

- [ ] **Step 4: Escrever os hooks**

Criar `src/features/nps/hooks/useNpsMetrics.ts` e `useNpsSurveys.ts` com TanStack Query.

⚠️ **Chave de query:** usar o **id** da loja, nunca o objeto
(`project_query_cache_survives_login`). Incluir `storeId` e todos os filtros na
key, para que trocar de loja não sirva cache alheio.

- [ ] **Step 5: Rodar o gate e commitar**

Run: `bun run test && bun run build` — Expected: PASS.

```bash
git add src/providers/data/ src/features/nps/hooks/
git commit -m "feat(nps): add NPS data provider (mock + supabase) and read hooks"
```

---

## Task 8: Página analítica

**Files:**
- Create: `src/features/nps/pages/NpsAnalyticsPage.tsx`, `src/routes/app.nps.tsx`, `src/features/nps/i18n/pt-BR.ts`, `src/features/nps/index.ts`
- Modify: `src/features/shell/config/routes.ts` (constante da rota), `src/features/shell/config/navigation.ts` (item do menu), `src/features/shell/config/navigation.test.ts` (o menu é testado — o teste quebra se o item novo não for previsto)

**Interfaces:**
- Consumes: `useNpsMetrics`, `useNpsSurveys` (Task 7).
- Produces: rota `/app/nps`.

- [ ] **Step 1: Criar a rota com guarda**

`src/routes/app.nps.tsx` protegida por `GuardedRoute` com o recurso `nps`.

⚠️ Usar `usePermission` contra a matriz de papéis, **nunca** `userRole`
hardcoded (`project_rbac_permissions_live_in_matrix`). E lembrar que
`requireAuth` combina papéis e permissão com **AND** — um teto de papel-base
torna a matriz inerte (`project_requireauth_and_ceiling_inert`). Vendedor e
Financeiro ficam de fora.

- [ ] **Step 2: Montar a página**

Header com filtros (janela 30/90/180/365, loja para Owner, gatilho, público
cliente/contato) sincronizados na URL. KPIs: score, N, taxa de resposta, Δ vs
janela anterior. Dois gráficos: evolução mensal (12 meses) e distribuição
empilhada por mês. Tabela paginada (30/página) com filtro por classe e busca no
comentário. Seção Detratores com CTA "Abrir conversa".

**Quando `state === 'collecting'`, exibir "Coletando dados (N/5)" no lugar do
número — em todos os KPIs. Nunca renderizar um score sob o mínimo.**

Seguir `docs/dev/ux-guidelines.md`: header glassmorphism com tokens semânticos,
`ScrollProgressBar` na divisa do bloco fixo, busca com atalho `/` e `Escape`,
colunas redimensionáveis via `@/shared/hooks/useResizableColumns` com
persistência em `gallo-nps-column-widths`, delimitadores verticais só no
cabeçalho e menu de colunas no clique-direito do cabeçalho.

- [ ] **Step 3: Registrar no menu**

Em `src/features/shell/config/routes.ts`, acrescentar a constante `APP_NPS: "/app/nps"` seguindo o formato das vizinhas.

Em `src/features/shell/config/navigation.ts`, acrescentar o item ao grupo "Atendimento", no formato já usado pelos demais:

```ts
      {
        label: "NPS",
        icon: "mdi:emoticon-outline",
        to: ROUTES.APP_NPS,
        permission: { resource: "nps" },
      },
```

⚠️ **Não acrescentar `roles: [...]` neste item.** Alguns itens vizinhos têm
`roles` e `permission` juntos, e os dois combinam com **AND** — um teto de
papel-base torna a matriz de permissões inerte, de modo que conceder `nps` a um
papel novo pelo editor não teria efeito
(`project_requireauth_and_ceiling_inert`). O controle de acesso aqui é só a
permissão.

Rodar o teste do menu, que cobre esse arquivo:

Run: `bun run test src/features/shell/config/navigation.test.ts`
Expected: PASS — ajustar o teste se ele afirmar a contagem ou a lista de itens.

- [ ] **Step 4: Rodar o gate e commitar**

Run: `bun run test && bun run build` — Expected: PASS.

```bash
git add src/features/nps/ src/routes/app.nps.tsx src/routeTree.gen.ts src/features/shell/config/
git commit -m "feat(nps): add /app/nps analytics page"
```

---

## Task 9: Quitar os placeholders

**Files:**
- Modify: `src/features/executive-cockpit/pages/ExecutiveCockpitPage.tsx:299-307`, `src/features/executive-cockpit/i18n/pt-BR.ts:37-57`
- Modify: `src/features/customers/components/ProfileHeader.tsx` (badge de NPS)

**Interfaces:**
- Consumes: `useNpsMetrics` (Task 7).

- [ ] **Step 1: Ativar o card do Cockpit**

Hoje o card é literalmente um placeholder — `value={null}` com `tag={S.kpiNpsSoon}`. Trocar por `useNpsMetrics({ windowDays: 90 })`:

- `state === 'collecting'` → exibe "Coletando dados (N/5)", mantendo a tag;
- `state === 'ok'` → exibe o score e remove a tag "Em breve";
- clique navega para `/app/nps`.

Remover `kpiNpsSoon` do i18n só se não houver outro consumidor; atualizar `kpiNpsHelp`, que hoje termina em "Disponível em breve."

**Mudança cirúrgica no card — sem refactor do grid.**

- [ ] **Step 2: Badge na ficha do cliente**

No header da ficha, exibir "NPS {score} · {classe}" quando o cliente tiver
resposta nos últimos 12 meses. Classe por `classifyScore` (Task 2), cor por
token de severidade. Sem resposta, o badge não aparece — nada de "sem dados".

- [ ] **Step 3: Rodar o gate e commitar**

Run: `bun run test && bun run build` — Expected: PASS.

```bash
git commit -am "feat(nps): activate Cockpit NPS card and customer fiche badge"
```

---

## Task 10: Configuração e documentação

**Files:**
- Create: `src/features/nps/pages/NpsSettingsPage.tsx`, `src/routes/app.configuracoes.nps.tsx`, `docs/dev/nps.md`
- Modify: o índice de Configurações (acrescentar o item sob `settings_nps`)
- Modify: `docs/prds/PRD-148B-nps-pesquisa-satisfacao.md` (bloco "Status de Implementação")

- [ ] **Step 1: Tela de configuração**

Formulário (react-hook-form + zod) sobre `nps_settings`, restrito ao recurso
`settings_nps`: master switch, gatilhos e delays, cooldown, expiração do token,
janela do score, amostragem, janela de envio, N mínimo, `max_backfill_days`,
`daily_cap` e instância de WhatsApp. Cada campo com texto curto explicando a
consequência — sobretudo os dois backstops.

Mudanças auditadas como `nps_config_changed`.

- [ ] **Step 2: Resolver a questão do fuso**

Decidir com o dono se `send_window_*` é UTC ou local, implementar de acordo e
registrar em `docs/dev/nps.md`. O padrão sugerido: guardar em hora **local** e
converter no scheduler, que é o que o usuário espera ao digitar "9".

- [ ] **Step 3: Escrever a documentação**

Criar `docs/dev/nps.md`: metodologia (classes, janela, N mínimo), regras
anti-fadiga e os dois backstops, fluxo fim-a-fim, como ligar em produção
(deploy da Edge → migration do cron → segredo no Vault → ligar o switch),
guia do Gestor para tratar detratores, e o que fica para a Onda 8 (e-mail e
dispatch 141).

- [ ] **Step 4: Fechar o PRD**

Preencher "Status de Implementação" no PRD-148B e renomear para
`PRD-148B-nps-pesquisa-satisfacao_DONE.md`, anotando no cabeçalho as
divergências D1–D6 da spec.

- [ ] **Step 5: Gate final e commit**

Run: `bun run test && bun run build && bunx tsc --noEmit`
Expected: testes e build PASS; no `tsc`, **nenhum erro novo** nos arquivos criados nesta branch (cruzar com `git diff --name-status main...HEAD --diff-filter=A`).

```bash
git add -A
git commit -m "feat(nps): add NPS settings screen and documentation"
```

---

## Fora deste plano

Herdado da spec: canal e-mail, submissão de template HSM à Meta, resposta
inline no WhatsApp, NPS relacional em massa, workflow formal de detrator,
análise de sentimento por LLM, CSAT/CES, ranking por vendedor, SMS.

## Pendências para o dono

1. **Aplicar as migrations** — manual, com OK explícito. Ordem: schema (Task 1) → deploy das Edge Functions → cron (Task 4).
2. **Cadastrar `NPS_WORKER_SECRET`** no Vault antes do primeiro tick.
3. **Validar o texto da pesquisa** (Task 4, Step 1) antes de ligar o switch.
4. **Ligar `enabled`** por loja, conscientemente — nasce `false` de propósito.
5. **Decidir o fuso da janela de envio** (Task 10, Step 2).
