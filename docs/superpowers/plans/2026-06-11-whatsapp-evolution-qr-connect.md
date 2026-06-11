# WhatsApp Evolution QR Connect — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar um número de WhatsApp real à plataforma via Evolution API, com pareamento por QR code dentro de Configurações → WhatsApp (modal), tudo parametrizado pela UI e apikey no Supabase Vault.

**Architecture:** Modal de 3 etapas na `WhatsAppAccountsPage` → cliente chama a nova Edge Function `whatsapp-connect` (proxy de gestão de instância; staff-only) → métodos novos de instância na camada runtime-agnostic `src/providers/whatsapp/evolution/instance.ts` (espelhada em `_shared/whatsapp/` pelo sync script) → servidor Evolution v2. A apikey nunca chega ao navegador: gravada via `integration-secrets` (Vault) e resolvida Vault-first na edge. Em modo mock, o cliente simula a sequência de pareamento sem rede.

**Tech Stack:** React 19 + shadcn/ui (Dialog) + TanStack Query (já no projeto), Vitest, Supabase Edge Functions (Deno), Evolution API v2.

**Spec:** `docs/superpowers/specs/2026-06-11-whatsapp-evolution-qr-connect-design.md`

**Branch:** `feat/whatsapp-evolution-connect` (já criada, contém o spec)

---

## Regras da casa que este plano obedece (não pular)

1. **Espelho WhatsApp:** mudou QUALQUER arquivo em `src/providers/whatsapp/` ⇒ rodar `bun run scripts/sync-whatsapp-shared.ts` e commitar o espelho `supabase/functions/_shared/whatsapp/` junto.
2. **`bun run build` não checa tipos.** Gate prático: `bun run build` + `bun run test`. `bunx tsc --noEmit` tem baseline de erros pré-existentes — avaliar só por delta nos arquivos novos.
3. **`src/routeTree.gen.ts` é gerado** — se aparecer modificado, `git checkout -- src/routeTree.gen.ts` antes de commitar.
4. **NUNCA commitar `vite.config.ts`** (mudança local do usuário) nem os arquivos untracked de `docs/prds/` que não são nossos.
5. Commits convencionais em inglês, atômicos, com trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
6. UI em pt-BR com acentos corretos; comentários de código em inglês.
7. Segredos nunca ecoam de volta: a apikey só viaja `cliente → integration-secrets` uma vez.

## Mapa de arquivos

| Ação | Arquivo | Responsabilidade |
|---|---|---|
| Create | `src/providers/whatsapp/evolution/instance.ts` | Chamadas de gestão de instância Evolution (QR/state/profile/logout/restart/webhook) — runtime-agnostic |
| Create | `src/providers/whatsapp/evolution/instance.test.ts` | Testes unitários do módulo acima |
| Regen | `supabase/functions/_shared/whatsapp/**` | Espelho (sync script) |
| Create | `supabase/functions/whatsapp-connect/index.ts` | Edge proxy: auth staff + resolve apikey + ações + update da conta + audit |
| Create | `src/features/admin-settings/api/whatsappConnect.ts` | Cliente da edge + simulação mock + mapa de erros→microcopy |
| Create | `src/features/admin-settings/api/whatsappConnect.test.ts` | Testes da máquina de estados mock (função pura) |
| Create | `src/features/admin-settings/hooks/useEvolutionPairing.ts` | Hook: ciclo QR (countdown, renovação ≤3, polling 2s, visibilidade) |
| Create | `src/features/admin-settings/components/QrPairingStep.tsx` | Apresentação da etapa QR (QR branco, anel, passos, status aria-live) |
| Create | `src/features/admin-settings/components/ConnectWhatsAppDialog.tsx` | Dialog 3 etapas (form → QR → sucesso) + erros + confirmação de fechamento |
| Modify | `src/features/admin-settings/pages/WhatsAppAccountsPage.tsx` | Botões "Conectar/Conexão" nos cards Evolution + bloco final vira CTA |
| Modify | `docs/dev/whatsapp-evolution-provider.md` | Seção "Conexão por QR (in-platform)" |

---

### Task 1: Engine — `instance.ts` (TDD)

**Files:**
- Create: `src/providers/whatsapp/evolution/instance.test.ts`
- Create: `src/providers/whatsapp/evolution/instance.ts`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/providers/whatsapp/evolution/instance.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { WhatsAppProviderError } from "../errors";
import type { IEngineDeps } from "../types";
import {
  fetchInstanceProfile,
  getConnectionState,
  getInstanceQr,
  logoutInstance,
  restartInstance,
  setInstanceWebhook,
} from "./instance";

interface IRecordedCall {
  url: string;
  init: RequestInit;
}

/** Engine deps with a stubbed fetch returning a fixed JSON response. */
function makeDeps(
  status: number,
  body: unknown,
): { deps: IEngineDeps; calls: IRecordedCall[] } {
  const calls: IRecordedCall[] = [];
  const deps: IEngineDeps = {
    resolveSecret: async () => undefined,
    fetchFn: (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify(body), { status });
    }) as typeof fetch,
  };
  return { deps, calls };
}

const TARGET = { baseUrl: "https://evo.test", instanceName: "inst1" };

describe("getInstanceQr", () => {
  it("returns the QR from a v2 top-level base64", async () => {
    const { deps, calls } = makeDeps(200, {
      pairingCode: "ABCD-1234",
      code: "2@abc",
      base64: "data:image/png;base64,QR==",
    });
    const result = await getInstanceQr("key", deps, TARGET);
    expect(result).toEqual({
      state: "qr",
      qrBase64: "data:image/png;base64,QR==",
      pairingCode: "ABCD-1234",
    });
    expect(calls[0].url).toBe("https://evo.test/instance/connect/inst1");
    expect(calls[0].init.method).toBe("GET");
  });

  it("returns the QR from a nested qrcode.base64 (v1 compat)", async () => {
    const { deps } = makeDeps(200, { qrcode: { base64: "data:image/png;base64,QR2==" } });
    const result = await getInstanceQr("key", deps, TARGET);
    expect(result.state).toBe("qr");
    expect(result.qrBase64).toBe("data:image/png;base64,QR2==");
  });

  it("returns state open when the instance is already connected", async () => {
    const { deps } = makeDeps(200, { instance: { state: "open" } });
    const result = await getInstanceQr("key", deps, TARGET);
    expect(result).toEqual({ state: "open" });
  });

  it("throws INTEGRATION_ERROR when there is no QR and no open state", async () => {
    const { deps } = makeDeps(200, { something: "else" });
    await expect(getInstanceQr("key", deps, TARGET)).rejects.toMatchObject({
      code: "INTEGRATION_ERROR",
    });
  });

  it("maps 401 to UNAUTHORIZED via mapEvolutionError", async () => {
    const { deps } = makeDeps(401, { message: "invalid apikey" });
    await expect(getInstanceQr("key", deps, TARGET)).rejects.toBeInstanceOf(
      WhatsAppProviderError,
    );
    await expect(getInstanceQr("key", deps, TARGET)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("getConnectionState", () => {
  it("parses the nested v2 shape", async () => {
    const { deps, calls } = makeDeps(200, { instance: { state: "connecting" } });
    const result = await getConnectionState("key", deps, TARGET);
    expect(result.state).toBe("connecting");
    expect(calls[0].url).toBe("https://evo.test/instance/connectionState/inst1");
  });

  it("parses the flat shape and falls back to unknown", async () => {
    const flat = makeDeps(200, { state: "open" });
    expect((await getConnectionState("key", flat.deps, TARGET)).state).toBe("open");
    const weird = makeDeps(200, { state: "weird" });
    expect((await getConnectionState("key", weird.deps, TARGET)).state).toBe("unknown");
  });
});

describe("fetchInstanceProfile", () => {
  it("extracts phone and profile name from the v2 array shape", async () => {
    const { deps } = makeDeps(200, [
      { name: "other", ownerJid: "5511888887777@s.whatsapp.net" },
      { name: "inst1", ownerJid: "5555999887766@s.whatsapp.net", profileName: "Gallo Peças" },
    ]);
    const result = await fetchInstanceProfile("key", deps, TARGET);
    expect(result.profileName).toBe("Gallo Peças");
    expect(result.phoneNumber).toBe("+5555999887766");
  });

  it("extracts from the v1 nested shape", async () => {
    const { deps } = makeDeps(200, [
      { instance: { instanceName: "inst1", owner: "5555911112222@s.whatsapp.net", profileName: "Loja" } },
    ]);
    const result = await fetchInstanceProfile("key", deps, TARGET);
    expect(result.phoneNumber).toBe("+5555911112222");
    expect(result.profileName).toBe("Loja");
  });

  it("returns an empty profile when the instance is not in the list", async () => {
    const { deps } = makeDeps(200, [{ name: "other" }]);
    expect(await fetchInstanceProfile("key", deps, TARGET)).toEqual({});
  });
});

describe("logout / restart / webhook", () => {
  it("logoutInstance issues DELETE on the logout path", async () => {
    const { deps, calls } = makeDeps(200, { status: "SUCCESS" });
    await logoutInstance("key", deps, TARGET);
    expect(calls[0].url).toBe("https://evo.test/instance/logout/inst1");
    expect(calls[0].init.method).toBe("DELETE");
  });

  it("restartInstance issues POST on the restart path", async () => {
    const { deps, calls } = makeDeps(200, { status: "SUCCESS" });
    await restartInstance("key", deps, TARGET);
    expect(calls[0].url).toBe("https://evo.test/instance/restart/inst1");
    expect(calls[0].init.method).toBe("POST");
  });

  it("setInstanceWebhook posts the v2 webhook payload", async () => {
    const { deps, calls } = makeDeps(200, {});
    await setInstanceWebhook("key", deps, TARGET, "https://x.supabase.co/functions/v1/whatsapp-webhook/evolution");
    expect(calls[0].url).toBe("https://evo.test/webhook/set/inst1");
    const sent = JSON.parse(String(calls[0].init.body));
    expect(sent.webhook.enabled).toBe(true);
    expect(sent.webhook.url).toContain("/whatsapp-webhook/evolution");
    expect(sent.webhook.events).toEqual([
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE",
      "CONNECTION_UPDATE",
    ]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `bun run test src/providers/whatsapp/evolution/instance.test.ts`
Expected: FAIL — `Cannot find module './instance'` (ou equivalente).

- [ ] **Step 3: Implementar `instance.ts`**

Criar `src/providers/whatsapp/evolution/instance.ts`:

```typescript
/**
 * Evolution instance-management calls (QR pairing flow — spec
 * docs/superpowers/specs/2026-06-11-whatsapp-evolution-qr-connect-design.md).
 *
 * Standalone functions (NOT part of IWhatsAppProvider — that contract is
 * messaging-only and provider-agnostic; instance pairing is Evolution-specific).
 * Consumed server-side by the `whatsapp-connect` Edge Function through the
 * `_shared/whatsapp/` mirror. Runtime-agnostic: relative imports, Web APIs only.
 *
 * Evolution v2 response shapes vary across builds — parsers below accept both
 * the flat v2 and the nested v1-style payloads, falling back defensively.
 */

import { WhatsAppProviderError } from "../errors";
import { toE164 } from "../phone";
import type { IEngineDeps } from "../types";
import { evolutionRequest } from "./client";

export interface IEvolutionInstanceTarget {
  baseUrl: string;
  instanceName: string;
}

export type EvolutionInstanceState = "close" | "connecting" | "open" | "unknown";

export interface IInstanceQrResult {
  state: "qr" | "open";
  /** Data URI (data:image/png;base64,...) of the QR image, when state=qr. */
  qrBase64?: string;
  /** Optional numeric pairing code some builds return alongside the QR. */
  pairingCode?: string;
}

export interface IInstanceProfile {
  /** E.164 of the paired number, when resolvable. */
  phoneNumber?: string;
  profileName?: string;
}

export interface IInstanceStateResult {
  state: EvolutionInstanceState;
}

function parseState(body: unknown): EvolutionInstanceState {
  const candidate = body as { instance?: { state?: string }; state?: string } | null;
  const raw = candidate?.instance?.state ?? candidate?.state;
  return raw === "open" || raw === "connecting" || raw === "close" ? raw : "unknown";
}

/** GET /instance/connect — returns the QR to scan, or `open` if already paired. */
export async function getInstanceQr(
  apiKey: string,
  deps: IEngineDeps,
  target: IEvolutionInstanceTarget,
  traceId?: string,
): Promise<IInstanceQrResult> {
  const response = await evolutionRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: `/instance/connect/${target.instanceName}`,
    method: "GET",
    traceId,
  });
  const body = response.body as {
    base64?: string;
    pairingCode?: string;
    qrcode?: { base64?: string; pairingCode?: string };
    instance?: { state?: string };
  } | null;
  const qrBase64 = body?.base64 ?? body?.qrcode?.base64;
  if (qrBase64) {
    return {
      state: "qr",
      qrBase64,
      pairingCode: body?.pairingCode ?? body?.qrcode?.pairingCode,
    };
  }
  if (parseState(body) === "open") return { state: "open" };
  throw new WhatsAppProviderError(
    "INTEGRATION_ERROR",
    502,
    "Resposta da Evolution sem QR (base64) e sem estado 'open'",
  );
}

/** GET /instance/connectionState — tri-state of the WhatsApp session. */
export async function getConnectionState(
  apiKey: string,
  deps: IEngineDeps,
  target: IEvolutionInstanceTarget,
  traceId?: string,
): Promise<IInstanceStateResult> {
  const response = await evolutionRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: `/instance/connectionState/${target.instanceName}`,
    method: "GET",
    timeoutMs: 10_000,
    traceId,
  });
  return { state: parseState(response.body) };
}

/**
 * GET /instance/fetchInstances — resolves the paired number + profile name.
 * Best-effort: unknown shapes return an empty profile (callers keep going).
 */
export async function fetchInstanceProfile(
  apiKey: string,
  deps: IEngineDeps,
  target: IEvolutionInstanceTarget,
  traceId?: string,
): Promise<IInstanceProfile> {
  const response = await evolutionRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: `/instance/fetchInstances?instanceName=${encodeURIComponent(target.instanceName)}`,
    method: "GET",
    traceId,
  });
  const list = Array.isArray(response.body) ? response.body : [response.body];
  for (const raw of list) {
    const v2 = raw as { name?: string; ownerJid?: string; profileName?: string } | null;
    const v1 = (raw as { instance?: { instanceName?: string; owner?: string; profileName?: string } } | null)
      ?.instance;
    const name = v1?.instanceName ?? v2?.name;
    if (name !== target.instanceName) continue;
    const jid = v1?.owner ?? v2?.ownerJid;
    return {
      phoneNumber: jid ? toE164(jid.split("@")[0] ?? "") : undefined,
      profileName: v1?.profileName ?? v2?.profileName ?? undefined,
    };
  }
  return {};
}

/** DELETE /instance/logout — unpairs the WhatsApp session (QR needed again). */
export async function logoutInstance(
  apiKey: string,
  deps: IEngineDeps,
  target: IEvolutionInstanceTarget,
  traceId?: string,
): Promise<void> {
  await evolutionRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: `/instance/logout/${target.instanceName}`,
    method: "DELETE",
    traceId,
  });
}

/** POST /instance/restart — restarts the instance process on the server. */
export async function restartInstance(
  apiKey: string,
  deps: IEngineDeps,
  target: IEvolutionInstanceTarget,
  traceId?: string,
): Promise<void> {
  await evolutionRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: `/instance/restart/${target.instanceName}`,
    method: "POST",
    traceId,
  });
}

/**
 * POST /webhook/set — points the instance at our unified webhook. Idempotent:
 * re-applying the same config is always safe (called on every pairing start).
 */
export async function setInstanceWebhook(
  apiKey: string,
  deps: IEngineDeps,
  target: IEvolutionInstanceTarget,
  webhookUrl: string,
  traceId?: string,
): Promise<void> {
  await evolutionRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: `/webhook/set/${target.instanceName}`,
    json: {
      webhook: {
        enabled: true,
        url: webhookUrl,
        base64: false,
        events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"],
      },
    },
    traceId,
  });
}
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `bun run test src/providers/whatsapp/evolution/instance.test.ts`
Expected: PASS (todos os testes).

- [ ] **Step 5: Rodar a suíte inteira (regressão)**

Run: `bun run test`
Expected: PASS — nenhum teste existente quebrado.

- [ ] **Step 6: Commit**

```bash
git add src/providers/whatsapp/evolution/instance.ts src/providers/whatsapp/evolution/instance.test.ts
git commit -m "feat(whatsapp): evolution instance-management engine calls (QR pairing)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Espelhar a camada para as Edge Functions

**Files:**
- Regenerate: `supabase/functions/_shared/whatsapp/**` (inclui o novo `evolution/instance.ts`)

- [ ] **Step 1: Rodar o sync**

Run: `bun run scripts/sync-whatsapp-shared.ts`
Expected: `synced N files → supabase/functions/_shared/whatsapp/` (N maior que antes em 1).

- [ ] **Step 2: Conferir que o novo arquivo existe no espelho**

Run: `git status --short supabase/functions/_shared/whatsapp/`
Expected: `?? supabase/functions/_shared/whatsapp/evolution/instance.ts` (demais arquivos sem mudança — o sync é byte-idêntico + extensão `.ts`).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/whatsapp/
git commit -m "chore(whatsapp): sync _shared mirror with instance engine" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Edge Function `whatsapp-connect`

**Files:**
- Create: `supabase/functions/whatsapp-connect/index.ts`

Sem teste automatizado (padrão da casa: edges são wiring fino; a lógica testável vive no engine — Task 1). Validação real é o e2e manual (Task 8).

- [ ] **Step 1: Escrever a função**

Criar `supabase/functions/whatsapp-connect/index.ts`:

```typescript
/**
 * whatsapp-connect — Evolution instance management proxy (QR pairing flow).
 *
 * Staff-only POST (gateway verify_jwt + role gate). The browser NEVER talks
 * to the Evolution server nor sees the apikey: this function resolves the
 * key Vault-first ({credentials_ref}_API_KEY) and proxies the instance calls.
 *
 * Input (JSON body): { accountId, action: 'test'|'qr'|'state'|'logout'|'restart' }
 *
 * Side effects: updates whatsapp_accounts (status/phone/profile) and audits
 * connect/disconnect/restart/webhook-set. Errors keep the house `{ error }`
 * contract plus a machine `code` for frontend UX branching.
 *
 * Spec: docs/superpowers/specs/2026-06-11-whatsapp-evolution-qr-connect-design.md
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { bestEffortAudit } from "../_shared/audit.ts";
import { requireCaller, STAFF_ROLES } from "../_shared/auth.ts";
import { requiredEnv } from "../_shared/env.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { servePost } from "../_shared/serve.ts";
import { EVOLUTION_SECRET_SUFFIXES } from "../_shared/whatsapp/evolution/constants.ts";
import {
  fetchInstanceProfile,
  getConnectionState,
  getInstanceQr,
  logoutInstance,
  restartInstance,
  setInstanceWebhook,
  type IEvolutionInstanceTarget,
} from "../_shared/whatsapp/evolution/instance.ts";
import { WhatsAppProviderError } from "../_shared/whatsapp/errors.ts";
import type { IEngineDeps, IIntegrationLogEntry } from "../_shared/whatsapp/types.ts";

/** Client-side QR rotation window (Evolution rotates ~30-40s; we renew at 30). */
const QR_EXPIRES_IN_SECONDS = 30;

const ACTIONS = ["test", "qr", "state", "logout", "restart"] as const;
type ConnectAction = (typeof ACTIONS)[number];

interface IAccountRow {
  id: string;
  store_id: string;
  provider: string;
  status: string;
  phone_number: string | null;
  credentials_ref: string;
  provider_config: Record<string, unknown> | null;
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

/** Audit actor must reference sellers.id (audit FK) — resolve from the caller. */
async function resolveActorSellerId(
  admin: SupabaseClient,
  callerId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("profiles")
    .select("seller_id")
    .eq("auth_user_id", callerId)
    .maybeSingle();
  return (data?.seller_id as string | null) ?? null;
}

/** Marks the account connected, capturing number/profile when resolvable. */
async function markConnected(
  admin: SupabaseClient,
  row: IAccountRow,
  apiKey: string,
  deps: IEngineDeps,
  target: IEvolutionInstanceTarget,
  actorId: string | null,
  traceId: string,
): Promise<{ phoneNumber?: string; profileName?: string }> {
  let profile: { phoneNumber?: string; profileName?: string } = {};
  try {
    profile = await fetchInstanceProfile(apiKey, deps, target, traceId);
  } catch (_err) {
    // Profile resolution is best-effort — connection state is what matters.
  }
  await admin
    .from("whatsapp_accounts")
    .update({
      status: "connected",
      ...(profile.phoneNumber ? { phone_number: profile.phoneNumber } : {}),
      provider_config: {
        ...(row.provider_config ?? {}),
        ...(profile.profileName ? { profileName: profile.profileName } : {}),
      },
    })
    .eq("id", row.id);
  if (row.status !== "connected" && actorId) {
    await bestEffortAudit(admin, {
      store_id: row.store_id,
      actor_id: actorId,
      action: "whatsapp_instance_connected",
      resource: "whatsapp_account",
      resource_id: row.id,
      after: { state: "open", ...profile },
    });
  }
  return profile;
}

servePost(async (req, ctx) => {
  const { callerId, admin, profile: caller } = await requireCaller(req, STAFF_ROLES);
  const body = (await parseJsonBody(req)) as { accountId?: string; action?: string };

  const action = body.action as ConnectAction;
  if (!body.accountId || !ACTIONS.includes(action)) {
    throw new HttpError(422, "accountId e action (test|qr|state|logout|restart) são obrigatórios");
  }

  const { data: row } = await admin
    .from("whatsapp_accounts")
    .select("id, store_id, provider, status, phone_number, credentials_ref, provider_config")
    .eq("id", body.accountId)
    .maybeSingle();
  if (!row) throw new HttpError(404, "Conta WhatsApp não encontrada");
  const account = row as IAccountRow;

  if (account.provider !== "evolution") {
    throw new HttpError(422, "Conexão por QR é exclusiva de contas Evolution");
  }
  // Owner is cross-store; managers only manage their own store's accounts.
  if (caller.role !== "owner" && caller.store_id !== account.store_id) {
    throw new HttpError(403, "forbidden: account belongs to another store");
  }

  const config = account.provider_config ?? {};
  const target: IEvolutionInstanceTarget = {
    baseUrl: String(config.baseUrl ?? ""),
    instanceName: String(config.instanceName ?? ""),
  };
  if (!target.baseUrl || !target.instanceName) {
    return json(
      { error: "Configure a URL do servidor e a instância antes de conectar.", code: "CONFIG_MISSING", traceId: ctx.traceId },
      422,
    );
  }

  const deps = makeEngineDeps(admin, ctx.traceId);
  const apiKey = await deps.resolveSecret(
    `${account.credentials_ref}${EVOLUTION_SECRET_SUFFIXES.apiKey}`,
  );
  if (!apiKey) {
    return json(
      { error: "API key da Evolution não configurada — salve a chave no cofre primeiro.", code: "MISSING_API_KEY", traceId: ctx.traceId },
      422,
    );
  }

  const actorId = await resolveActorSellerId(admin, callerId);

  try {
    switch (action) {
      case "test": {
        const result = await getConnectionState(apiKey, deps, target, ctx.traceId);
        return json({ ok: true, state: result.state, traceId: ctx.traceId }, 200);
      }

      case "qr": {
        // Point the instance at our unified webhook before pairing (idempotent;
        // best-effort — a failure here must not block the QR).
        const webhookUrl = `${requiredEnv("SUPABASE_URL")}/functions/v1/whatsapp-webhook/evolution`;
        try {
          await setInstanceWebhook(apiKey, deps, target, webhookUrl, ctx.traceId);
          if (actorId) {
            await bestEffortAudit(admin, {
              store_id: account.store_id,
              actor_id: actorId,
              action: "whatsapp_instance_webhook_set",
              resource: "whatsapp_account",
              resource_id: account.id,
              after: { url: webhookUrl },
            });
          }
        } catch (err) {
          ctx.log.warn("webhook set failed (continuing to QR)", {
            error: err instanceof Error ? err.message : String(err),
          });
        }

        const qr = await getInstanceQr(apiKey, deps, target, ctx.traceId);
        if (qr.state === "open") {
          const profile = await markConnected(admin, account, apiKey, deps, target, actorId, ctx.traceId);
          return json({ state: "open", ...profile, traceId: ctx.traceId }, 200);
        }
        return json(
          { state: "qr", qrBase64: qr.qrBase64, pairingCode: qr.pairingCode, expiresInSeconds: QR_EXPIRES_IN_SECONDS, traceId: ctx.traceId },
          200,
        );
      }

      case "state": {
        const result = await getConnectionState(apiKey, deps, target, ctx.traceId);
        if (result.state === "open") {
          const profile = await markConnected(admin, account, apiKey, deps, target, actorId, ctx.traceId);
          return json({ state: "open", ...profile, traceId: ctx.traceId }, 200);
        }
        // `close` during pairing is normal (pre-scan) — only logout flips the
        // stored status to disconnected.
        return json({ state: result.state, traceId: ctx.traceId }, 200);
      }

      case "logout": {
        await logoutInstance(apiKey, deps, target, ctx.traceId);
        await admin
          .from("whatsapp_accounts")
          .update({ status: "disconnected" })
          .eq("id", account.id);
        if (actorId) {
          await bestEffortAudit(admin, {
            store_id: account.store_id,
            actor_id: actorId,
            action: "whatsapp_instance_disconnected",
            resource: "whatsapp_account",
            resource_id: account.id,
            after: { state: "close" },
          });
        }
        return json({ ok: true, traceId: ctx.traceId }, 200);
      }

      case "restart": {
        await restartInstance(apiKey, deps, target, ctx.traceId);
        if (actorId) {
          await bestEffortAudit(admin, {
            store_id: account.store_id,
            actor_id: actorId,
            action: "whatsapp_instance_restarted",
            resource: "whatsapp_account",
            resource_id: account.id,
            after: {},
          });
        }
        return json({ ok: true, traceId: ctx.traceId }, 200);
      }
    }
  } catch (err) {
    if (err instanceof WhatsAppProviderError) {
      ctx.log.warn("connect action rejected", { action, code: err.code, message: err.message });
      return json({ error: err.message, code: err.code, traceId: ctx.traceId }, err.httpStatus);
    }
    throw err;
  }
  // Unreachable — the switch above covers every validated action.
  throw new HttpError(422, "ação inválida");
});
```

- [ ] **Step 2: Deploy via MCP Supabase**

Usar `mcp__supabase__deploy_edge_function` com `name: "whatsapp-connect"`, `verify_jwt: true` (default), enviando `index.ts`. Os imports `../_shared/...` exigem enviar também os arquivos compartilhados — seguir exatamente o mesmo procedimento usado no deploy do `whatsapp-send` (incluir `_shared/*.ts` e `_shared/whatsapp/**` no payload de files).

Expected: deploy OK; `mcp__supabase__list_edge_functions` lista `whatsapp-connect` (11ª função).

- [ ] **Step 3: Smoke da edge (sem UI)**

Run (PowerShell — substituir `<ANON>` e `<TOKEN>` reais NÃO é necessário aqui; o smoke autenticado fica para o e2e manual da Task 8): apenas conferir que a função responde 401 sem auth:

```powershell
curl.exe -s -o NUL -w "%{http_code}" -X POST "https://njizaasajkdqptlxddqn.supabase.co/functions/v1/whatsapp-connect"
```
Expected: `401` (gateway verify_jwt barrando sem token).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/whatsapp-connect/index.ts
git commit -m "feat(edge): whatsapp-connect instance-management proxy (QR pairing)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Cliente da edge + simulação mock (TDD na parte pura)

**Files:**
- Create: `src/features/admin-settings/api/whatsappConnect.test.ts`
- Create: `src/features/admin-settings/api/whatsappConnect.ts`

- [ ] **Step 1: Escrever o teste da máquina de estados mock (falha)**

Criar `src/features/admin-settings/api/whatsappConnect.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { resolveMockPairingState } from "./whatsappConnect";

describe("resolveMockPairingState", () => {
  it("starts closed, moves to connecting, then opens with a fake profile", () => {
    expect(resolveMockPairingState(0).state).toBe("close");
    expect(resolveMockPairingState(2499).state).toBe("close");
    expect(resolveMockPairingState(2500).state).toBe("connecting");
    expect(resolveMockPairingState(4999).state).toBe("connecting");
    const open = resolveMockPairingState(5000);
    expect(open.state).toBe("open");
    expect(open.phoneNumber).toBe("+5555999887766");
    expect(open.profileName).toBe("Gallo Base Diesel (demo)");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun run test src/features/admin-settings/api/whatsappConnect.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar o módulo**

Criar `src/features/admin-settings/api/whatsappConnect.ts`:

```typescript
import { getActiveDataSource } from "@/providers/data";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Client surface for the `whatsapp-connect` Edge Function (Evolution QR
 * pairing — spec 2026-06-11). In mock mode every call is simulated locally
 * (deterministic state machine, no network) so the dialog is demoable.
 */

export type EvolutionPairingState = "close" | "connecting" | "open" | "unknown";

export interface IEvolutionQrResponse {
  state: "qr" | "open";
  qrBase64?: string;
  pairingCode?: string;
  expiresInSeconds?: number;
  phoneNumber?: string;
  profileName?: string;
}

export interface IEvolutionStateResponse {
  state: EvolutionPairingState;
  phoneNumber?: string;
  profileName?: string;
}

export interface IEvolutionTestResponse {
  ok: boolean;
  state?: EvolutionPairingState;
}

/** Stable machine codes the edge returns for UX branching. */
export type EvolutionConnectErrorCode =
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "MISSING_API_KEY"
  | "CONFIG_MISSING"
  | "PROVIDER_DISCONNECTED"
  | "INTEGRATION_ERROR";

export class EvolutionConnectError extends Error {
  readonly code?: EvolutionConnectErrorCode;
  constructor(message: string, code?: EvolutionConnectErrorCode) {
    super(message);
    this.name = "EvolutionConnectError";
    this.code = code;
  }
}

/** Spec microcopy per error code (Seção 3 do design). */
export const CONNECT_ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "A chave de API foi recusada pelo servidor. Confira a apikey.",
  NOT_FOUND: "Instância não encontrada neste servidor. Confira o nome/ID.",
  MISSING_API_KEY: "Salve a chave de API no cofre antes de conectar.",
  CONFIG_MISSING: "Configure a URL do servidor e a instância antes de conectar.",
  DEFAULT:
    "Não conseguimos falar com o servidor Evolution. Verifique se a URL está correta e se o servidor está no ar.",
};

export function connectErrorMessage(error: unknown): string {
  if (error instanceof EvolutionConnectError && error.code) {
    return CONNECT_ERROR_MESSAGES[error.code] ?? CONNECT_ERROR_MESSAGES.DEFAULT;
  }
  return CONNECT_ERROR_MESSAGES.DEFAULT;
}

// ===== Mock simulation =======================================================

/** ms after pairing start → simulated session state (exported for tests). */
export function resolveMockPairingState(elapsedMs: number): IEvolutionStateResponse {
  if (elapsedMs < 2500) return { state: "close" };
  if (elapsedMs < 5000) return { state: "connecting" };
  return {
    state: "open",
    phoneNumber: "+5555999887766",
    profileName: "Gallo Base Diesel (demo)",
  };
}

/** Fake scannable-looking QR (SVG data URI) for demo mode. */
const MOCK_QR_BASE64 =
  "data:image/svg+xml;base64," +
  btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 33 33" width="264" height="264">` +
      `<rect width="33" height="33" fill="#fff"/>` +
      `<path fill="#000" fill-rule="evenodd" d="M0 0h7v7H0zm2 2h3v3H2zM26 0h7v7h-7zm2 2h3v3h-3zM0 26h7v7H0zm2 2h3v3H2z"/>` +
      `<path fill="#000" d="M9 1h2v2H9zm4-1h2v2h-2zm4 2h2v2h-2zm4-1h2v2h-2zM1 9h2v2H1zm8 0h2v2H9zm9 0h2v2h-2zm9 0h2v2h-2zM3 13h2v2H3zm9 0h2v2h-2zm9 0h2v2h-2zM1 17h2v2H1zm9 0h2v2h-2zm9 0h2v2h-2zm9 0h2v2h-2zM2 21h2v2H2zm10 0h2v2h-2zm10 0h2v2h-2zM9 26h2v2H9zm9 0h2v2h-2zm8 0h2v2h-2zm-15 4h2v2h-2zm10 0h2v2h-2z"/>` +
    `</svg>`,
  );

const mockPairingStartedAt = new Map<string, number>();

// ===== Edge invocation =======================================================

async function toConnectError(error: unknown, fallback: string): Promise<EvolutionConnectError> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { error?: string; code?: string };
      if (body?.error) {
        return new EvolutionConnectError(body.error, body.code as EvolutionConnectErrorCode);
      }
    } catch {
      /* fall through */
    }
  }
  return new EvolutionConnectError(error instanceof Error ? error.message : fallback);
}

async function invokeConnect<T>(body: { accountId: string; action: string }): Promise<T> {
  const { data, error } = await getSupabaseClient().functions.invoke<T>("whatsapp-connect", {
    body,
  });
  if (error) throw await toConnectError(error, "Falha ao falar com o servidor.");
  return data as T;
}

const isMock = () => getActiveDataSource() === "mock";

// ===== Public API ============================================================

export async function testEvolutionServer(accountId: string): Promise<IEvolutionTestResponse> {
  if (isMock()) return { ok: true, state: "close" };
  return invokeConnect<IEvolutionTestResponse>({ accountId, action: "test" });
}

export async function requestEvolutionQr(accountId: string): Promise<IEvolutionQrResponse> {
  if (isMock()) {
    mockPairingStartedAt.set(accountId, Date.now());
    return { state: "qr", qrBase64: MOCK_QR_BASE64, expiresInSeconds: 30 };
  }
  return invokeConnect<IEvolutionQrResponse>({ accountId, action: "qr" });
}

export async function getEvolutionState(accountId: string): Promise<IEvolutionStateResponse> {
  if (isMock()) {
    const startedAt = mockPairingStartedAt.get(accountId);
    if (startedAt === undefined) return { state: "close" };
    return resolveMockPairingState(Date.now() - startedAt);
  }
  return invokeConnect<IEvolutionStateResponse>({ accountId, action: "state" });
}

export async function logoutEvolution(accountId: string): Promise<void> {
  if (isMock()) {
    mockPairingStartedAt.delete(accountId);
    return;
  }
  await invokeConnect<{ ok: boolean }>({ accountId, action: "logout" });
}

export async function restartEvolution(accountId: string): Promise<void> {
  if (isMock()) return;
  await invokeConnect<{ ok: boolean }>({ accountId, action: "restart" });
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test src/features/admin-settings/api/whatsappConnect.test.ts`
Expected: PASS.

> ⚠️ Nota: `resolveMockPairingState` usa `Date.now()` apenas no chamador (`getEvolutionState`); a função pura recebe `elapsedMs` — testável sem fake timers.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin-settings/api/whatsappConnect.ts src/features/admin-settings/api/whatsappConnect.test.ts
git commit -m "feat(admin-settings): whatsapp-connect client api with mock pairing simulation" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Hook de pareamento + etapa QR (apresentação)

**Files:**
- Create: `src/features/admin-settings/hooks/useEvolutionPairing.ts`
- Create: `src/features/admin-settings/components/QrPairingStep.tsx`

UI com timers — sem unit test (validação manual pelo usuário, padrão da casa). A lógica de rede já está testada nas Tasks 1 e 4.

- [ ] **Step 1: Criar o hook**

Criar `src/features/admin-settings/hooks/useEvolutionPairing.ts`:

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectErrorMessage,
  getEvolutionState,
  requestEvolutionQr,
} from "../api/whatsappConnect";

/**
 * Drives the Evolution QR pairing lifecycle for the connect dialog:
 * QR request → 30s countdown → auto-renew (max 3) → 2s state polling
 * (paused while the tab is hidden) → connected/expired/error.
 * All timers are tied to `accountId` becoming null (dialog closed).
 */

export type PairingPhase =
  | "loading-qr"
  | "qr"
  | "connecting"
  | "open"
  | "expired"
  | "error";

export interface IEvolutionPairing {
  phase: PairingPhase;
  qrBase64: string | null;
  secondsLeft: number;
  profile: { phoneNumber?: string; profileName?: string };
  errorMessage: string | null;
  /** Manual "Gerar novo código" — also resets the auto-renew budget. */
  renew: () => void;
}

const QR_TTL_SECONDS = 30;
const MAX_AUTO_RENEWALS = 3;
const POLL_INTERVAL_MS = 2000;

export function useEvolutionPairing(accountId: string | null): IEvolutionPairing {
  const [phase, setPhase] = useState<PairingPhase>("loading-qr");
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(QR_TTL_SECONDS);
  const [profile, setProfile] = useState<IEvolutionPairing["profile"]>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const autoRenewsRef = useRef(0);
  const activeRef = useRef(true);

  const requestQr = useCallback(async () => {
    if (!accountId) return;
    setPhase("loading-qr");
    setErrorMessage(null);
    try {
      const result = await requestEvolutionQr(accountId);
      if (!activeRef.current) return;
      if (result.state === "open") {
        setProfile({ phoneNumber: result.phoneNumber, profileName: result.profileName });
        setPhase("open");
        return;
      }
      setQrBase64(result.qrBase64 ?? null);
      setSecondsLeft(result.expiresInSeconds ?? QR_TTL_SECONDS);
      setPhase("qr");
    } catch (err) {
      if (!activeRef.current) return;
      setErrorMessage(connectErrorMessage(err));
      setPhase("error");
    }
  }, [accountId]);

  // Start (and restart on account change); cancel everything on close.
  useEffect(() => {
    activeRef.current = Boolean(accountId);
    autoRenewsRef.current = 0;
    if (accountId) void requestQr();
    return () => {
      activeRef.current = false;
    };
  }, [accountId, requestQr]);

  // 1s countdown while the QR is on screen; auto-renew up to the budget.
  useEffect(() => {
    if (phase !== "qr") return;
    const timer = setInterval(() => {
      setSecondsLeft((current) => {
        if (current > 1) return current - 1;
        if (autoRenewsRef.current < MAX_AUTO_RENEWALS) {
          autoRenewsRef.current += 1;
          void requestQr();
        } else {
          setPhase("expired");
        }
        return 0;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, requestQr]);

  // 2s state polling while pairing; skipped when the tab is hidden.
  useEffect(() => {
    if (!accountId || (phase !== "qr" && phase !== "connecting")) return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      void getEvolutionState(accountId)
        .then((result) => {
          if (!activeRef.current) return;
          if (result.state === "open") {
            setProfile({ phoneNumber: result.phoneNumber, profileName: result.profileName });
            setPhase("open");
          } else if (result.state === "connecting") {
            setPhase((current) => (current === "qr" ? "connecting" : current));
          }
        })
        .catch(() => {
          // Transient poll failures are ignored — the countdown/renewal flow
          // and the next tick keep the UX moving (RNF: no infinite spinners
          // because expiry still fires).
        });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [accountId, phase]);

  const renew = useCallback(() => {
    autoRenewsRef.current = 0;
    void requestQr();
  }, [requestQr]);

  return { phase, qrBase64, secondsLeft, profile, errorMessage, renew };
}
```

- [ ] **Step 2: Criar a etapa QR (apresentação)**

Criar `src/features/admin-settings/components/QrPairingStep.tsx`:

```tsx
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import type { IEvolutionPairing } from "../hooks/useEvolutionPairing";

/**
 * Presentational pairing step: white QR card (camera contrast — deliberate
 * exception to semantic tokens), countdown ring, WhatsApp Web-style steps and
 * an aria-live status line. All behavior lives in useEvolutionPairing.
 */

const RING_RADIUS = 9;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const QR_TTL_SECONDS = 30;

function formatSeconds(total: number): string {
  return `0:${String(total).padStart(2, "0")}`;
}

export interface IQrPairingStepProps {
  pairing: IEvolutionPairing;
}

export function QrPairingStep({ pairing }: IQrPairingStepProps) {
  const { phase, qrBase64, secondsLeft, errorMessage, renew } = pairing;
  const ringOffset = RING_CIRCUMFERENCE * (1 - secondsLeft / QR_TTL_SECONDS);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      {/* QR over pure white — required quiet zone for camera scanning. */}
      <div className="relative mx-auto shrink-0 rounded-lg bg-white p-4">
        {phase === "loading-qr" || !qrBase64 ? (
          <div className="flex h-64 w-64 items-center justify-center">
            <Icon icon="mdi:loading" size={32} className="animate-spin text-neutral-400" />
          </div>
        ) : (
          <img
            src={qrBase64.startsWith("data:") ? qrBase64 : `data:image/png;base64,${qrBase64}`}
            alt="QR code de conexão do WhatsApp"
            className="h-64 w-64"
          />
        )}
        {phase === "expired" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-white/85">
            <Icon icon="mdi:refresh" size={28} className="text-neutral-600" />
            <Button size="sm" onClick={renew}>
              Gerar novo código
            </Button>
          </div>
        )}
        {(phase === "qr" || phase === "loading-qr") && (
          <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-neutral-500">
            <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
              <circle cx="11" cy="11" r={RING_RADIUS} fill="none" stroke="#e5e5e5" strokeWidth="2.5" />
              <circle
                cx="11"
                cy="11"
                r={RING_RADIUS}
                fill="none"
                stroke="#c9a24a"
                strokeWidth="2.5"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={ringOffset}
                transform="rotate(-90 11 11)"
                className="motion-reduce:hidden"
              />
            </svg>
            <span aria-live="off">Expira em {formatSeconds(secondsLeft)}</span>
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-foreground">
          <li>
            Abra o <strong>WhatsApp</strong> no celular
          </li>
          <li>
            Toque em <strong>⋮ Menu</strong> → <strong>Dispositivos conectados</strong>
          </li>
          <li>
            Toque em <strong>Conectar dispositivo</strong>
          </li>
          <li>Aponte a câmera para este código</li>
        </ol>

        {phase === "error" ? (
          <p role="alert" aria-live="assertive" className="flex items-start gap-1.5 text-sm text-severity-critical">
            <Icon icon="mdi:alert-circle-outline" size={16} className="mt-0.5 shrink-0" />
            {errorMessage}
          </p>
        ) : (
          <p role="status" aria-live="polite" className="flex items-center gap-1.5 text-sm text-severity-info">
            {phase === "loading-qr" && (
              <>
                <Icon icon="mdi:loading" size={16} className="animate-spin" />
                Gerando código de conexão…
              </>
            )}
            {phase === "qr" && (
              <>
                <Icon icon="mdi:qrcode-scan" size={16} />
                Escaneie o código com seu celular.
              </>
            )}
            {phase === "connecting" && (
              <>
                <Icon icon="mdi:cellphone-link" size={16} />
                Celular detectado! Pareando o número…
              </>
            )}
            {phase === "expired" && (
              <>
                <Icon icon="mdi:refresh" size={16} />
                O código expirou. Gere um novo para continuar.
              </>
            )}
          </p>
        )}

        {phase === "error" && (
          <Button size="sm" variant="outline" onClick={renew}>
            <Icon icon="mdi:refresh" size={14} className="mr-1.5" />
            Tentar novamente
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Conferir compilação por delta**

Run: `bunx tsc --noEmit 2>&1 | grep -E "useEvolutionPairing|QrPairingStep"` (Bash tool)
Expected: nenhuma linha (zero erros novos nesses arquivos).

- [ ] **Step 4: Commit**

```bash
git add src/features/admin-settings/hooks/useEvolutionPairing.ts src/features/admin-settings/components/QrPairingStep.tsx
git commit -m "feat(admin-settings): evolution pairing hook and QR step UI" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: O Dialog de conexão (3 etapas)

**Files:**
- Create: `src/features/admin-settings/components/ConnectWhatsAppDialog.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IWhatsAppAccount } from "@/shared/types";
import { getActiveDataSource, useWhatsAppAccountsProvider } from "@/providers/data";
import { listIntegrationSecrets, setIntegrationSecret } from "../api/integrationSecrets";
import {
  connectErrorMessage,
  logoutEvolution,
  restartEvolution,
  testEvolutionServer,
} from "../api/whatsappConnect";
import { useEvolutionPairing } from "../hooks/useEvolutionPairing";
import { QrPairingStep } from "./QrPairingStep";

/**
 * Connect dialog for Evolution accounts (spec 2026-06-11): a single Dialog
 * that swaps content across 3 internal steps — instance data → QR pairing →
 * connected. Closing during pairing asks for confirmation. The apikey is
 * write-only: stored via integration-secrets (Vault) and never read back.
 */

export type ConnectDialogStep = "form" | "qr";

export interface IConnectWhatsAppDialogProps {
  /** Evolution account being connected; null = dialog closed. */
  account: IWhatsAppAccount | null;
  initialStep: ConnectDialogStep;
  onClose: () => void;
  /** Fired after any server-side mutation (connect/logout) — refresh the list. */
  onMutated: () => void;
}

export function ConnectWhatsAppDialog({
  account,
  initialStep,
  onClose,
  onMutated,
}: IConnectWhatsAppDialogProps) {
  const provider = useWhatsAppAccountsProvider();
  const isMock = useMemo(() => getActiveDataSource() === "mock", []);

  const [step, setStep] = useState<ConnectDialogStep>(initialStep);
  const [label, setLabel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [instanceName, setInstanceName] = useState("");
  const [apiKeyValue, setApiKeyValue] = useState("");
  const [savedKeyHint, setSavedKeyHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [serverOk, setServerOk] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  // Re-seed local state whenever the dialog (re)opens for an account.
  useEffect(() => {
    if (!account) return;
    setStep(initialStep);
    setLabel(account.label);
    setBaseUrl(account.providerConfig?.baseUrl ?? "");
    setInstanceName(account.providerConfig?.instanceName ?? "");
    setApiKeyValue("");
    setServerOk(false);
    setFormError(null);
  }, [account, initialStep]);

  // Saved-key hint (write-only secret): name + last 4 chars, never the value.
  useEffect(() => {
    if (!account || isMock) return;
    const secretName = `${account.credentialsRef}_API_KEY`;
    void listIntegrationSecrets()
      .then((secrets) => {
        const found = secrets.find((s) => s.name === secretName);
        setSavedKeyHint(found?.hint ?? null);
      })
      .catch(() => setSavedKeyHint(null));
  }, [account, isMock]);

  const pairing = useEvolutionPairing(step === "qr" && account ? account.id : null);

  const pairingInProgress =
    step === "qr" && (pairing.phase === "qr" || pairing.phase === "connecting");

  const handleOpenChange = (open: boolean) => {
    if (open) return;
    if (pairingInProgress) {
      setConfirmClose(true);
      return;
    }
    onClose();
  };

  const handleSaveAndTest = async () => {
    if (!account) return;
    setFormError(null);
    if (!label.trim() || !baseUrl.trim() || !instanceName.trim()) {
      setFormError("Preencha nome, URL do servidor e instância.");
      return;
    }
    if (!/^https?:\/\//.test(baseUrl.trim())) {
      setFormError("A URL do servidor deve começar com http(s)://");
      return;
    }
    setBusy(true);
    try {
      await provider.update(account.id, {
        label: label.trim(),
        providerConfig: { baseUrl: baseUrl.trim().replace(/\/$/, ""), instanceName: instanceName.trim() },
      });
      if (apiKeyValue.trim() && !isMock) {
        await setIntegrationSecret(
          `${account.credentialsRef}_API_KEY`,
          apiKeyValue.trim(),
          `API key Evolution — ${label.trim()}`,
        );
        setApiKeyValue("");
      }
      const result = await testEvolutionServer(account.id);
      setServerOk(result.ok);
      toast.success("Servidor Evolution respondeu.");
      onMutated();
    } catch (err) {
      setServerOk(false);
      setFormError(connectErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (!account) return;
    setBusy(true);
    try {
      await logoutEvolution(account.id);
      toast.success("Conta desconectada.");
      onMutated();
      onClose();
    } catch (err) {
      toast.error(connectErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRestart = async () => {
    if (!account) return;
    setBusy(true);
    try {
      await restartEvolution(account.id);
      toast.success("Instância reiniciada.");
    } catch (err) {
      toast.error(connectErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // Connected: refresh the account list once, as soon as we reach `open`.
  useEffect(() => {
    if (pairing.phase === "open") onMutated();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairing.phase]);

  return (
    <>
      <Dialog open={Boolean(account)} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {step === "form" ? "Conectar conta WhatsApp" : `Conectar — ${account?.label ?? ""}`}
            </DialogTitle>
            <DialogDescription>
              {step === "form"
                ? "Evolution API — a instância já deve existir no servidor."
                : "Escaneie o código com o WhatsApp do número da loja."}
            </DialogDescription>
          </DialogHeader>

          {step === "form" && account && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="connect-label">Nome da conta</Label>
                <Input id="connect-label" value={label} onChange={(e) => setLabel(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="connect-url">URL do servidor Evolution</Label>
                <Input
                  id="connect-url"
                  className="font-mono"
                  inputMode="url"
                  placeholder="https://evolution.exemplo.com.br"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  aria-invalid={Boolean(formError) || undefined}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="connect-instance">Nome / ID da instância</Label>
                <Input
                  id="connect-instance"
                  className="font-mono"
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="connect-apikey">API key</Label>
                <Input
                  id="connect-apikey"
                  type="password"
                  className="font-mono"
                  placeholder={savedKeyHint ? `••••••••${savedKeyHint}` : "Cole a apikey da instância"}
                  value={apiKeyValue}
                  onChange={(e) => setApiKeyValue(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  {savedKeyHint
                    ? "Chave salva no cofre — preencha apenas para substituir."
                    : "Gravada criptografada no cofre da plataforma. Nunca é exibida de volta."}
                </p>
              </div>

              {formError && (
                <p role="alert" className="flex items-start gap-1.5 text-sm text-severity-critical">
                  <Icon icon="mdi:alert-circle-outline" size={16} className="mt-0.5 shrink-0" />
                  {formError}
                </p>
              )}
              {serverOk && !formError && (
                <p role="status" className="flex items-center gap-1.5 text-sm text-severity-success">
                  <Icon icon="mdi:check-circle-outline" size={16} />
                  Servidor respondeu — pronto para gerar o QR code.
                </p>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" disabled={busy} onClick={() => void handleSaveAndTest()}>
                  {busy ? "Testando…" : "Salvar e testar servidor"}
                </Button>
                <Button disabled={!serverOk || busy} onClick={() => setStep("qr")}>
                  Gerar QR code
                  <Icon icon="mdi:arrow-right" size={14} className="ml-1.5" />
                </Button>
              </div>
            </div>
          )}

          {step === "qr" && account && pairing.phase !== "open" && (
            <QrPairingStep pairing={pairing} />
          )}

          {step === "qr" && account && pairing.phase === "open" && (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-severity-success bg-severity-success/10 motion-safe:animate-in motion-safe:zoom-in">
                <Icon icon="mdi:check" size={32} className="text-severity-success" />
              </span>
              <p role="status" aria-live="polite" className="text-sm font-semibold text-foreground">
                Conectado{pairing.profile.profileName ? ` como ${pairing.profile.profileName}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {pairing.profile.phoneNumber ?? account.phoneNumber} · instância{" "}
                {account.providerConfig?.instanceName}
              </p>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void handleRestart()}>
                  <Icon icon="mdi:restart" size={14} className="mr-1.5" />
                  Reiniciar instância
                </Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void handleDisconnect()}>
                  <Icon icon="mdi:link-off" size={14} className="mr-1.5" />
                  Desconectar
                </Button>
                <Button size="sm" autoFocus onClick={onClose}>
                  Concluir
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar a conexão?</AlertDialogTitle>
            <AlertDialogDescription>
              O pareamento em andamento será interrompido. Você pode reabrir e gerar um novo código
              quando quiser.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar conectando</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmClose(false);
                onClose();
              }}
            >
              Cancelar conexão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

> Notas de implementação:
> - Se `src/components/ui/dialog.tsx` não exportar `DialogDescription`, importar só o que existe e usar `<p className="text-sm text-muted-foreground">` no lugar.
> - Se as classes `text-severity-*`/`border-severity-*`/`bg-severity-*/10` não cobrirem algum uso, seguir o padrão de cores do `STATUS_VISUAL` da própria página (emerald/red/amber) — consistência local vence.
> - `motion-safe:animate-in motion-safe:zoom-in` depende do tailwindcss-animate (shadcn); se indisponível, remover (o check estático satisfaz `prefers-reduced-motion` por construção).

- [ ] **Step 2: Conferir compilação por delta**

Run: `bunx tsc --noEmit 2>&1 | grep -E "ConnectWhatsAppDialog"` (Bash tool)
Expected: nenhuma linha.

- [ ] **Step 3: Commit**

```bash
git add src/features/admin-settings/components/ConnectWhatsAppDialog.tsx
git commit -m "feat(admin-settings): evolution connect dialog (form, QR pairing, connected)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Integrar na `WhatsAppAccountsPage`

**Files:**
- Modify: `src/features/admin-settings/pages/WhatsAppAccountsPage.tsx`

- [ ] **Step 1: Importar o dialog e adicionar o estado de conexão**

No bloco de imports (após `import { SectionHeader }...`):

```tsx
import {
  ConnectWhatsAppDialog,
  type ConnectDialogStep,
} from "../components/ConnectWhatsAppDialog";
```

Dentro do componente, junto aos demais `useState` (após `const [saving, setSaving] = useState(false);`):

```tsx
const [connectTarget, setConnectTarget] = useState<{
  account: IWhatsAppAccount;
  step: ConnectDialogStep;
} | null>(null);
```

E um helper logo após `cancelEdit`:

```tsx
/** Opens the connect dialog — straight to QR when the config is complete. */
const openConnect = (account: IWhatsAppAccount) => {
  const configured = Boolean(
    account.providerConfig?.baseUrl && account.providerConfig?.instanceName,
  );
  setConnectTarget({ account, step: configured ? "qr" : "form" });
};
```

- [ ] **Step 2: Botão de conexão nos cards Evolution**

No bloco de ações do card (onde está o botão `Editar`, dentro de `!isEditing`), adicionar ANTES do botão Editar:

```tsx
{account.provider === "evolution" && (
  <Button variant="outline" size="sm" onClick={() => openConnect(account)}>
    <Icon icon="mdi:qrcode-scan" size={14} className="mr-1.5" />
    {account.status === "connected" ? "Conexão" : "Conectar"}
  </Button>
)}
```

- [ ] **Step 3: Substituir o bloco estático "Conectar uma conta nova"**

Substituir o `<div>` final (linhas ~584–593, o bloco `Conectar uma conta nova`) por:

```tsx
<div className="rounded-md border border-border bg-card p-4">
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div className="text-xs text-muted-foreground">
      <p className="font-semibold uppercase tracking-wider text-foreground">
        Conectar uma conta
      </p>
      <p className="mt-1.5">
        Contas Evolution conectam por QR code direto daqui. Contas Meta Cloud API seguem o
        processo assistido (<code className="font-mono">docs/dev/whatsapp-meta-provider.md</code>).
      </p>
    </div>
    {(() => {
      const evolution = (accounts ?? []).find((a) => a.provider === "evolution");
      return evolution ? (
        <Button size="sm" onClick={() => openConnect(evolution)}>
          <Icon icon="mdi:qrcode-scan" size={14} className="mr-1.5" />
          Conectar conta
        </Button>
      ) : null;
    })()}
  </div>
</div>
```

- [ ] **Step 4: Montar o dialog no fim do JSX**

Antes do fechamento do `</div>` raiz do componente:

```tsx
<ConnectWhatsAppDialog
  account={connectTarget?.account ?? null}
  initialStep={connectTarget?.step ?? "form"}
  onClose={() => setConnectTarget(null)}
  onMutated={() => void refresh()}
/>
```

- [ ] **Step 5: Build + suíte completa**

Run: `bun run build` → Expected: build verde.
Run: `bun run test` → Expected: PASS (incl. testes novos).
Run: `bun run lint` → Expected: sem erros NOVOS nos arquivos tocados (ignorar `Delete ␍` — falso positivo CRLF conhecido).

- [ ] **Step 6: Commit**

```bash
git checkout -- src/routeTree.gen.ts   # descartar ruído do dev server, se houver
git add src/features/admin-settings/pages/WhatsAppAccountsPage.tsx
git commit -m "feat(admin-settings): connect/reconnect entry points on WhatsApp accounts page" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Docs + validação final + PR

**Files:**
- Modify: `docs/dev/whatsapp-evolution-provider.md`

- [ ] **Step 1: Documentar o fluxo de conexão**

Adicionar ao final de `docs/dev/whatsapp-evolution-provider.md` a seção:

```markdown
## Conexão por QR (in-platform)

Desde a feature `whatsapp-evolution-connect` (spec
`docs/superpowers/specs/2026-06-11-whatsapp-evolution-qr-connect-design.md`),
a conexão da instância é feita pela própria plataforma em
**Configurações → WhatsApp → Conectar** (staff-only):

1. **Dados:** URL do servidor + nome/ID da instância vão para
   `whatsapp_accounts.provider_config`; a apikey é gravada criptografada no
   Vault como `{credentials_ref}_API_KEY` via `integration-secrets`
   (write-only). "Salvar e testar servidor" valida tudo antes do QR.
2. **QR:** a Edge Function `whatsapp-connect` (proxy staff-only) chama
   `GET /instance/connect` e devolve o QR; o webhook da instância é apontado
   automaticamente para `whatsapp-webhook/evolution` (idempotente). O modal
   renova o código a cada ~30s (máx. 3×) e faz polling de
   `GET /instance/connectionState` a cada 2s.
3. **Conectado:** a edge marca `status='connected'`, captura número/perfil
   (`fetchInstances`) e audita `whatsapp_instance_connected`. Desconectar
   (logout) e reiniciar a instância também passam pela edge, auditados.

A pré-condição continua sendo uma instância JÁ CRIADA no servidor Evolution —
a plataforma não provisiona instâncias. Engine: métodos standalone em
`src/providers/whatsapp/evolution/instance.ts` (espelhados em `_shared/`).
```

- [ ] **Step 2: Gate final**

Run: `bun run build` e `bun run test`
Expected: ambos verdes.

- [ ] **Step 3: Commit + push + PR**

```bash
git add docs/dev/whatsapp-evolution-provider.md
git commit -m "docs(whatsapp): document in-platform Evolution QR connection flow" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push -u origin feat/whatsapp-evolution-connect
```

Criar o PR com `gh pr create` (base `main`), título `feat: WhatsApp Evolution QR connection flow (in-platform pairing)`, corpo resumindo spec/escopo/validação e o footer `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. **NÃO mergear sem aprovação explícita do usuário.**

- [ ] **Step 4: Roteiro de e2e manual (usuário executa)**

Checklist para o usuário validar contra o servidor Evolution real (produção roda `supabase`):

1. Configurações → WhatsApp → card Evolution → **Conectar**: preencher URL/instância/apikey → "Salvar e testar servidor" → deve responder OK (errar a apikey de propósito → mensagem "chave recusada"; errar a URL → "servidor fora").
2. **Gerar QR code** → escanear com o WhatsApp do número de teste → ver "Celular detectado! Pareando…" → check verde com nome/número → card da lista vira "Conectada".
3. Deixar o QR expirar 4× → overlay "Gerar novo código".
4. **Desconectar** no dialog → card vira "Desconectada" → **Reconectar** abre direto no QR.
5. Enviar uma mensagem de teste pela Central de Atendimento (pipeline Onda 5) e receber uma resposta (webhook configurado automaticamente).
6. Conferir `integration_logs` (Owner) e audit log (`whatsapp_instance_*`).

**Pós-merge (fora deste plano):** bump MINOR v0.87.0 `Socket` via skill `versionamento`.

---

## Self-review (executado na escrita do plano)

- **Cobertura do spec:** parâmetros pela UI ✓ (Task 6 form + Vault), edge proxy ✓ (Task 3), engine + sync ✓ (Tasks 1–2), webhook automático ✓ (action `qr`), mock ✓ (Task 4), modal 3 etapas + microcopy + a11y ✓ (Tasks 5–6), entry points ✓ (Task 7), audit ✓ (Task 3), docs ✓ (Task 8), "já conectado pula QR" ✓ (edge devolve `open` na action `qr` + hook trata), "um ciclo por vez" ✓ (timers atrelados ao accountId do dialog; reabrir reinicia o ciclo).
- **Tipos consistentes entre tasks:** `IEvolutionInstanceTarget`, `IEvolutionPairing`, `ConnectDialogStep`, códigos de erro `EvolutionConnectErrorCode` conferidos entre Tasks 1/3/4/5/6.
- **Sem placeholders:** todo step de código tem o código completo.
