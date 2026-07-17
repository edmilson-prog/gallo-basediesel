# SDR — Escalonamento real: timeout + broadcast urgente (Parte D) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two production gaps left by the SDR→human handoff (Parte B/C): an escalation assigned to a seller who never responds sits silently forever, and an escalation where `chooseHumanSeller` found nobody leaves `conversations.is_sdr_active` stuck `true` with no one watching it. A new per-minute tick detects both cases, broadcasts an in-app notification to every seller with access to the conversation's WhatsApp instance, and an atomic RPC lets the first seller to react claim it — replacing the non-atomic client-side `.patch()` the existing (mock-era) claim UI uses today.

**Architecture:** Pure SQL layer (2 new `sdr_settings` columns, a first-response trigger, an eligibility helper, an atomic claim RPC) + a new Edge Function (`sdr-escalation-timeout-tick`, same worker-secret/pg_cron shape as `sdr-backstop-tick`) that does the actual detection and notification fan-out + frontend plumbing (provider contract extensions) + two frontend UI touch-ups (real thresholds in `/app/sdr` → Configurações, atomic claim in the existing floating panel).

**Tech Stack:** Supabase Postgres (SQL functions/triggers, pg_cron, pg_net), Deno Edge Functions (existing `_shared/` helpers), React + TanStack Query (existing provider pattern), Vitest for the one piece of genuinely testable pure logic (the mock claim's conflict guard).

## Global Constraints

- TypeScript `strict: true`, no `any`. Domain interfaces prefixed `I`. camelCase in TS, snake_case in SQL/DB columns.
- **Live schema, not the migration files, is the source of truth for column types.** Verified live via `information_schema.columns` on 2026-07-17: `sdr_escalations.id`/`conversation_id`/`store_id`/`assigned_seller_id`, `sellers.id`/`store_id`/`auth_user_id`, `conversations.id`/`assigned_seller_id`/`store_id`/`whatsapp_account_id` are ALL `uuid` in production — even though the oldest checked-in migration files (`20260608144535_create_sellers_table.sql`, `20260608155137_create_sdr_escalations_table.sql`) still declare some of these as `text`. This is pre-existing, undocumented drift outside this plan's scope to reconcile — every new SQL object in this plan is written against the verified live `uuid` types, not the stale migration-file text.
- `notifications.recipient_id` is `text` (verified: `20260608224033_create_notifications_tables.sql`) and its RLS policies compare it as `recipient_id = public.current_seller_id()::text` — `current_seller_id()` itself returns `uuid`. Every seller id written to `notifications.recipient_id` in this plan is explicitly cast `::text` (in SQL) or used as a plain string (in TS, since `admin.rpc(...)` already returns the uuid as a JS string).
- New SQL functions in this plan follow the **same local convention as the existing SDR-feature migrations** (`sdr_pause_on_human_message`, `20260714120100`): `security definer`, `set search_path = public`, bare (unqualified) table names — not the `search_path = ''` + fully-qualified-`public.`-everywhere style used by the older `whatsapp_multi_access_helpers.sql`. Both conventions coexist in this codebase; this plan matches its own feature's nearest precedent.
- `sellers.id`, not `auth.users.id`, is the canonical "seller identity" used everywhere a `notifications.recipient_id` or an `sdr_escalations.assigned_seller_id` is written. The existing `public.current_seller_id()` helper already resolves "the calling JWT's seller id" — reuse it; do not re-derive it from `auth.uid()` by hand.
- **Known, accepted limitation (explicit product decision from this session, do not "fix" it as part of this plan):** the pre-existing client-side PRD-023 simulation hooks (`useUrgentBroadcastTimer`, `useEscalationQueueTimeoutMonitor`, both mounted unconditionally in `AppLayout.tsx` for any Owner/Gestor session) already read/write the real `sdr_escalations` table today via the real `supabaseSdrEscalationsProvider`, using different, hardcoded thresholds (`IPlatformSettings.escalationUrgentBroadcastDelaySeconds` = 30s flat; `escalationQueueTimeoutMinutesUrgent`/`Normal`). Once a pilot store/instance goes live for real, these legacy hooks will run concurrently with the new tick built in this plan, against the same rows, with different timing. This plan does **not** touch, gate, or retire those two hooks or their `AppLayout.tsx` mounts — that was a deliberate scope decision, not an oversight. Do not "helpfully" fix it while implementing.
- This plan **does** touch `UrgentBroadcastClaim.tsx`'s supporting hook (`useUrgentBroadcastQueue.ts`) — that file is the *claim* UI, not a *detection* timer, and rewiring it to the new atomic RPC is explicitly in scope (Task 5).
- `supabase/functions/**` has no Vitest coverage anywhere in this codebase (established project convention) — Tasks 1 and 2 are validated by self-review + the manual smoke plan at the end of this document, not by automated tests.
- Every new/changed frontend file that touches `@/providers/data` types must be re-exported through the existing barrels — never import `impl/mock` or `impl/supabase` directly from feature code (ESLint-enforced, see `CLAUDE.md`).
- Migration file naming: `YYYYMMDDHHMMSS_description.sql`, chronologically after the newest existing migration (`20260716210000_digit_search_columns_and_rpc.sql`).
- Do not apply migrations or deploy Edge Functions yourself as part of implementing this plan — that is a separate, explicitly-authorized step the human partner performs after the branch is reviewed (matches this project's established pattern for every prior SDR delivery).

---

## Task 1: SQL — timeout columns, first-response trigger, eligibility helper, atomic claim RPC

**Files:**
- Create: `supabase/migrations/20260717120000_sdr_escalation_timeout_schema.sql`

**Interfaces:**
- Produces (consumed by Task 2's Edge Function and Task 5's frontend RPC call):
  - `public.accessible_seller_ids_for_account(p_account_id uuid) returns setof uuid` — sellers eligible to be notified for a given WhatsApp instance (owner/manager, always; others via `whatsapp_account_access_rules`).
  - `public.claim_sdr_escalation(p_escalation_id uuid) returns public.sdr_escalations` — atomic claim, callable via `supabase.rpc("claim_sdr_escalation", { p_escalation_id })` from an authenticated seller session. Raises `escalation_already_claimed` (already-claimed race) or `seller_not_found` (no seller row on the caller's JWT).
  - New columns `public.sdr_settings.escalation_timeout_urgent_minutes` (default `5`) and `.escalation_timeout_normal_minutes` (default `30`).

- [ ] **Step 1: Write the migration file**

```sql
-- Parte D — real escalation timeout + urgent broadcast (PRD-023, produção).
--
-- Closes two gaps found while shipping Parte B/C
-- (docs/superpowers/specs/2026-07-16-sdr-escalonamento-timeout-broadcast-design.md):
--   Gap 1: an escalation assigned to a seller who never responds sits silent.
--   Gap 2: escalateToHuman() finding no seller (status='pending') leaves
--     conversations.is_sdr_active stuck true — nobody is actually watching it.
--
-- NOTE ON TYPES: sellers.id / sdr_escalations.id / conversation_id /
-- assigned_seller_id are all `uuid` in production (verified live via
-- information_schema.columns, 2026-07-17) even though the oldest checked-in
-- migration files for these tables still declare some of them `text` — this
-- migration is written against the verified live types.

-- 1) Per-store timeout thresholds (minutes) — same table as the pilot
--    kill-switch/backstop timeout (sdr_settings, Parte B/C).
alter table public.sdr_settings
  add column if not exists escalation_timeout_urgent_minutes integer not null default 5,
  add column if not exists escalation_timeout_normal_minutes integer not null default 30;

-- 2) First-human-response trigger. Mirrors sdr_pause_on_human_message's
--    philosophy (Parte A, 20260714120100): ANY seller outbound message on the
--    conversation counts, not just the specifically assigned one. Casting
--    messages.author_id to match assigned_seller_id would risk breaking every
--    seller send if the cast ever failed (this is a blocking AFTER INSERT
--    trigger) — a precision this signal doesn't need.
create or replace function public.sdr_escalation_first_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.direction = 'out' and new.author_type = 'seller' then
    update sdr_escalations
    set first_human_response_at = now(),
        status = 'answered'
    where conversation_id = new.conversation_id
      and status = 'assigned'
      and first_human_response_at is null;
  end if;
  return new;
end;
$$;

comment on function public.sdr_escalation_first_response() is
  'Parte D: marks the first outbound seller message on a conversation as the escalation''s first human response — stops the broadcast countdown. Independent of, and coexists with, trg_sdr_pause_on_human_message on the same table/event.';

drop trigger if exists sdr_escalation_first_response_trigger on public.messages;
create trigger sdr_escalation_first_response_trigger
  after insert on public.messages
  for each row
  when (new.direction = 'out' and new.author_type = 'seller')
  execute function public.sdr_escalation_first_response();

-- 3) Broadcast eligibility — sellers who can access the WhatsApp instance
--    behind a given escalation's conversation. Runs from
--    sdr-escalation-timeout-tick (service_role, no auth.uid()) so it CANNOT
--    reuse current_seller_accessible_account_ids() (that helper resolves
--    "the current JWT's seller"). This is its mirror, parameterized by
--    account instead of by session — same OR-of-rules logic as
--    whatsapp_multi_access_helpers.sql's current_seller_accessible_account_ids,
--    minus the "current seller" framing. whatsapp_account_access_rules.target_value
--    is text, hence the ::text casts on the uuid columns being compared.
create or replace function public.accessible_seller_ids_for_account(p_account_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from sellers s
  join whatsapp_accounts a on a.id = p_account_id
  left join profiles p on p.auth_user_id = s.auth_user_id
  where s.store_id = a.store_id
    and s.active = true
    and (
      p.role in ('owner', 'manager')
      or exists (
        select 1 from whatsapp_account_access_rules r
        where r.whatsapp_account_id = p_account_id
          and (
            (r.kind = 'seller' and r.target_value = s.id::text)
            or (r.kind = 'role' and r.target_value = p.role)
            or (r.kind = 'store' and r.target_value = s.store_id::text)
          )
      )
    );
$$;

comment on function public.accessible_seller_ids_for_account(uuid) is
  'Parte D: seller ids eligible to see/claim an urgent-broadcast escalation on this WhatsApp instance (owner/manager + explicit access rules). Service-role callable (no auth.uid() dependency) — used by sdr-escalation-timeout-tick.';

revoke all on function public.accessible_seller_ids_for_account(uuid) from public, anon, authenticated;
grant execute on function public.accessible_seller_ids_for_account(uuid) to service_role;

-- 4) Atomic claim — fixes useUrgentBroadcastQueue's non-atomic client
--    .patch(). `urgent_broadcast_claimed_by_seller_id is null` in the WHERE
--    clause is the race guard: two sellers claiming concurrently, only one
--    UPDATE matches a row and RETURNING gives it a value; the loser's
--    v_row.id stays null and the function raises.
create or replace function public.claim_sdr_escalation(p_escalation_id uuid)
returns sdr_escalations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller_id uuid := current_seller_id();
  v_row sdr_escalations;
begin
  if v_seller_id is null then
    raise exception 'seller_not_found';
  end if;

  update sdr_escalations
  set assigned_seller_id = v_seller_id,
      assigned_at = now(),
      first_human_response_at = null,
      status = 'assigned',
      urgent_broadcast_claimed_by_seller_id = v_seller_id,
      urgent_broadcast_claimed_at = now()
  where id = p_escalation_id
    and urgent_broadcast_claimed_by_seller_id is null
    and status in ('pending', 'assigned')
  returning * into v_row;

  if v_row.id is null then
    raise exception 'escalation_already_claimed';
  end if;

  update conversations
  set assigned_seller_id = v_seller_id,
      is_sdr_active = false
  where id = v_row.conversation_id;

  return v_row;
end;
$$;

comment on function public.claim_sdr_escalation(uuid) is
  'Parte D: atomically claims a broadcasting escalation for the caller''s seller id and reassigns the conversation. Raises escalation_already_claimed on a lost race, seller_not_found if the JWT has no seller_id claim.';

revoke all on function public.claim_sdr_escalation(uuid) from public, anon;
grant execute on function public.claim_sdr_escalation(uuid) to authenticated;
```

- [ ] **Step 2: Self-review against the design spec**

Re-read `docs/superpowers/specs/2026-07-16-sdr-escalonamento-timeout-broadcast-design.md` sections "2. Trigger", "5. RPC atômica" and confirm: the trigger's predicate matches (`status='assigned' and first_human_response_at is null`); the RPC's WHERE clause matches (`urgent_broadcast_claimed_by_seller_id is null and status in ('pending','assigned')`); `first_human_response_at` is reset to `null` on claim (the design's stated behavior — "o relógio de resposta recomeça"). Confirm no `::uuid` cast of `messages.author_id` was introduced (the design spec's own self-review flagged this as the one thing that must never happen — a blocking trigger cast failure would break every seller send).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260717120000_sdr_escalation_timeout_schema.sql
git commit -m "feat(sdr): schema for escalation timeout + atomic claim (Parte D)"
```

---

## Task 2: Edge Function — `sdr-escalation-timeout-tick` + cron trigger

**Files:**
- Create: `supabase/functions/sdr-escalation-timeout-tick/index.ts`
- Create: `supabase/migrations/20260717130000_sdr_escalation_timeout_cron_trigger.sql`

**Interfaces:**
- Consumes: `public.accessible_seller_ids_for_account(uuid)` (Task 1) via `admin.rpc(...)`; `_shared/env.ts`'s `requiredEnv`; `_shared/http.ts`'s `HttpError`/`json`; `_shared/serve.ts`'s `servePost`; `_shared/secrets.ts`'s `createSecretResolver`; `_shared/workerAuth.ts`'s `verifyWorkerSecret`. Same import shapes as `supabase/functions/sdr-backstop-tick/index.ts`.
- Produces: a public (verify_jwt off — same as every other worker tick in this project), `x-worker-secret`-gated `POST` endpoint. Response body `{ broadcast: number }`.

- [ ] **Step 1: Write the Edge Function**

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * sdr-escalation-timeout-tick — agendada via pg_cron a cada 1 minuto (mesmo
 * padrão de sdr-backstop-tick). Fecha dois gaps do handoff SDR→humano
 * (docs/superpowers/specs/2026-07-16-sdr-escalonamento-timeout-broadcast-design.md):
 *
 *  Frente A — escalação 'pending' (chooseHumanSeller não achou ninguém):
 *    dispara o broadcast IMEDIATAMENTE (não há ninguém esperando responder)
 *    e corrige conversations.is_sdr_active, que fica órfão nesse caminho.
 *  Frente B — escalação 'assigned' sem resposta do vendedor além do
 *    threshold configurado (sdr_settings.escalation_timeout_urgent_minutes /
 *    _normal_minutes, por modo — 'standard' usa o threshold normal).
 *
 * Ambas convergem no mesmo passo final: marca urgent_broadcast_at e insere
 * uma notificação (tabela notifications) para todo seller com acesso à
 * instância WhatsApp da conversa, exceto o já atribuído (se houver).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requiredEnv } from "../_shared/env.ts";
import { HttpError, json } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { verifyWorkerSecret } from "../_shared/workerAuth.ts";

const WORKER_SECRET_NAME = "SDR_WORKER_SECRET";

interface IEscalationRow {
  id: string;
  conversation_id: string;
  assigned_seller_id: string | null;
  assigned_at: string | null;
  mode: "urgent" | "normal" | "standard";
  context_summary: { customerName?: string } | null;
  created_at: string;
}
interface IConversationRow {
  id: string;
  whatsapp_account_id: string | null;
}
interface IPilotThresholds {
  store_id: string;
  escalation_timeout_urgent_minutes: number;
  escalation_timeout_normal_minutes: number;
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

  const ESCALATION_COLUMNS =
    "id, conversation_id, assigned_seller_id, assigned_at, mode, context_summary, created_at";

  // 1. Frente A — pending, never broadcast: fire immediately (no one is
  // waiting to respond, so there is no timeout to wait out).
  const { data: pendingRows } = await admin
    .from("sdr_escalations")
    .select(ESCALATION_COLUMNS)
    .eq("status", "pending")
    .is("urgent_broadcast_at", null);
  const pending = (pendingRows ?? []) as IEscalationRow[];

  // 2. Frente B — assigned, no response yet, past the store's threshold for its mode.
  const { data: assignedRows } = await admin
    .from("sdr_escalations")
    .select(ESCALATION_COLUMNS)
    .eq("status", "assigned")
    .is("first_human_response_at", null)
    .is("urgent_broadcast_at", null)
    .not("assigned_at", "is", null);
  const assignedCandidates = (assignedRows ?? []) as IEscalationRow[];

  let overdue: IEscalationRow[] = [];
  if (assignedCandidates.length > 0) {
    const convIds = [...new Set(assignedCandidates.map((e) => e.conversation_id))];
    const { data: convsForThresholds } = await admin
      .from("conversations")
      .select("id, store_id")
      .in("id", convIds);
    const storeByConv = new Map(
      (convsForThresholds ?? []).map((c) => [c.id as string, c.store_id as string]),
    );
    const storeIds = [...new Set([...storeByConv.values()])];
    const { data: settingsRows } = await admin
      .from("sdr_settings")
      .select("store_id, escalation_timeout_urgent_minutes, escalation_timeout_normal_minutes")
      .in("store_id", storeIds.length > 0 ? storeIds : [""]);
    const thresholdsByStore = new Map(
      (settingsRows ?? []).map((r) => [r.store_id as string, r as IPilotThresholds]),
    );
    const now = Date.now();
    overdue = assignedCandidates.filter((e) => {
      const storeId = storeByConv.get(e.conversation_id);
      const t = storeId ? thresholdsByStore.get(storeId) : undefined;
      // 'standard' mode (reachable — see defaultModeFor's 'sdr_failed'/'out_of_scope'
      // fallback) uses the normal threshold; only 'urgent' gets the shorter one.
      const minutes =
        e.mode === "urgent"
          ? (t?.escalation_timeout_urgent_minutes ?? 5)
          : (t?.escalation_timeout_normal_minutes ?? 30);
      const elapsedMs = now - new Date(e.assigned_at!).getTime();
      return elapsedMs >= minutes * 60_000;
    });
  }

  const toProcess = [...pending, ...overdue];
  if (toProcess.length === 0) return json({ broadcast: 0 }, 200);

  // 3. Resolve every candidate's WhatsApp instance in one query.
  const conversationIds = [...new Set(toProcess.map((e) => e.conversation_id))];
  const { data: convRows } = await admin
    .from("conversations")
    .select("id, whatsapp_account_id")
    .in("id", conversationIds);
  const accountByConv = new Map(
    ((convRows ?? []) as IConversationRow[]).map((c) => [c.id, c.whatsapp_account_id]),
  );

  let broadcastCount = 0;
  for (const escalation of toProcess) {
    const accountId = accountByConv.get(escalation.conversation_id);
    if (!accountId) {
      ctx.log.warn("sdr-escalation-timeout-tick skipped — conversation has no whatsapp account", {
        escalationId: escalation.id,
      });
      continue;
    }

    const { data: sellerIds, error: rpcError } = await admin.rpc(
      "accessible_seller_ids_for_account",
      { p_account_id: accountId },
    );
    if (rpcError) {
      ctx.log.error("sdr-escalation-timeout-tick eligibility lookup failed", {
        escalationId: escalation.id,
        error: rpcError.message,
      });
      continue;
    }
    const recipients = ((sellerIds ?? []) as string[]).filter(
      (id) => id !== escalation.assigned_seller_id,
    );

    if (recipients.length > 0) {
      const nowIso = new Date().toISOString();
      const customerName = escalation.context_summary?.customerName ?? "Cliente";
      const ageMinutes = Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(escalation.assigned_at ?? escalation.created_at).getTime()) /
            60_000,
        ),
      );
      const rows = recipients.map((sellerId) => ({
        dedupe_key: `sdr-escalation-broadcast-${escalation.id}-${sellerId}`,
        lifecycle: "event",
        type: "sdr.escalonouSemResposta",
        category: "operational",
        severity: "critical",
        recipient_id: sellerId,
        recipient_type: "seller",
        title: "Conversa do SDR aguardando atendimento",
        body: `${customerName} aguarda um vendedor há ${ageMinutes} min — ninguém respondeu ainda.`,
        entity_ref: { type: "conversation", id: escalation.conversation_id },
        status: "unread",
        channels: ["inApp"],
        source: "rule",
        created_at: nowIso,
      }));
      const { error: notifyError } = await admin.from("notifications").insert(rows);
      if (notifyError) {
        ctx.log.error("sdr-escalation-timeout-tick notification insert failed", {
          escalationId: escalation.id,
          error: notifyError.message,
        });
        continue;
      }
    }

    const { error: updateError } = await admin
      .from("sdr_escalations")
      .update({ urgent_broadcast_at: new Date().toISOString() })
      .eq("id", escalation.id)
      .is("urgent_broadcast_at", null);
    if (updateError) {
      ctx.log.error("sdr-escalation-timeout-tick escalation update failed", {
        escalationId: escalation.id,
        error: updateError.message,
      });
      continue;
    }

    // Gap 2 fix: a 'pending' escalation (no seller was ever assigned) left
    // conversations.is_sdr_active stuck true — nobody is watching it anymore.
    if (escalation.assigned_seller_id === null) {
      await admin
        .from("conversations")
        .update({ is_sdr_active: false })
        .eq("id", escalation.conversation_id)
        .eq("is_sdr_active", true);
    }

    broadcastCount++;
  }

  return json({ broadcast: broadcastCount }, 200);
});
```

- [ ] **Step 2: Write the cron trigger migration**

```sql
-- SDR escalation-timeout tick: periodic trigger (Parte D).
--
-- Same pattern as sdr-backstop-tick (20260715150000). pg_net is already
-- enabled by that migration.
--
-- ORDER OF OPERATIONS at apply time: this migration must run AFTER
-- sdr-escalation-timeout-tick is deployed, so the very first tick hits a
-- live endpoint. Reuses SDR_WORKER_SECRET (minted by
-- 20260715130000_sdr_activation_schema.sql) — same worker identity as
-- sdr-backstop-tick and sdr-respond.

select cron.unschedule(jobid) from cron.job where jobname = 'sdr-escalation-timeout-tick';

select cron.schedule(
  'sdr-escalation-timeout-tick',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://njizaasajkdqptlxddqn.supabase.co/functions/v1/sdr-escalation-timeout-tick',
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

- [ ] **Step 3: Self-review against sdr-backstop-tick**

Diff the new function's shape against `supabase/functions/sdr-backstop-tick/index.ts`: same `servePost` wrapper, same worker-secret verification order (before touching the body), same `ctx.log.error`/`ctx.log.warn` usage for non-fatal per-row failures (never throw mid-loop — one bad row must not stop the rest), same `json({...}, 200)` early-return shape when there's nothing to do.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/sdr-escalation-timeout-tick/index.ts supabase/migrations/20260717130000_sdr_escalation_timeout_cron_trigger.sql
git commit -m "feat(sdr): sdr-escalation-timeout-tick edge function + cron trigger (Parte D)"
```

---

## Task 3: Frontend data layer — pilot settings thresholds + atomic claim on the provider contract

**Files:**
- Modify: `src/shared/types/sdr-pilot.ts`
- Modify: `src/providers/data/contracts/sdrPilotSettings.ts`
- Modify: `src/mocks/api/sdrPilotSettings.ts`
- Modify: `src/providers/data/impl/mock/sdrPilotSettings.ts`
- Modify: `src/providers/data/impl/supabase/sdrPilotSettings.ts`
- Modify: `src/providers/data/contracts/sdrEscalations.ts`
- Modify: `src/mocks/api/sdrEscalations.ts`
- Modify: `src/mocks/api/utils/errors.ts`
- Modify: `src/mocks/api/utils/index.ts`
- Modify: `src/mocks/api/index.ts`
- Modify: `src/providers/data/impl/mock/sdrEscalations.ts`
- Modify: `src/providers/data/impl/supabase/sdrEscalations.ts`
- Modify: `src/providers/notifications/events.ts`
- Test: `src/mocks/api/sdrEscalations.test.ts`

**Interfaces:**
- Consumes: Task 1's `claim_sdr_escalation` RPC (supabase impl only).
- Produces (consumed by Task 4 and Task 5): `ISdrPilotSettings.escalationTimeoutUrgentMinutes: number`, `.escalationTimeoutNormalMinutes: number`; `ISdrPilotSettingsProvider.update()`'s patch type gains the same two optional fields; `ISdrEscalationsProvider.claim(id: ID, sellerId: ID): Promise<ISdrEscalation>`; `MockConflictError` (new, in `src/mocks/api/utils/errors.ts`); `NotificationEventType` gains `"sdr.escalonouSemResposta"`.

- [ ] **Step 1: Write the failing test for the mock claim's conflict guard**

Create `src/mocks/api/sdrEscalations.test.ts`. `resetMockStorePerFile()` resets once per file via `beforeAll` — **not** per test (see its docstring in `src/mocks/test-setup.ts`) — so each test creates its own escalation under a unique id rather than relying on a per-test reset, matching the established convention in `src/providers/data/impl/mock/whatsappAccounts.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { sdrEscalationsApi } from "./sdrEscalations";
import { resetMockStorePerFile } from "@/mocks/test-setup";
import { MockConflictError, MockNotFoundError } from "./utils";
import type { ISdrEscalation } from "@/shared/types";

resetMockStorePerFile();

function makeEscalation(id: string): ISdrEscalation {
  return {
    id,
    sessionId: `session-${id}`,
    conversationId: `conv-${id}`,
    storeId: "00000000-0000-0000-0000-000000000001",
    reason: "sdr_failed",
    mode: "urgent",
    contextSummary: {
      customerPhone: "+5511999999999",
      isB2B: false,
      conversationLength: 3,
      timeInSdr: 60,
      collectedData: {},
      sdrTrace: [],
    },
    status: "pending",
    createdAt: "2026-07-17T10:00:00.000Z",
  };
}

describe("sdrEscalationsApi.claim", () => {
  it("assigns the seller and marks the escalation claimed", async () => {
    await sdrEscalationsApi.create(makeEscalation("esc-claim-1"));
    const updated = await sdrEscalationsApi.claim("esc-claim-1", "seller-A");
    expect(updated.assignedSellerId).toBe("seller-A");
    expect(updated.status).toBe("assigned");
    expect(updated.urgentBroadcastClaimedBySellerId).toBe("seller-A");
    expect(updated.urgentBroadcastClaimedAt).toBeTruthy();
    expect(updated.firstHumanResponseAt).toBeUndefined();
  });

  it("throws MockConflictError when already claimed", async () => {
    await sdrEscalationsApi.create(makeEscalation("esc-claim-2"));
    await sdrEscalationsApi.claim("esc-claim-2", "seller-A");
    await expect(sdrEscalationsApi.claim("esc-claim-2", "seller-B")).rejects.toBeInstanceOf(
      MockConflictError,
    );
  });

  it("throws MockNotFoundError for an unknown id", async () => {
    await expect(sdrEscalationsApi.claim("does-not-exist", "seller-A")).rejects.toBeInstanceOf(
      MockNotFoundError,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test src/mocks/api/sdrEscalations.test.ts`
Expected: FAIL — `sdrEscalationsApi.claim is not a function` (and `MockConflictError` does not exist yet).

- [ ] **Step 3: Add `MockConflictError`**

In `src/mocks/api/utils/errors.ts`, add after `MockValidationError`:

```typescript
/** Optimistic-concurrency conflict — another actor already claimed/changed this resource. */
export class MockConflictError extends MockError {
  readonly code = "MOCK_CONFLICT";
  constructor(message: string) {
    super(message);
  }
}
```

- [ ] **Step 4: Export it from the barrel**

In `src/mocks/api/utils/index.ts`, add `MockConflictError` to the existing `errors` export:

```typescript
export {
  MockError,
  MockNotFoundError,
  MockValidationError,
  MockNetworkError,
  MockUnauthorizedError,
  MockConflictError,
} from "./errors";
export { simulateLatency } from "./simulateLatency";
export { simulateError } from "./simulateError";
export { logApiCall, logApiError } from "./logger";
export { runApi } from "./runApi";
export {
  paginate,
  resolvePagination,
  type IPaginatedResult,
  type IPaginationParams,
} from "./paginate";
```

`src/mocks/api/index.ts` re-exports the same names individually (not a blanket `export *`) — add `MockConflictError` there too, at line 62-70:

```typescript
export {
  MockError,
  MockNotFoundError,
  MockValidationError,
  MockNetworkError,
  MockUnauthorizedError,
  MockConflictError,
  type IPaginatedResult,
  type IPaginationParams,
} from "./utils";
```

- [ ] **Step 5: Implement `sdrEscalationsApi.claim`**

In `src/mocks/api/sdrEscalations.ts`, add the import and the new method:

```typescript
import type { ID, ISdrEscalation } from "@/shared/types";
import {
  selectAllSdrEscalations,
  selectSdrEscalationById,
  selectSdrEscalationByConversation,
} from "../store/selectors";
import { patchById, upsert } from "../store/mutations";
import { MockConflictError, MockNotFoundError, runApi } from "./utils";
import type { IListSdrEscalationsParams } from "@/providers/data";

export const sdrEscalationsApi = {
  list(params: IListSdrEscalationsParams = {}): Promise<ISdrEscalation[]> {
    return runApi(
      "sdrEscalationsApi",
      "list",
      () => {
        let all = selectAllSdrEscalations();
        if (params.storeId) all = all.filter((e) => e.storeId === params.storeId);
        if (params.conversationId)
          all = all.filter((e) => e.conversationId === params.conversationId);
        if (params.sessionId) all = all.filter((e) => e.sessionId === params.sessionId);
        if (params.customerId) all = all.filter((e) => e.customerId === params.customerId);
        if (params.status) all = all.filter((e) => e.status === params.status);
        if (params.mode) all = all.filter((e) => e.mode === params.mode);
        if (params.reason) all = all.filter((e) => e.reason === params.reason);
        if (params.assignedSellerId)
          all = all.filter((e) => e.assignedSellerId === params.assignedSellerId);
        if (params.fromDate) all = all.filter((e) => e.createdAt >= params.fromDate!);
        if (params.toDate) all = all.filter((e) => e.createdAt <= params.toDate!);
        return [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      },
      { payload: params },
    );
  },

  getById(id: ID): Promise<ISdrEscalation | null> {
    return runApi("sdrEscalationsApi", "getById", () => selectSdrEscalationById(id));
  },

  getByConversation(conversationId: ID): Promise<ISdrEscalation | null> {
    return runApi("sdrEscalationsApi", "getByConversation", () =>
      selectSdrEscalationByConversation(conversationId),
    );
  },

  create(escalation: ISdrEscalation): Promise<ISdrEscalation> {
    return runApi("sdrEscalationsApi", "create", () => upsert("sdrEscalations", escalation));
  },

  patch(id: ID, patch: Partial<ISdrEscalation>): Promise<ISdrEscalation> {
    return runApi("sdrEscalationsApi", "patch", () => {
      const updated = patchById("sdrEscalations", id, patch);
      if (!updated) throw new MockNotFoundError("sdrEscalation", id);
      return updated;
    });
  },

  /** Atomic (single-threaded JS, so trivially so) claim — mirrors the real
   *  claim_sdr_escalation RPC's guard: already-claimed or wrong status throws. */
  claim(id: ID, sellerId: ID): Promise<ISdrEscalation> {
    return runApi("sdrEscalationsApi", "claim", () => {
      const current = selectSdrEscalationById(id);
      if (!current) throw new MockNotFoundError("sdrEscalation", id);
      if (current.urgentBroadcastClaimedBySellerId || !["pending", "assigned"].includes(current.status)) {
        throw new MockConflictError(`sdrEscalation already claimed: ${id}`);
      }
      const now = new Date().toISOString();
      const updated = patchById("sdrEscalations", id, {
        assignedSellerId: sellerId,
        assignedAt: now,
        firstHumanResponseAt: undefined,
        status: "assigned",
        urgentBroadcastClaimedBySellerId: sellerId,
        urgentBroadcastClaimedAt: now,
      });
      if (!updated) throw new MockNotFoundError("sdrEscalation", id);
      return updated;
    });
  },
};
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `bun run test src/mocks/api/sdrEscalations.test.ts`
Expected: PASS (3/3).

- [ ] **Step 7: Extend the provider contract**

In `src/providers/data/contracts/sdrEscalations.ts`, add the method to the interface:

```typescript
export interface ISdrEscalationsProvider {
  list(params?: IListSdrEscalationsParams): Promise<ISdrEscalation[]>;
  getById(id: ID): Promise<ISdrEscalation | null>;
  getByConversation(conversationId: ID): Promise<ISdrEscalation | null>;
  create(escalation: ISdrEscalation): Promise<ISdrEscalation>;
  patch(id: ID, patch: Partial<ISdrEscalation>): Promise<ISdrEscalation>;
  /** Atomically claims a broadcasting escalation for `sellerId`. Throws if
   *  already claimed or if the escalation isn't in a claimable status. */
  claim(id: ID, sellerId: ID): Promise<ISdrEscalation>;
}
```

- [ ] **Step 8: Wire the mock provider**

In `src/providers/data/impl/mock/sdrEscalations.ts`:

```typescript
import { sdrEscalationsApi } from "@/mocks";
import type { ISdrEscalationsProvider } from "../../contracts/sdrEscalations";

export const mockSdrEscalationsProvider: ISdrEscalationsProvider = {
  list: (params) => sdrEscalationsApi.list(params),
  getById: (id) => sdrEscalationsApi.getById(id),
  getByConversation: (conversationId) => sdrEscalationsApi.getByConversation(conversationId),
  create: (escalation) => sdrEscalationsApi.create(escalation),
  patch: (id, patch) => sdrEscalationsApi.patch(id, patch),
  claim: (id, sellerId) => sdrEscalationsApi.claim(id, sellerId),
};
```

- [ ] **Step 9: Wire the supabase provider**

In `src/providers/data/impl/supabase/sdrEscalations.ts`, add the method to `supabaseSdrEscalationsProvider` (after `patch`, before the closing `};`):

```typescript
  async claim(id: ID, sellerId: ID): Promise<ISdrEscalation> {
    // sellerId is accepted for interface symmetry with the mock provider but
    // NOT sent to the RPC — claim_sdr_escalation resolves the caller's seller
    // id server-side from the JWT (current_seller_id()), which is the actual
    // authorization boundary. A client-supplied seller id here would be
    // meaningless to trust.
    void sellerId;
    const { data, error } = await getSupabaseClient().rpc("claim_sdr_escalation", {
      p_escalation_id: id,
    });
    if (error) throw new Error(`[supabase] sdrEscalations.claim(${id}) failed: ${error.message}`);
    return rowToSdrEscalation(data as unknown as SdrEscalationRow);
  },
```

`patch` already ends with a trailing comma (`},`) before the closing `};` of the `supabaseSdrEscalationsProvider` object literal — insert the new method between that comma and `};`, no punctuation fix needed.

- [ ] **Step 10: Extend `ISdrPilotSettings`**

In `src/shared/types/sdr-pilot.ts`:

```typescript
import type { ID, ISO8601 } from "./common";

/**
 * Operational, per-store settings for the real-production SDR pilot
 * (docs/superpowers/specs/2026-07-15-sdr-producao-parte-b-ativacao-design.md,
 * docs/superpowers/specs/2026-07-16-sdr-escalonamento-timeout-broadcast-design.md).
 * Model/provider/system-prompt for the "sdr" AI feature live in
 * `IAiSettings.routing` instead (aba Funcionalidades) — this type only
 * carries what's genuinely per-store and operational: the pilot kill-switch,
 * the backstop timeout, and the escalation-broadcast thresholds.
 */
export interface ISdrPilotSettings {
  storeId: ID;
  sdrEnabled: boolean;
  backstopTimeoutMinutes: number;
  /** Minutes an 'urgent'-mode escalation waits for a seller reply before broadcasting. */
  escalationTimeoutUrgentMinutes: number;
  /** Minutes a 'normal'- or 'standard'-mode escalation waits before broadcasting. */
  escalationTimeoutNormalMinutes: number;
  updatedAt: ISO8601;
  updatedBy: ID | null;
}
```

- [ ] **Step 11: Extend the pilot-settings provider contract**

In `src/providers/data/contracts/sdrPilotSettings.ts`:

```typescript
import type { ID, ISdrPilotSettings } from "@/shared/types";

export interface ISdrPilotSettingsProvider {
  /** Returns the store's pilot settings, creating a disabled row if it does not exist. */
  get(storeId: ID): Promise<ISdrPilotSettings>;
  /** Patches the pilot kill-switch / timeouts. Audited. */
  update(
    storeId: ID,
    patch: {
      sdrEnabled?: boolean;
      backstopTimeoutMinutes?: number;
      escalationTimeoutUrgentMinutes?: number;
      escalationTimeoutNormalMinutes?: number;
    },
  ): Promise<ISdrPilotSettings>;
}
```

- [ ] **Step 12: Extend the mock API**

In `src/mocks/api/sdrPilotSettings.ts`:

```typescript
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
    escalationTimeoutUrgentMinutes: 5,
    escalationTimeoutNormalMinutes: 30,
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
    patch: {
      sdrEnabled?: boolean;
      backstopTimeoutMinutes?: number;
      escalationTimeoutUrgentMinutes?: number;
      escalationTimeoutNormalMinutes?: number;
    },
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
          ...(patch.escalationTimeoutUrgentMinutes !== undefined
            ? { escalationTimeoutUrgentMinutes: patch.escalationTimeoutUrgentMinutes }
            : {}),
          ...(patch.escalationTimeoutNormalMinutes !== undefined
            ? { escalationTimeoutNormalMinutes: patch.escalationTimeoutNormalMinutes }
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

- [ ] **Step 13: Extend the mock provider**

In `src/providers/data/impl/mock/sdrPilotSettings.ts`:

```typescript
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
    patch: {
      sdrEnabled?: boolean;
      backstopTimeoutMinutes?: number;
      escalationTimeoutUrgentMinutes?: number;
      escalationTimeoutNormalMinutes?: number;
    },
  ) {
    const updated = await sdrPilotSettingsApi.update(storeId, patch);
    const changed =
      patch.sdrEnabled !== undefined ||
      patch.backstopTimeoutMinutes !== undefined ||
      patch.escalationTimeoutUrgentMinutes !== undefined ||
      patch.escalationTimeoutNormalMinutes !== undefined;
    if (changed) {
      auditLog({
        action: "sdr_pilot.settings.update",
        resource: "sdr_settings",
        resourceId: updated.storeId,
        storeId: updated.storeId,
        after: {
          sdrEnabled: updated.sdrEnabled,
          backstopTimeoutMinutes: updated.backstopTimeoutMinutes,
          escalationTimeoutUrgentMinutes: updated.escalationTimeoutUrgentMinutes,
          escalationTimeoutNormalMinutes: updated.escalationTimeoutNormalMinutes,
        },
      });
    }
    return updated;
  },
};
```

- [ ] **Step 14: Extend the supabase provider**

In `src/providers/data/impl/supabase/sdrPilotSettings.ts`:

```typescript
import type { ID, ISdrPilotSettings } from "@/shared/types";
import type { ISdrPilotSettingsProvider } from "../../contracts/sdrPilotSettings";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase implementation of {@link ISdrPilotSettingsProvider}. `ensureSettings`
 * lazily creates the store's row (defaults: disabled, 2min backstop, 5/30min
 * escalation timeouts) — mirrors `rotationQueues`'s `ensureQueue` pattern.
 * RLS: Owner-only read/write (sdr_settings_owner_read/write, Parte A migration).
 */

interface SettingsRow {
  store_id: string;
  sdr_enabled: boolean;
  backstop_timeout_minutes: number;
  escalation_timeout_urgent_minutes: number;
  escalation_timeout_normal_minutes: number;
  updated_at: string;
  updated_by: string | null;
}

const COLUMNS =
  "store_id, sdr_enabled, backstop_timeout_minutes, escalation_timeout_urgent_minutes, " +
  "escalation_timeout_normal_minutes, updated_at, updated_by";

function rowToSettings(r: SettingsRow): ISdrPilotSettings {
  return {
    storeId: r.store_id,
    sdrEnabled: r.sdr_enabled,
    backstopTimeoutMinutes: r.backstop_timeout_minutes,
    escalationTimeoutUrgentMinutes: r.escalation_timeout_urgent_minutes,
    escalationTimeoutNormalMinutes: r.escalation_timeout_normal_minutes,
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
    const noop =
      patch.sdrEnabled === undefined &&
      patch.backstopTimeoutMinutes === undefined &&
      patch.escalationTimeoutUrgentMinutes === undefined &&
      patch.escalationTimeoutNormalMinutes === undefined;
    if (noop) {
      // No-op patch — skip the DB write so we don't bump `updated_at` for nothing.
      return current;
    }
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.sdrEnabled !== undefined) row.sdr_enabled = patch.sdrEnabled;
    if (patch.backstopTimeoutMinutes !== undefined) {
      row.backstop_timeout_minutes = patch.backstopTimeoutMinutes;
    }
    if (patch.escalationTimeoutUrgentMinutes !== undefined) {
      row.escalation_timeout_urgent_minutes = patch.escalationTimeoutUrgentMinutes;
    }
    if (patch.escalationTimeoutNormalMinutes !== undefined) {
      row.escalation_timeout_normal_minutes = patch.escalationTimeoutNormalMinutes;
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

- [ ] **Step 15: Register the new notification event type**

In `src/providers/notifications/events.ts`, add the new literal to the `NotificationEventType` union, immediately after `"sdr.escalonou"`:

```typescript
export type NotificationEventType =
  // Atendimento (conversations / SDR)
  | "conversa.atribuida"
  | "conversa.semResposta"
  | "conversa.colaboradorAdicionado"
  | "sdr.escalonou"
  | "sdr.escalonouSemResposta"
  // Carteira (wallet transfers)
  | "carteira.transferenciaRecebida"
  | "carteira.autoRevertAgendado"
  | "carteira.autoRevertExecutado"
  // Leads
  | "lead.novo"
  | "lead.esfriando"
  | "lead.perdido"
  // Metas (goals)
  | "meta.atingidaParcial"
  | "meta.batida"
  // Gamificação
  | "badge.conquistado"
  | "ranking.mudouPosicao"
  // Comercial / Operacional
  | "cliente.dormente"
  | "vendedor.sobrecarregado"
  | "positivacao.emRisco"
  | "abc.clienteMudouClasse"
  // Vendas (orders / invoices)
  | "pedido.criado"
  | "pedido.statusMudou"
  | "pedido.confirmado"
  | "nf.emitida"
  // E-commerce
  | "ecom.pedidoRecebido"
  | "ecom.pagamentoConfirmado"
  | "ecom.pedidoEnviado"
  | "ecom.carrinhoAbandonado"
  // Portal B2B
  | "portal.orcamentoAprovado"
  | "portal.faturaDisponivel"
  | "portal.creditoProximoLimite"
  // Sistema
  | "sistema.manutencao"
  | "sistema.novoRecurso";
```

(`DERIVED_EVENTS` is unchanged — this is a one-shot rule-triggered event, not reconciler-derived, same treatment as the sibling `"conversa.colaboradorAdicionado"`.)

- [ ] **Step 16: Run the full suite and commit**

Run: `bun run test`
Expected: all tests pass, including the 3 new ones from Step 1.

```bash
git add src/shared/types/sdr-pilot.ts src/providers/data/contracts/sdrPilotSettings.ts src/mocks/api/sdrPilotSettings.ts src/providers/data/impl/mock/sdrPilotSettings.ts src/providers/data/impl/supabase/sdrPilotSettings.ts src/providers/data/contracts/sdrEscalations.ts src/mocks/api/sdrEscalations.ts src/mocks/api/utils/errors.ts src/mocks/api/utils/index.ts src/mocks/api/index.ts src/providers/data/impl/mock/sdrEscalations.ts src/providers/data/impl/supabase/sdrEscalations.ts src/providers/notifications/events.ts src/mocks/api/sdrEscalations.test.ts
git commit -m "feat(sdr): escalation timeout thresholds + atomic claim on the provider layer (Parte D)"
```

---

## Task 4: Frontend UI — real "Escalonamento" block in `/app/sdr` → Configurações

**Files:**
- Modify: `src/features/sdr-dashboard/components/tabs/SdrSettingsTab.tsx`

**Interfaces:**
- Consumes: Task 3's `ISdrPilotSettings.escalationTimeoutUrgentMinutes`/`.escalationTimeoutNormalMinutes` and the widened `ISdrPilotSettingsProvider.update()` patch type.

- [ ] **Step 1: Read the current file**

Read `src/features/sdr-dashboard/components/tabs/SdrSettingsTab.tsx` in full before editing (its exact current content is already known from this session's earlier exploration but MUST be re-read at implementation time in case Task 3 or another branch touched it).

- [ ] **Step 2: Add local state for the two new inputs**

Replace the state block:

```typescript
  const [pilot, setPilot] = useState<ISdrPilotSettings | null>(null);
  const [timeoutInput, setTimeoutInput] = useState("2");
  const [accounts, setAccounts] = useState<IWhatsAppAccount[]>([]);
  const [loading, setLoading] = useState(true);
```

with:

```typescript
  const [pilot, setPilot] = useState<ISdrPilotSettings | null>(null);
  const [timeoutInput, setTimeoutInput] = useState("2");
  const [urgentTimeoutInput, setUrgentTimeoutInput] = useState("5");
  const [normalTimeoutInput, setNormalTimeoutInput] = useState("30");
  const [accounts, setAccounts] = useState<IWhatsAppAccount[]>([]);
  const [loading, setLoading] = useState(true);
```

- [ ] **Step 3: Seed the new inputs when settings load**

In the data-fetch `useEffect`'s `.then(([settings, list, waha]) => {...})` callback, the existing line `setTimeoutInput(String(settings.backstopTimeoutMinutes));` gets two siblings:

```typescript
      .then(([settings, list, waha]) => {
        if (cancelled) return;
        const merged = new Map<string, IWhatsAppAccount>();
        for (const a of [...list, ...waha]) merged.set(a.id, a);
        setPilot(settings);
        setTimeoutInput(String(settings.backstopTimeoutMinutes));
        setUrgentTimeoutInput(String(settings.escalationTimeoutUrgentMinutes));
        setNormalTimeoutInput(String(settings.escalationTimeoutNormalMinutes));
        setAccounts([...merged.values()]);
      })
```

- [ ] **Step 4: Widen `patchPilot`'s parameter type**

```typescript
  const patchPilot = async (p: {
    sdrEnabled?: boolean;
    backstopTimeoutMinutes?: number;
    escalationTimeoutUrgentMinutes?: number;
    escalationTimeoutNormalMinutes?: number;
  }) => {
    if (!currentStoreId) return;
    try {
      const updated = await pilotProvider.update(currentStoreId, p);
      setPilot(updated);
      onPilotChanged?.(updated.sdrEnabled);
      toast.success("Alterações salvas.");
    } catch {
      toast.error("Não foi possível salvar as alterações.");
    }
  };
```

- [ ] **Step 5: Replace the "Escalonamento" placeholder block**

Replace this entire block (currently the second `opacity-60` card):

```typescript
      <div className="rounded-xl border border-border bg-card p-4 opacity-60">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Icon icon="mdi:account-arrow-right-outline" size={16} className="text-primary" />
            Escalonamento
          </h3>
          <Badge variant="secondary">Em breve</Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Timeout de resposta e broadcast urgente chegam numa entrega separada (Parte D).
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">Timeout fila urgente</span>
              <span className="text-xs text-muted-foreground tabular-nums">5 min</span>
            </div>
            <Slider value={[5]} min={1} max={30} step={1} disabled className="mt-3" />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">Timeout fila normal</span>
              <span className="text-xs text-muted-foreground tabular-nums">30 min</span>
            </div>
            <Slider value={[30]} min={5} max={60} step={5} disabled className="mt-3" />
          </div>
        </div>
      </div>
```

with a real, editable version (matching the "Piloto" block's number-input pattern exactly):

```typescript
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon icon="mdi:account-arrow-right-outline" size={16} className="text-primary" />
          Escalonamento
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Se ninguém responder a tempo, todo vendedor com acesso a esta instância é avisado e pode
          assumir a conversa.
        </p>
        <div className="mt-4 space-y-4">
          <label className="block text-xs text-muted-foreground">
            Timeout — modo urgente (minutos)
            <input
              type="number"
              min={1}
              max={60}
              value={urgentTimeoutInput}
              disabled={!canEdit}
              onChange={(e) => setUrgentTimeoutInput(e.target.value)}
              onBlur={() => {
                const parsed = Math.min(60, Math.max(1, Number(urgentTimeoutInput) || 5));
                setUrgentTimeoutInput(String(parsed));
                if (pilot && parsed !== pilot.escalationTimeoutUrgentMinutes) {
                  void patchPilot({ escalationTimeoutUrgentMinutes: parsed });
                }
              }}
              className="mt-1 w-full max-w-40 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            Timeout — modo normal (minutos)
            <input
              type="number"
              min={1}
              max={120}
              value={normalTimeoutInput}
              disabled={!canEdit}
              onChange={(e) => setNormalTimeoutInput(e.target.value)}
              onBlur={() => {
                const parsed = Math.min(120, Math.max(1, Number(normalTimeoutInput) || 30));
                setNormalTimeoutInput(String(parsed));
                if (pilot && parsed !== pilot.escalationTimeoutNormalMinutes) {
                  void patchPilot({ escalationTimeoutNormalMinutes: parsed });
                }
              }}
              className="mt-1 w-full max-w-40 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
        </div>
      </div>
```

- [ ] **Step 6: Drop the now-unused `Slider` import if nothing else in the file uses it**

Read the file after Step 5's edit — the "Orçamento automático" block above (which stays a placeholder, untouched) also renders `<Slider ... disabled />`, so the `Slider` import from `@/components/ui/slider` stays. Confirm this before touching the import line — do not remove it if `Slider` is still referenced.

- [ ] **Step 7: Build + typecheck**

Run: `bun run build`
Expected: no new build errors.

Run: `bunx tsc --noEmit`
Expected: no new errors introduced by this file (cross-check against the pre-existing baseline per `CLAUDE.md`'s tsc note — isolate by `git diff --name-status main...HEAD --diff-filter=AM -- src/features/sdr-dashboard/components/tabs/SdrSettingsTab.tsx`).

- [ ] **Step 8: Commit**

```bash
git add src/features/sdr-dashboard/components/tabs/SdrSettingsTab.tsx
git commit -m "feat(sdr): real escalation-timeout thresholds in /app/sdr Configurações (Parte D)"
```

---

## Task 5: Frontend UI — atomic claim + realtime-driven refresh in the broadcast panel

**Files:**
- Modify: `src/features/sdr-escalation/hooks/useUrgentBroadcastQueue.ts`
- Modify: `docs/dev/sdr-production-activation.md`

**Interfaces:**
- Consumes: Task 3's `ISdrEscalationsProvider.claim(id, sellerId)`; `@/shared/lib/realtime`'s `subscribeToTable`; `@/providers/data`'s `getActiveDataSource` (existing export, used the same way `useCollaboratorAddedListener.ts` uses it — confirm the export name is `getActiveDataSource` by checking `src/providers/data/index.ts`'s barrel before writing the import).

- [ ] **Step 1: Read the current file and confirm the `getActiveDataSource` export**

Read `src/features/sdr-escalation/hooks/useUrgentBroadcastQueue.ts` in full (already known from this session, but re-read at implementation time). Grep `src/providers/data/index.ts` for `getActiveDataSource` to confirm the barrel re-exports it (it is already imported that way in `useCollaboratorAddedListener.ts:5`) — use the identical import path.

- [ ] **Step 2: Broaden the broadcast filter and add the atomic claim**

Replace the whole file:

```typescript
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ID, ISdrEscalation } from "@/shared/types";
import {
  getActiveDataSource,
  recordAuditLogSync,
  useSdrEscalationsProvider,
} from "@/providers/data";
import { subscribeToTable } from "@/shared/lib/realtime";

export const ESCALATION_QUEUE_EVENT = "gallo:escalation-queue";

export interface IEscalationQueueEventDetail {
  kind: "broadcast" | "claim" | "create" | "answer" | "queue-timeout" | "abandon";
  escalationId: ID;
  payload?: Record<string, unknown>;
}

export interface IUrgentBroadcastEntry {
  escalation: ISdrEscalation;
  /** Seconds since the broadcast started. */
  age: number;
}

interface IClaimContext {
  storeId: ID;
}

const IS_SUPABASE = getActiveDataSource() === "supabase";

/**
 * Broadcast queue for escalations awaiting a human. Reads from the escalation
 * store itself (the entity of record — `urgentBroadcastAt` set +
 * `urgentBroadcastClaimedBySellerId` unset), not from `mode` — the real tick
 * (Parte D, `sdr-escalation-timeout-tick`) broadcasts 'pending'-nobody-assigned
 * escalations regardless of mode, and 'assigned'-unanswered escalations using
 * a per-mode threshold — mode only ever picked WHICH threshold applied, never
 * whether broadcasting happens. Filtering this queue to `mode==='urgent'`
 * would silently hide every normal/standard broadcast.
 *
 * In supabase mode, a Realtime subscription on `notifications` triggers an
 * immediate `refresh()` on any INSERT — RLS already scopes delivery to rows
 * the current seller (or an Owner/Gestor) can see, so no extra filtering is
 * needed here; it's a purely a "wake up and re-fetch" signal, not itself the
 * data source (the escalation list stays the source of truth).
 */
export function useUrgentBroadcastQueue() {
  const provider = useSdrEscalationsProvider();
  const [entries, setEntries] = useState<IUrgentBroadcastEntry[]>([]);

  const refresh = useCallback(async () => {
    try {
      const list = await provider.list();
      const now = Date.now();
      const broadcasting = list
        .filter(
          (e) =>
            e.status !== "answered" &&
            e.status !== "abandoned" &&
            e.urgentBroadcastAt &&
            !e.urgentBroadcastClaimedBySellerId,
        )
        .map((e) => ({
          escalation: e,
          age: Math.max(0, Math.floor((now - new Date(e.urgentBroadcastAt!).getTime()) / 1000)),
        }));
      setEntries(broadcasting);
    } catch {
      // Provider errors are non-fatal for the queue.
    }
  }, [provider]);

  useEffect(() => {
    void refresh();
    if (typeof window === "undefined") return;
    let debounceTimer: number | null = null;
    const handler = () => {
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null;
        void refresh();
      }, 500);
    };
    window.addEventListener(ESCALATION_QUEUE_EVENT, handler);
    // Light interval so the `age` field on visible entries advances even when
    // no event fires. 15s is plenty for a counter rendered next to a button.
    const interval = window.setInterval(() => {
      void refresh();
    }, 15_000);
    return () => {
      window.removeEventListener(ESCALATION_QUEUE_EVENT, handler);
      window.clearInterval(interval);
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
    };
  }, [refresh]);

  // Realtime nudge (supabase mode only — mock has no Supabase client and
  // subscribeToTable would throw synchronously, same guard every other
  // subscribeToTable consumer in this codebase uses).
  useEffect(() => {
    if (!IS_SUPABASE) return;
    return subscribeToTable("notifications", (payload) => {
      if (payload.eventType !== "INSERT") return;
      const row = payload.new as { type?: string };
      if (row.type !== "sdr.escalonouSemResposta") return;
      void refresh();
    });
  }, [refresh]);

  const claim = useCallback(
    async (escalationId: ID, sellerId: ID, context: IClaimContext) => {
      const updated = await provider.claim(escalationId, sellerId);
      recordAuditLogSync({
        storeId: context.storeId,
        actorId: sellerId,
        action: "sdr_escalate_broadcast_claim",
        resource: "conversation",
        resourceId: updated.conversationId,
        after: { escalationId, sellerId },
      });
      dispatchEscalationEvent({ kind: "claim", escalationId, payload: { sellerId } });
      return updated;
    },
    [provider],
  );

  return useMemo(
    () => ({
      entries,
      refresh,
      claim,
    }),
    [entries, refresh, claim],
  );
}

/** Module-level helper — dispatches the event consumed by every hook above. */
export function dispatchEscalationEvent(detail: IEscalationQueueEventDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ESCALATION_QUEUE_EVENT, { detail }));
}
```

Note the two behavioral changes from the original, both intentional and both required for this task's goal:
1. `provider.list({ mode: "urgent" })` → `provider.list()` (no mode filter) — see the docstring above.
2. `provider.patch(escalationId, {...})` → `provider.claim(escalationId, sellerId)` — the actual race fix; `useUrgentBroadcastQueue`'s `claim()` no longer builds the patch object by hand, since `claim_sdr_escalation` (supabase) / `sdrEscalationsApi.claim` (mock) now own that field set atomically.

`UrgentBroadcastClaim.tsx` is NOT modified — its call site (`queue.claim(escalation.id, currentUser.sellerId, { storeId: escalation.storeId })`) and its `catch { toast.error("Outro vendedor já assumiu esta conversa.") }` already match the new `claim()`'s signature and error behavior exactly (both mock's `MockConflictError` and supabase's RPC-thrown `escalation_already_claimed` are caught by that same generic `catch`).

- [ ] **Step 3: Build + typecheck**

Run: `bun run build`
Expected: no new build errors.

Run: `bunx tsc --noEmit`
Expected: no new errors on this file (cross-check by file path per `CLAUDE.md`'s baseline note).

- [ ] **Step 4: Update the rollout doc**

Read `docs/dev/sdr-production-activation.md` in full, then add a short new section (placed after the existing "Onde fica cada peça de configuração" section Parte C added) documenting Parte D:

```markdown
## Escalonamento (Parte D)

Se um handoff SDR→humano fica sem resposta, ou se `chooseHumanSeller` não encontrou ninguém
disponível, o tick `sdr-escalation-timeout-tick` (pg_cron, a cada 1 minuto) dispara um broadcast
in-app para todo vendedor com acesso à instância WhatsApp da conversa. Os limiares (minutos até
o broadcast, por modo urgente/normal) ficam em `/app/sdr` → Configurações → bloco
"Escalonamento" — mesma tela e mesma tabela `sdr_settings` do piloto (Parte B/C).

O primeiro vendedor a clicar "Atender agora" no painel flutuante assume a conversa via RPC
atômica (`claim_sdr_escalation`) — sem essa RPC, dois cliques simultâneos colidiam sem detecção
(era um `.patch()` direto do navegador).

**Limitação conhecida, aceita por decisão do dono (2026-07-17):** os hooks client-side legados do
PRD-023 (`useUrgentBroadcastTimer`, `useEscalationQueueTimeoutMonitor`) continuam ativos e
independentes deste tick — rodam com limiares diferentes (`IPlatformSettings.escalation*`, não
`sdr_settings`) sempre que um Owner/Gestor tem o app aberto. Não foram desligados nem retirados
nesta entrega.
```

- [ ] **Step 5: Commit**

```bash
git add src/features/sdr-escalation/hooks/useUrgentBroadcastQueue.ts docs/dev/sdr-production-activation.md
git commit -m "feat(sdr): atomic claim + realtime-driven broadcast queue refresh (Parte D)"
```

---

## Manual smoke plan (post-merge, gated on the human partner's explicit go-ahead — do not execute as part of implementing this plan)

1. Apply `20260717120000_sdr_escalation_timeout_schema.sql`.
2. Deploy `sdr-escalation-timeout-tick`.
3. Apply `20260717130000_sdr_escalation_timeout_cron_trigger.sql` (must be last — the cron job's first tick needs a live endpoint).
4. In a pilot store with at least one SDR-enabled instance (Parte C), manually insert (or wait for) an `sdr_escalations` row with `status='pending'` and confirm within ~1 minute: `urgent_broadcast_at` gets set, a `notifications` row lands for every eligible seller, and `conversations.is_sdr_active` flips to `false`.
5. Manually insert an `sdr_escalations` row with `status='assigned'`, `assigned_at` older than the store's `escalation_timeout_urgent_minutes`, and confirm the same broadcast fires, excluding the assigned seller from the notification recipients.
6. Have two different seller sessions click "Atender agora" on the same broadcasting escalation within the same second — confirm exactly one succeeds and the other sees "Outro vendedor já assumiu esta conversa."
7. Send a seller message on an `assigned` escalation's conversation before the timeout — confirm `status` flips to `'answered'` and no broadcast fires for it.
