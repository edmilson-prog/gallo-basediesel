# Nova conversa com número inédito + validação de WhatsApp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir iniciar uma conversa de WhatsApp para um número não cadastrado — criando um contato mínimo na hora (nome opcional) e validando antes se o número tem conta de WhatsApp (Evolution).

**Architecture:** Engine puro de telefone (TDD) normaliza o input BR; o `customers.list` do Supabase ganha o `search` que falta; uma nova Edge Function `whatsapp-check-number` (clone do `whatsapp-avatar-sync`) consulta a Evolution (`/chat/whatsappNumbers`) server-side; o modal `NewConversationDialog` ganha um card "número novo" → mini-form → orquestração (normaliza → valida WhatsApp → dedupe cliente/conversa → cria → abre). Meta não pré-valida (Cloud API não oferece) e degrada para o fluxo reativo `131026` existente.

**Tech Stack:** React 19, TypeScript strict, TanStack Query, Vitest, Supabase (Edge Functions Deno, Postgres), camada WhatsApp runtime-agnostic.

**Spec:** [docs/superpowers/specs/2026-06-16-nova-conversa-numero-inedito-design.md](../specs/2026-06-16-nova-conversa-numero-inedito-design.md)

## Global Constraints

- **TypeScript strict**; evitar `any`; interfaces de domínio prefixadas com `I`.
- **Código em inglês**; **UI/conteúdo em português do Brasil com acentos corretos** (UTF-8).
- **Commits**: Conventional Commits em inglês, atômicos.
- **Provider Pattern**: features acessam dados só via `@/providers/data` (nunca `@/mocks`/impl direto).
- **Mock-aware**: todo caminho que depende de Edge Function deve degradar em mock (a checagem resolve `skipped`).
- **Camada WhatsApp**: mudou `src/providers/whatsapp/` ⇒ rodar `bun run scripts/sync-whatsapp-shared.ts` (espelha em `supabase/functions/_shared/whatsapp/`) e **redeployar** as edges afetadas.
- **Deploy de edge** (CLI autenticada): `npx supabase functions deploy <fn> --project-ref njizaasajkdqptlxddqn`.
- **Gate de CI prático**: `bun run build` + `bun run test` verdes (⚠️ `bun run build` NÃO checa tipos; avaliar código novo por delta).
- **`customers.cpf` não tem unique constraint** (verificado no banco) → criar contato com `cpf: ""` é seguro, não colide.
- **`whatsapp_status`** só é promovido a `valid`; **nunca** rebaixado para `invalid` neste fluxo (RF-052 do PRD-118 — o gate de envio reativo cuida do `invalid`).

---

### Task 1: Engine puro de telefone BR

**Files:**
- Create: `src/features/conversations/engine/phoneBR.ts`
- Test: `src/features/conversations/engine/phoneBR.test.ts`

**Interfaces:**
- Produces:
  - `digitsOf(input: string): string`
  - `looksLikePhone(input: string): boolean`
  - `type NormalizeResult = { ok: true; digits: string } | { ok: false; reason: "too_short" | "too_long" }`
  - `normalizeBrPhone(input: string): NormalizeResult` — saída em dígitos `55DDD…` (12–13)
  - `samePhone(a: string, b: string): boolean` — compara DDD+número ignorando o DDI `55`
  - `formatBrPhoneDisplay(digits: string): string` — `(55) DD NNNNN-NNNN`

- [ ] **Step 1: Write the failing test**

Create `src/features/conversations/engine/phoneBR.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  digitsOf,
  formatBrPhoneDisplay,
  looksLikePhone,
  normalizeBrPhone,
  samePhone,
} from "./phoneBR";

describe("normalizeBrPhone", () => {
  it("prefixes 55 to an 11-digit DDD+mobile", () => {
    expect(normalizeBrPhone("(54) 99999-8888")).toEqual({ ok: true, digits: "5554999998888" });
  });
  it("prefixes 55 to a 10-digit DDD+landline", () => {
    expect(normalizeBrPhone("54 3333-8888")).toEqual({ ok: true, digits: "555433338888" });
  });
  it("keeps a number that already has the 55 DDI (13 digits)", () => {
    expect(normalizeBrPhone("5554999998888")).toEqual({ ok: true, digits: "5554999998888" });
  });
  it("keeps a number that already has the 55 DDI (12 digits)", () => {
    expect(normalizeBrPhone("555433338888")).toEqual({ ok: true, digits: "555433338888" });
  });
  it("treats DDD 55 (RS) without DDI correctly", () => {
    expect(normalizeBrPhone("55 99988-7766")).toEqual({ ok: true, digits: "555599988776" });
  });
  it("rejects too-short input", () => {
    expect(normalizeBrPhone("99988")).toEqual({ ok: false, reason: "too_short" });
  });
  it("rejects too-long input", () => {
    expect(normalizeBrPhone("5554999998888123")).toEqual({ ok: false, reason: "too_long" });
  });
});

describe("samePhone", () => {
  it("matches with and without the 55 DDI", () => {
    expect(samePhone("5554999998888", "54999998888")).toBe(true);
  });
  it("matches two bare DDD+number forms", () => {
    expect(samePhone("11988887777", "11988887777")).toBe(true);
  });
  it("does not match different numbers", () => {
    expect(samePhone("5554999998888", "5511988887777")).toBe(false);
  });
  it("is false for empty", () => {
    expect(samePhone("", "5554999998888")).toBe(false);
  });
});

describe("looksLikePhone", () => {
  it("is true for >=10 digits", () => {
    expect(looksLikePhone("5499998888")).toBe(true);
  });
  it("is false for names", () => {
    expect(looksLikePhone("João Silva")).toBe(false);
  });
});

describe("formatBrPhoneDisplay", () => {
  it("formats a 13-digit mobile", () => {
    expect(formatBrPhoneDisplay("5554999998888")).toBe("(55) 54 99999-8888");
  });
  it("formats a 12-digit landline", () => {
    expect(formatBrPhoneDisplay("555433338888")).toBe("(55) 54 3333-8888");
  });
});

describe("digitsOf", () => {
  it("strips non-digits", () => {
    expect(digitsOf("(54) 99999-8888")).toBe("54999998888");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/features/conversations/engine/phoneBR.test.ts`
Expected: FAIL — `Cannot find module './phoneBR'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/conversations/engine/phoneBR.ts`:

```ts
/**
 * Brazilian phone helpers for the "Nova conversa" outbound flow.
 *
 * The canonical wire format used across the project (webhook `createPendingCustomer`,
 * Evolution send) is digits-only with the `55` DDI: `55DDDNNNNNNNN` (12 or 13).
 * Storing customers in this shape is what makes the inbound webhook match on the
 * exact digits and the outbound send dial the right country. This module only
 * guarantees the DDI + length; it NEVER inserts/removes the 9th digit — the
 * WhatsApp network (Evolution `jid`) is the source of truth for that.
 */

const NON_DIGITS = /\D/g;

export function digitsOf(input: string): string {
  return input.replace(NON_DIGITS, "");
}

/** Heuristic for the "número novo" card: the typed text looks like a phone. */
export function looksLikePhone(input: string): boolean {
  return digitsOf(input).length >= 10;
}

export type NormalizeResult =
  | { ok: true; digits: string }
  | { ok: false; reason: "too_short" | "too_long" };

/** Normalizes free user input to canonical `55DDDNNNNNNNN` digits. */
export function normalizeBrPhone(input: string): NormalizeResult {
  const d = digitsOf(input);
  // Already carries the DDI: 55 + DDD(2) + local(8|9) = 12 or 13 digits.
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    return { ok: true, digits: d };
  }
  // DDD + local, no DDI: 10 (landline) or 11 (mobile) digits → prefix 55.
  if (d.length === 10 || d.length === 11) {
    return { ok: true, digits: `55${d}` };
  }
  return { ok: false, reason: d.length < 10 ? "too_short" : "too_long" };
}

/** Strips the optional leading 55 DDI to compare DDD+number. */
function localPart(phone: string): string {
  const d = digitsOf(phone);
  return d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;
}

/** Two phones are the same when their DDD+number match, DDI optional. */
export function samePhone(a: string, b: string): boolean {
  const la = localPart(a);
  return la.length > 0 && la === localPart(b);
}

/** `55DDDNNNNNNNN` → `(55) DD NNNNN-NNNN` (hyphen before the last 4). */
export function formatBrPhoneDisplay(digits: string): string {
  const d = digitsOf(digits);
  if (!d.startsWith("55") || d.length < 12) return digits;
  const ddi = d.slice(0, 2);
  const ddd = d.slice(2, 4);
  const local = d.slice(4);
  if (local.length < 5) return `(${ddi}) ${ddd} ${local}`.trimEnd();
  const hyphenAt = local.length - 4;
  return `(${ddi}) ${ddd} ${local.slice(0, hyphenAt)}-${local.slice(hyphenAt)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/features/conversations/engine/phoneBR.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/engine/phoneBR.ts src/features/conversations/engine/phoneBR.test.ts
git commit -m "feat(conversations): pure BR phone engine for new-number flow"
```

---

### Task 2: Implementar `search` no `customers.list` (Supabase)

**Files:**
- Modify: `src/providers/data/impl/supabase/customers.ts` (add helper + wire into `list`, ~line 262)
- Test: `src/providers/data/impl/supabase/customers.search.test.ts`

**Interfaces:**
- Produces: `buildCustomerSearchOr(search: string): string | null` — expressão PostgREST `.or()` (ou `null` quando vazio).

**Context:** o `IListCustomersParams.search` é honrado pelo mock (`src/mocks/api/customers.ts:189`) mas ignorado pelo Supabase. Sem isso, a busca do modal nunca retorna vazio e o card "número novo" nunca aparece.

- [ ] **Step 1: Write the failing test**

Create `src/providers/data/impl/supabase/customers.search.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildCustomerSearchOr } from "./customers";

describe("buildCustomerSearchOr", () => {
  it("returns null for blank input", () => {
    expect(buildCustomerSearchOr("   ")).toBeNull();
  });
  it("builds an ilike OR across name, contact, email, phone and documents", () => {
    expect(buildCustomerSearchOr("Joao")).toBe(
      "full_name.ilike.*Joao*,razao_social.ilike.*Joao*,nome_fantasia.ilike.*Joao*," +
        "contact_name.ilike.*Joao*,email.ilike.*Joao*,phone.ilike.*Joao*," +
        "cnpj.ilike.*Joao*,cpf.ilike.*Joao*",
    );
  });
  it("neutralizes PostgREST or() delimiters in the term", () => {
    expect(buildCustomerSearchOr("a,b(c)")).toContain("full_name.ilike.*a b c *");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/providers/data/impl/supabase/customers.search.test.ts`
Expected: FAIL — `buildCustomerSearchOr is not exported`.

- [ ] **Step 3: Write the helper**

In `src/providers/data/impl/supabase/customers.ts`, add after the `createInputToRow` function (before `export const supabaseCustomersProvider`):

```ts
/** Columns the free-text customer search scans (paridade com o mock haystack). */
const SEARCH_COLUMNS = [
  "full_name",
  "razao_social",
  "nome_fantasia",
  "contact_name",
  "email",
  "phone",
  "cnpj",
  "cpf",
] as const;

/**
 * Builds the PostgREST `.or()` expression for a free-text customer search, or
 * `null` when the term is blank. `,` `(` `)` are PostgREST or()-delimiters and
 * are neutralized to spaces. `*` is the ilike wildcard in the string filter form.
 */
export function buildCustomerSearchOr(search: string): string | null {
  const term = search.trim();
  if (!term) return null;
  const safe = term.replace(/[,()]/g, " ");
  return SEARCH_COLUMNS.map((c) => `${c}.ilike.*${safe}*`).join(",");
}
```

- [ ] **Step 4: Wire it into `list`**

In the same file, inside `list`, after the `hasB2BPortal` filter block and before the pagination (`const page = …`), add:

```ts
    const searchOr = params.search ? buildCustomerSearchOr(params.search) : null;
    if (searchOr) query = query.or(searchOr);
```

- [ ] **Step 5: Run the helper test + build**

Run: `bun run test -- src/providers/data/impl/supabase/customers.search.test.ts`
Expected: PASS.

Run: `bun run build`
Expected: build succeeds (no new errors).

- [ ] **Step 6: Commit**

```bash
git add src/providers/data/impl/supabase/customers.ts src/providers/data/impl/supabase/customers.search.test.ts
git commit -m "fix(customers): honor search filter in the Supabase list provider"
```

---

### Task 3: Checagem de número na camada Evolution + sync

**Files:**
- Modify: `src/providers/whatsapp/evolution/instance.ts` (add interface + parser + function at end)
- Test: `src/providers/whatsapp/evolution/instance.test.ts`
- Sync: runs `scripts/sync-whatsapp-shared.ts` → mirrors to `supabase/functions/_shared/whatsapp/evolution/instance.ts`

**Interfaces:**
- Produces:
  - `interface IWhatsAppNumberCheck { input: string; exists: boolean; e164?: string }`
  - `parseWhatsAppNumbers(body: unknown): IWhatsAppNumberCheck[]`
  - `checkWhatsAppNumbers(apiKey, deps, target, numbers: string[], traceId?): Promise<IWhatsAppNumberCheck[]>`
- Consumes: `evolutionRequest` (from `./client`), `jidToPhone` (private, same file), `IEngineDeps`, `IEvolutionInstanceTarget`.

- [ ] **Step 1: Write the failing test**

Create `src/providers/whatsapp/evolution/instance.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseWhatsAppNumbers } from "./instance";

describe("parseWhatsAppNumbers", () => {
  it("maps a flat array of OnWhatsAppDto, reading the jid as canonical", () => {
    const body = [
      { jid: "5554999998888@s.whatsapp.net", exists: true, number: "5554999998888" },
      { jid: "5511000000000@s.whatsapp.net", exists: false, number: "5511000000000" },
    ];
    expect(parseWhatsAppNumbers(body)).toEqual([
      { input: "5554999998888", exists: true, e164: "+5554999998888" },
      { input: "5511000000000", exists: false, e164: undefined },
    ]);
  });
  it("unwraps the nested { onWhatsapp: [...] } shape", () => {
    const body = { onWhatsapp: [{ jid: "5599@s.whatsapp.net", exists: true, number: "5599" }] };
    expect(parseWhatsAppNumbers(body)[0].exists).toBe(true);
  });
  it("treats a missing `exists` as false", () => {
    expect(parseWhatsAppNumbers([{ number: "5599" }])).toEqual([
      { input: "5599", exists: false, e164: undefined },
    ]);
  });
  it("returns [] for an unrecognised shape", () => {
    expect(parseWhatsAppNumbers({ unexpected: true })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/providers/whatsapp/evolution/instance.test.ts`
Expected: FAIL — `parseWhatsAppNumbers` not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/providers/whatsapp/evolution/instance.ts`:

```ts
// ===== Number check (does this number have a WhatsApp account?) =============

export interface IWhatsAppNumberCheck {
  /** Wire-format number queried (E.164 without the leading +). */
  input: string;
  /** Whether the number has a WhatsApp account. */
  exists: boolean;
  /** Canonical E.164 the WhatsApp network reports (from the jid), when exists. */
  e164?: string;
}

/**
 * Parses POST /chat/whatsappNumbers defensively. Builds return either a flat
 * array of OnWhatsAppDto ({ jid, exists, number }) or a nested { onWhatsapp:[…] }.
 * When `exists`, the canonical number is read from the `jid` (it carries the
 * WhatsApp-corrected 9th digit — the input may differ).
 */
export function parseWhatsAppNumbers(body: unknown): IWhatsAppNumberCheck[] {
  const list = Array.isArray(body)
    ? body
    : Array.isArray((body as { onWhatsapp?: unknown[] })?.onWhatsapp)
      ? (body as { onWhatsapp: unknown[] }).onWhatsapp
      : [];
  const out: IWhatsAppNumberCheck[] = [];
  for (const raw of list) {
    const c = raw as { jid?: string; exists?: boolean; number?: string } | null;
    const exists = c?.exists === true;
    out.push({
      input: typeof c?.number === "string" ? c.number : "",
      exists,
      e164: exists ? jidToPhone(c?.jid) : undefined,
    });
  }
  return out;
}

/**
 * POST /chat/whatsappNumbers — asks the instance which of `numbers` (wire format)
 * have a WhatsApp account. ON-DEMAND ONLY: bulk scanning risks an account ban
 * (Evolution issue #2228). Errors propagate (caller decides whether to skip).
 */
export async function checkWhatsAppNumbers(
  apiKey: string,
  deps: IEngineDeps,
  target: IEvolutionInstanceTarget,
  numbers: string[],
  traceId?: string,
): Promise<IWhatsAppNumberCheck[]> {
  const response = await evolutionRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: `/chat/whatsappNumbers/${target.instanceName}`,
    json: { numbers },
    timeoutMs: 15_000,
    traceId,
  });
  return parseWhatsAppNumbers(response.body);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/providers/whatsapp/evolution/instance.test.ts`
Expected: PASS.

- [ ] **Step 5: Mirror to the Edge-Function shared copy**

Run: `bun run scripts/sync-whatsapp-shared.ts`
Expected: output reports `supabase/functions/_shared/whatsapp/evolution/instance.ts` updated. Verify the new functions exist there:

Run: `git diff --stat supabase/functions/_shared/whatsapp/evolution/instance.ts`
Expected: the shared mirror shows additions (the `.test.ts` is NOT mirrored).

- [ ] **Step 6: Commit**

```bash
git add src/providers/whatsapp/evolution/instance.ts src/providers/whatsapp/evolution/instance.test.ts supabase/functions/_shared/whatsapp/evolution/instance.ts
git commit -m "feat(whatsapp): Evolution number-existence check (checkWhatsAppNumbers)"
```

---

### Task 4: Edge Function `whatsapp-check-number`

**Files:**
- Create: `supabase/functions/whatsapp-check-number/index.ts`

**Interfaces:**
- Consumes: `checkWhatsAppNumbers`, `IEvolutionInstanceTarget` (Task 3 mirror), `requireCaller`, `json`, `HttpError`, `parseJsonBody`, `createSecretResolver`, `servePost`, `IEngineDeps`, `IIntegrationLogEntry`.
- Produces (HTTP): `POST { accountId, phone }` → `200 { exists: boolean, canonicalPhone: string | null, traceId }`, or `{ error, code }` with codes `VALIDATION_ERROR | NOT_FOUND | UNSUPPORTED_PROVIDER | INSTANCE_OFFLINE | CONFIG_MISSING | MISSING_API_KEY`.

- [ ] **Step 1: Write the function**

Create `supabase/functions/whatsapp-check-number/index.ts`:

```ts
/**
 * whatsapp-check-number — does a phone number have a WhatsApp account?
 *
 * POST { accountId, phone } where `phone` is wire digits (55DDD…, 12–13).
 *   → { exists, canonicalPhone, traceId }
 *
 * Evolution-only: the Meta Cloud API has no reliable pre-check (the client falls
 * back to the reactive 131026 flow for Meta accounts / offline instances). The
 * api key is resolved Vault-first and never reaches the browser.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requireCaller } from "../_shared/auth.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { servePost } from "../_shared/serve.ts";
import {
  checkWhatsAppNumbers,
  type IEvolutionInstanceTarget,
} from "../_shared/whatsapp/evolution/instance.ts";
import type { IEngineDeps, IIntegrationLogEntry } from "../_shared/whatsapp/types.ts";

/** Starting a conversation is a seller action — broader than staff-only. */
const CHECK_ROLES = ["owner", "manager", "seller_internal", "seller_external"] as const;

const DIGITS = /\D/g;

interface IAccountRow {
  id: string;
  store_id: string;
  provider: string;
  status: string;
  credentials_ref: string;
  provider_config: { baseUrl?: string; instanceName?: string } | null;
}

function jsonError(message: string, code: string, status: number): Response {
  return json({ error: message, code }, status);
}

function makeEngineDeps(admin: SupabaseClient, traceId: string): IEngineDeps {
  return {
    resolveSecret: createSecretResolver(admin),
    logIntegration: async (entry: IIntegrationLogEntry) => {
      await admin.from("integration_logs").insert({
        integration_name: entry.integrationName,
        direction: entry.direction,
        endpoint: entry.endpoint,
        http_status: entry.httpStatus,
        latency_ms: entry.latencyMs,
        trace_id: entry.traceId ?? traceId,
        request_payload: entry.requestPayload,
        response_payload: entry.responsePayload,
        error_message: entry.errorMessage,
      });
    },
  };
}

servePost(async (req, { traceId }) => {
  const body = await parseJsonBody(req);
  const accountId = typeof body.accountId === "string" ? body.accountId : "";
  const phone = (typeof body.phone === "string" ? body.phone : "").replace(DIGITS, "");
  if (!accountId) throw new HttpError(400, "accountId is required");
  if (phone.length < 12 || phone.length > 13) {
    return jsonError("telefone inválido — informe DDI + DDD + número", "VALIDATION_ERROR", 422);
  }

  const { admin, profile } = await requireCaller(req, CHECK_ROLES);

  const { data: account } = await admin
    .from("whatsapp_accounts")
    .select("id, store_id, provider, status, credentials_ref, provider_config")
    .eq("id", accountId)
    .eq("store_id", profile.store_id)
    .maybeSingle<IAccountRow>();
  if (!account) return jsonError("conta não encontrada nesta loja", "NOT_FOUND", 404);
  if (account.provider !== "evolution") {
    return jsonError("validação disponível apenas para contas Evolution", "UNSUPPORTED_PROVIDER", 422);
  }
  if (account.status !== "connected") {
    return jsonError("instância desconectada — não foi possível validar", "INSTANCE_OFFLINE", 409);
  }
  const baseUrl = account.provider_config?.baseUrl;
  const instanceName = account.provider_config?.instanceName;
  if (!baseUrl || !instanceName) {
    return jsonError("configure URL base e instância", "CONFIG_MISSING", 422);
  }

  const deps = makeEngineDeps(admin, traceId);
  const apiKey = await deps.resolveSecret(`${account.credentials_ref}_API_KEY`);
  if (!apiKey) return jsonError("chave de API não cadastrada", "MISSING_API_KEY", 422);

  const target: IEvolutionInstanceTarget = { baseUrl, instanceName };
  const [result] = await checkWhatsAppNumbers(apiKey, deps, target, [phone], traceId);
  const exists = result?.exists === true;
  const canonicalPhone = exists && result?.e164 ? result.e164.replace(DIGITS, "") : null;

  return json({ exists, canonicalPhone, traceId }, 200);
});
```

- [ ] **Step 2: Confirm the `whatsapp_accounts.status` connected value**

Run: `grep -rn "status" supabase/functions/whatsapp-connect/index.ts | grep -i connect`
Expected: confirm the connected sentinel is the string `"connected"` (used by `markConnected`). If the project uses a different value, update the `account.status !== "connected"` check accordingly.

- [ ] **Step 3: Deploy the function**

Run: `npx supabase functions deploy whatsapp-check-number --project-ref njizaasajkdqptlxddqn`
Expected: `Deployed Function whatsapp-check-number`. (verify_jwt stays ON — this is an authenticated endpoint.)

- [ ] **Step 4: Smoke (best-effort, real Evolution instance)**

In the app (Configurações → WhatsApp), with a connected Evolution account, from the browser devtools console:

```js
const { data, error } = await window.__supabase?.functions?.invoke?.("whatsapp-check-number", { body: { accountId: "<id>", phone: "55<DDD><num>" } });
console.log(data, error);
```
Expected: `{ exists: true|false, canonicalPhone: "55…"|null }`. If `__supabase` is unavailable, defer the smoke to Task 7 (the modal exercises it end-to-end). A `no_whatsapp` for an obviously-real number → re-check the response shape against `parseWhatsAppNumbers` (Evolution build variance).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/whatsapp-check-number/index.ts
git commit -m "feat(whatsapp): whatsapp-check-number Edge Function (Evolution pre-check)"
```

---

### Task 5: Client API `checkWhatsAppNumber`

**Files:**
- Create: `src/features/conversations/api/checkWhatsAppNumber.ts`
- Test: `src/features/conversations/api/checkWhatsAppNumber.test.ts`

**Interfaces:**
- Produces:
  - `type NumberCheckStatus = "has_whatsapp" | "no_whatsapp" | "skipped"`
  - `interface INumberCheckResult { status: NumberCheckStatus; canonicalPhone?: string }`
  - `interface IEdgeResponse { exists: boolean; canonicalPhone: string | null }`
  - `classifyNumberCheck(data: IEdgeResponse | null, errorCode: string | null): INumberCheckResult`
  - `checkWhatsAppNumber(accountId: ID, phoneDigits: string): Promise<INumberCheckResult>`
- Consumes: `getActiveDataSource`, `getSupabaseClient`.

- [ ] **Step 1: Write the failing test**

Create `src/features/conversations/api/checkWhatsAppNumber.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyNumberCheck } from "./checkWhatsAppNumber";

describe("classifyNumberCheck", () => {
  it("maps exists=true to has_whatsapp with the canonical phone", () => {
    expect(classifyNumberCheck({ exists: true, canonicalPhone: "5554999998888" }, null)).toEqual({
      status: "has_whatsapp",
      canonicalPhone: "5554999998888",
    });
  });
  it("maps exists=false to no_whatsapp", () => {
    expect(classifyNumberCheck({ exists: false, canonicalPhone: null }, null)).toEqual({
      status: "no_whatsapp",
    });
  });
  it("any error code is a soft skip (never blocks)", () => {
    expect(classifyNumberCheck(null, "INSTANCE_OFFLINE")).toEqual({ status: "skipped" });
    expect(classifyNumberCheck(null, "UNSUPPORTED_PROVIDER")).toEqual({ status: "skipped" });
    expect(classifyNumberCheck(null, "UNKNOWN")).toEqual({ status: "skipped" });
  });
  it("no data and no error is a skip", () => {
    expect(classifyNumberCheck(null, null)).toEqual({ status: "skipped" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/features/conversations/api/checkWhatsAppNumber.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/features/conversations/api/checkWhatsAppNumber.ts`:

```ts
import { getActiveDataSource } from "@/providers/data";
import { getSupabaseClient } from "@/shared/lib/supabase";
import type { ID } from "@/shared/types";

export type NumberCheckStatus = "has_whatsapp" | "no_whatsapp" | "skipped";

export interface INumberCheckResult {
  status: NumberCheckStatus;
  /** Canonical phone digits (55…) the WhatsApp network reports, when has_whatsapp. */
  canonicalPhone?: string;
}

export interface IEdgeResponse {
  exists: boolean;
  canonicalPhone: string | null;
}

/**
 * Pure mapping from the edge outcome to a UX decision. ANY error code is a soft
 * skip: Meta accounts, offline instances and infra errors must let the seller
 * proceed with the typed number — only a definitive `exists:false` blocks (D6).
 */
export function classifyNumberCheck(
  data: IEdgeResponse | null,
  errorCode: string | null,
): INumberCheckResult {
  if (errorCode !== null) return { status: "skipped" };
  if (data?.exists) {
    return { status: "has_whatsapp", canonicalPhone: data.canonicalPhone ?? undefined };
  }
  if (data) return { status: "no_whatsapp" };
  return { status: "skipped" };
}

/** Reads the `{ code }` from a functions.invoke error envelope, when present. */
async function readEdgeCode(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const b = (await ctx.json()) as { code?: string };
      if (b?.code) return b.code;
    } catch {
      /* fall through */
    }
  }
  return "UNKNOWN";
}

/**
 * Does `phoneDigits` (55…) have a WhatsApp account, via the Evolution instance
 * behind `accountId`? Mock mode resolves to `skipped` so the dialog stays demoable.
 */
export async function checkWhatsAppNumber(
  accountId: ID,
  phoneDigits: string,
): Promise<INumberCheckResult> {
  if (getActiveDataSource() === "mock") return { status: "skipped" };
  try {
    const { data, error } = await getSupabaseClient().functions.invoke<IEdgeResponse>(
      "whatsapp-check-number",
      { body: { accountId, phone: phoneDigits } },
    );
    if (error) return classifyNumberCheck(null, await readEdgeCode(error));
    return classifyNumberCheck(data ?? null, null);
  } catch {
    return { status: "skipped" };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/features/conversations/api/checkWhatsAppNumber.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/api/checkWhatsAppNumber.ts src/features/conversations/api/checkWhatsAppNumber.test.ts
git commit -m "feat(conversations): client API to pre-check a WhatsApp number"
```

---

### Task 6: Modal — card "número novo", mini-form, criação + dedupe

**Files:**
- Modify: `src/features/conversations/components/NewConversationDialog.tsx`

**Interfaces:**
- Consumes: `normalizeBrPhone`, `samePhone`, `looksLikePhone`, `formatBrPhoneDisplay` (Task 1); `customersProvider.create`/`list`, `conversationsProvider.list`/`createOutbound`.
- Produces (within the component): `resolveOrCreateCustomer(phoneFinal: string): Promise<ICustomer>`, `findOpenConversationId(customerId: ID): Promise<ID | null>`, `startNewNumber(forced: boolean): Promise<void>` (validation wired in Task 7).

**Context:** the new-number path lives alongside the existing customer-search path. No validation yet — this task proves the create + dedupe flow; Task 7 adds the WhatsApp gate.

- [ ] **Step 1: Add imports and state**

In `src/features/conversations/components/NewConversationDialog.tsx`, extend the engine import and add state. Replace the import line for `formatPhone`:

```ts
import { formatPhone } from "@/shared/utils/format";
import {
  formatBrPhoneDisplay,
  looksLikePhone,
  normalizeBrPhone,
  samePhone,
} from "../engine/phoneBR";
```

Inside the component, after `const [creating, setCreating] = useState(false);` add:

```ts
  const [newNumberMode, setNewNumberMode] = useState(false);
  const [newNumberName, setNewNumberName] = useState("");
  const [newNumberPhone, setNewNumberPhone] = useState("");
```

- [ ] **Step 2: Add the create + dedupe helpers**

Inside the component, after the existing `handleStart` function, add:

```ts
  /** Dedupe by phone (the Supabase search now filters — Task 2), else create a
   *  minimal B2C contact (no CPF; name falls back to the number, healed later). */
  async function resolveOrCreateCustomer(phoneFinal: string): Promise<ICustomer> {
    const suffix = phoneFinal.slice(-8);
    const res = await customersProvider.list({ storeId, search: suffix, pageSize: 20 });
    const match = res.data.find((c) => samePhone(c.phone, phoneFinal));
    if (match) return match;
    return customersProvider.create({
      type: "B2C",
      cpf: "",
      fullName: newNumberName.trim() || phoneFinal,
      phone: phoneFinal,
      sellerId,
      storeId,
      status: "ativo",
      tags: [],
    });
  }

  /** Reuse an already-open conversation for this contact on this instance. */
  async function findOpenConversationId(customerId: ID): Promise<ID | null> {
    const res = await conversationsProvider.list({
      storeId,
      customerId,
      whatsappAccountId: origin?.id,
      status: ["aguardando", "em_andamento", "aguardando_cliente"],
      pageSize: 1,
    });
    return res.data[0]?.id ?? null;
  }

  /** Orchestrates the new-number flow. `forced` is wired in Task 7 (validation). */
  async function startNewNumber(_forced: boolean) {
    if (!origin) return;
    const norm = normalizeBrPhone(newNumberPhone);
    if (!norm.ok) {
      toast.error("Informe DDD + número (ex.: 54 99999-8888).");
      return;
    }
    setCreating(true);
    try {
      const phoneFinal = norm.digits;
      const customer = await resolveOrCreateCustomer(phoneFinal);
      const openId = await findOpenConversationId(customer.id);
      if (openId) {
        onCreated(openId);
        return;
      }
      const conversation = await conversationsProvider.createOutbound({
        storeId,
        whatsappAccountId: origin.id,
        assignedSellerId: sellerId,
        customerId: customer.id,
      });
      onCreated(conversation.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível iniciar a conversa.");
      setCreating(false);
    }
  }
```

Add the `ICustomer` import already present; ensure `IConversation`/`ID` types are imported (they are via `@/shared/types`).

- [ ] **Step 3: Render the card + mini-form**

Replace the existing "no results" block:

```tsx
                  {query.trim().length >= 2 && results.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Nenhum cliente encontrado. Cadastre o contato em Clientes para iniciar a
                      conversa.
                    </p>
                  )}
```

with:

```tsx
                  {query.trim().length >= 2 && results.length === 0 && !newNumberMode && (
                    looksLikePhone(query) ? (
                      <button
                        type="button"
                        onClick={() => {
                          setNewNumberMode(true);
                          setNewNumberPhone(query);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-left text-sm hover:bg-primary/10"
                      >
                        <Icon icon="mdi:plus-circle-outline" size={16} className="text-primary" />
                        <span>
                          Falar com{" "}
                          <span className="font-medium text-foreground">
                            {(() => {
                              const n = normalizeBrPhone(query);
                              return n.ok ? formatBrPhoneDisplay(n.digits) : query;
                            })()}
                          </span>{" "}
                          — número novo
                        </span>
                      </button>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Nenhum cliente encontrado. Cadastre o contato em Clientes para iniciar a
                        conversa.
                      </p>
                    )
                  )}

                  {newNumberMode && (
                    <div className="space-y-2 rounded-lg border border-border p-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="new-conv-newname">Nome (opcional)</Label>
                        <Input
                          id="new-conv-newname"
                          value={newNumberName}
                          onChange={(e) => setNewNumberName(e.target.value)}
                          placeholder="Sem nome"
                          autoComplete="off"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="new-conv-newphone">Telefone</Label>
                        <Input
                          id="new-conv-newphone"
                          inputMode="tel"
                          value={newNumberPhone}
                          onChange={(e) => setNewNumberPhone(e.target.value)}
                          placeholder="(55) 54 99999-8888"
                          autoComplete="off"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setNewNumberMode(false);
                          setNewNumberName("");
                          setNewNumberPhone("");
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Voltar à busca
                      </button>
                    </div>
                  )}
```

- [ ] **Step 4: Wire the footer button for the new-number mode**

Replace the footer action `<Button>` for "Iniciar conversa":

```tsx
                <Button onClick={() => void handleStart()} disabled={!origin || !selected || creating}>
                  {creating ? "Iniciando…" : "Iniciar conversa"}
                </Button>
```

with:

```tsx
                <Button
                  onClick={() => void (newNumberMode ? startNewNumber(false) : handleStart())}
                  disabled={
                    !origin ||
                    creating ||
                    (newNumberMode ? !looksLikePhone(newNumberPhone) : !selected)
                  }
                >
                  {creating ? "Iniciando…" : "Iniciar conversa"}
                </Button>
```

- [ ] **Step 5: Build + manual smoke (mock)**

Run: `bun run build`
Expected: build succeeds.

Manual (owner smoke, mock data source): open "Nova conversa", type a number not in the base → card appears → click it → mini-form → "Iniciar conversa" creates the contact and opens the thread. Typing a name (non-numeric) with no match still shows the "cadastre em Clientes" copy.

- [ ] **Step 6: Commit**

```bash
git add src/features/conversations/components/NewConversationDialog.tsx
git commit -m "feat(conversations): start a conversation with an unsaved number (create + dedupe)"
```

---

### Task 7: Modal — integrar a validação de WhatsApp (bloquear com escape)

**Files:**
- Modify: `src/features/conversations/components/NewConversationDialog.tsx`

**Interfaces:**
- Consumes: `checkWhatsAppNumber` (Task 5); `customersProvider.update`.

- [ ] **Step 1: Add the check state + import**

Add the import:

```ts
import { checkWhatsAppNumber } from "../api/checkWhatsAppNumber";
```

Add state after `newNumberPhone`:

```ts
  const [checkState, setCheckState] = useState<"idle" | "checking" | "no_whatsapp">("idle");
```

- [ ] **Step 2: Wire validation into `startNewNumber`**

Replace the whole `startNewNumber` body with the validated version:

```ts
  async function startNewNumber(forced: boolean) {
    if (!origin) return;
    const norm = normalizeBrPhone(newNumberPhone);
    if (!norm.ok) {
      toast.error("Informe DDD + número (ex.: 54 99999-8888).");
      return;
    }

    let phoneFinal = norm.digits;
    let markValid = false;

    // Evolution pre-validates; Meta / offline / errors resolve to `skipped`.
    if (!forced) {
      setCheckState("checking");
      const check = await checkWhatsAppNumber(origin.id, norm.digits);
      setCheckState("idle");
      if (check.status === "no_whatsapp") {
        setCheckState("no_whatsapp");
        return; // D6: block, but the UI offers "Iniciar mesmo assim".
      }
      if (check.status === "has_whatsapp") {
        phoneFinal = check.canonicalPhone ?? norm.digits; // jid is canonical (D7).
        markValid = true;
      }
    }

    setCreating(true);
    try {
      const customer = await resolveOrCreateCustomer(phoneFinal);
      // Only ever PROMOTE to valid; never downgrade to invalid here (§7 / RF-052).
      if (markValid && customer.whatsappStatus !== "valid") {
        await customersProvider.update(customer.id, { whatsappStatus: "valid" });
      }
      const openId = await findOpenConversationId(customer.id);
      if (openId) {
        onCreated(openId);
        return;
      }
      const conversation = await conversationsProvider.createOutbound({
        storeId,
        whatsappAccountId: origin.id,
        assignedSellerId: sellerId,
        customerId: customer.id,
      });
      onCreated(conversation.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível iniciar a conversa.");
      setCreating(false);
    }
  }
```

- [ ] **Step 3: Render the checking + blocked states inside the mini-form**

Inside the `{newNumberMode && (…)}` block, before the "Voltar à busca" button, add:

```tsx
                      {checkState === "checking" && (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Icon icon="mdi:loading" size={14} className="animate-spin" />
                          Verificando se o número tem WhatsApp…
                        </p>
                      )}
                      {checkState === "no_whatsapp" && (
                        <div className="space-y-2 rounded-md border border-severity-warning/40 bg-severity-warning/10 p-2 text-xs text-severity-warning">
                          <p className="flex items-center gap-1.5">
                            <Icon icon="mdi:alert-outline" size={14} />
                            Este número não parece ter uma conta de WhatsApp.
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={creating}
                            onClick={() => void startNewNumber(true)}
                          >
                            Iniciar mesmo assim
                          </Button>
                        </div>
                      )}
```

- [ ] **Step 4: Reset `checkState` when the phone is edited**

Update the phone `Input`'s `onChange` in the mini-form to clear a stale block:

```tsx
                          onChange={(e) => {
                            setNewNumberPhone(e.target.value);
                            if (checkState === "no_whatsapp") setCheckState("idle");
                          }}
```

Also disable the primary button while checking — update its `disabled` to include `checkState === "checking"`:

```tsx
                  disabled={
                    !origin ||
                    creating ||
                    checkState === "checking" ||
                    (newNumberMode ? !looksLikePhone(newNumberPhone) : !selected)
                  }
```

- [ ] **Step 5: Build + full smoke**

Run: `bun run build`
Expected: build succeeds.

Run: `bun run test`
Expected: all suites pass (engine + search + parser + classify).

Manual (owner, Evolution account in produção): "Nova conversa" → digite um número real com WhatsApp → "Verificando…" → cria com `whatsapp_status = valid` e o número canônico (9º dígito corrigido). Digite um número sem WhatsApp → bloqueio + "Iniciar mesmo assim" → cria com status `unknown` e abre a conversa. Verifique no banco que o contato sem WhatsApp NÃO ficou `invalid`.

- [ ] **Step 6: Commit**

```bash
git add src/features/conversations/components/NewConversationDialog.tsx
git commit -m "feat(conversations): pre-validate WhatsApp number on new conversation (block with override)"
```

---

## Self-Review

**Spec coverage:**
- §5.0 search Supabase → Task 2 ✅
- §5.1 engine phoneBR → Task 1 ✅
- §5.2 checkWhatsAppNumbers Evolution + sync → Task 3 ✅
- §5.3 Edge `whatsapp-check-number` → Task 4 ✅
- §5.4 client API (spec dizia hook `useCheckWhatsAppNumber`; implementado como função `checkWhatsAppNumber` — desvio consciente: o modal gerencia o próprio loading, função pura é mais simples e testável) → Task 5 ✅
- §5.5 UX card + mini-form + estados → Tasks 6/7 ✅
- §6 orquestração (normaliza → valida → dedupe cliente/conversa → cria → abre) → Tasks 6/7 ✅
- §6.1 contato B2C mínimo (`cpf: ""`, fullName=número) → Task 6 ✅
- §7 promove `valid`, nunca `invalid`; força não marca → Task 7 ✅
- D7 usa `canonicalPhone` (jid) quando existe → Task 7 ✅
- §9 testes (phoneBR, search, parser, classify) → Tasks 1/2/3/5 ✅

**Placeholder scan:** nenhum TBD/TODO; todo step de código mostra o código completo.

**Type consistency:** `IWhatsAppNumberCheck`/`parseWhatsAppNumbers`/`checkWhatsAppNumbers` (T3) consumidos pela edge (T4); `IEdgeResponse { exists, canonicalPhone }` (T5) bate com o retorno da edge (T4); `INumberCheckResult.status` (`has_whatsapp|no_whatsapp|skipped`) usado no modal (T7); `normalizeBrPhone`/`samePhone`/`looksLikePhone`/`formatBrPhoneDisplay` (T1) consumidos em T6/T7; `resolveOrCreateCustomer`/`findOpenConversationId`/`startNewNumber` definidos em T6 e estendidos em T7 com a mesma assinatura.

**Notas de risco para a execução:**
- Task 3/4: o shape de `/chat/whatsappNumbers` pode variar entre builds Evolution — o parser é defensivo, mas o smoke da Task 4/7 contra o servidor real é o que confirma.
- Task 4 Step 2: confirmar o valor de `whatsapp_accounts.status` ("connected") antes do deploy.
- Task 6: `conversationsProvider.list` precisa honrar `customerId`/`whatsappAccountId`/`status` no Supabase — se algum filtro não for aplicado, o pior caso é criar conversa nova em vez de reusar (degradação segura); confirmar no smoke.
