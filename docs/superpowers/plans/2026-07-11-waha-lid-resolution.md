# WAHA — Resolução de `@lid` → telefone real — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolver remetentes `@lid` (identificador de privacidade do WhatsApp) para o telefone real via a API da WAHA antes da resolução de cliente, semear o nome do contato (`pushname`) em clientes novos, e oferecer um backfill one-off (dry-run, cursor-based, Owner-gated) para as conversas já criadas com telefone-fantasma.

**Architecture:** Engine runtime-agnostic ganha `contacts.ts` (`resolveWahaLid` via `GET /api/{session}/lids/{digits}` + `getWahaContactName` via `GET /api/contacts?contactId&session`), espelhado em `_shared/`. `parser.ts` marca `@lid` (novo campo `fromLid` em `IInboundMessage`) em vez de fabricar telefone. `waha-webhook` resolve `@lid`→telefone antes do match de cliente (fail-safe, timeouts curtos) e semeia `full_name`/`whatsapp_name` com o pushname. `waha-connect` ganha a ação Owner-only `backfillLids` (sonda por `/lids`, dry-run default, iteração determinística por cursor). Sem migration.

**Tech Stack:** TypeScript (engine Web-APIs-only), Deno Edge Functions, Supabase (service_role), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-11-waha-lid-resolution-design.md`

## Global Constraints

- **Engine `src/providers/whatsapp/waha/**`** só Web APIs + imports relativos (`../errors` para `WhatsAppProviderError` é o padrão estabelecido). Após mudar o engine: `bun run scripts/sync-whatsapp-shared.ts` e stage do espelho `supabase/functions/_shared/whatsapp/` no mesmo commit. **O sync espelha TODO `.ts` não-teste de `src/providers/whatsapp/` exceto `factory.ts`/`index.ts`** — incluindo `types.ts` e o novo `contacts.ts`. **Nunca editar arquivos do espelho à mão** (header "AUTO-GENERATED MIRROR"; o sync apaga e regrava).
- **`waha-webhook`/`waha-connect` isolados** — nunca importar `_shared/whatsapp/{build,webhook/core,send/core}.ts`.
- **NÃO tocar** nos caminhos congelados do Atendimento (signing de mídia lote #137, realtime, query keys, RPCs gated-once). O backfill escreve em `customers`/`conversations`/`messages` via service_role, mas **fora** desses caminhos.
- **A recepção nunca cai por causa da resolução**: erro no `/lids` ou no contato degrada para o fallback (`lid_unresolved`), jamais derruba o webhook. No webhook, os lookups usam **timeout de 5 s** (não 10 s) para não alargar a janela pré-`markProcessed` além do timeout de entrega/retry da própria WAHA.
- **Toda query do backfill checa `error`** — erro de query vira `HttpError(500)`, nunca prossegue com dados vazios (um 400 engolido viraria relatório falso-limpo). **`.in()` nunca recebe mais que ~200 ids** (lição do incidente "Analytics .in() URL overflow", PRs #154/#158).
- **Sem migration.** Sem segredo no repo.
- **Fatos da API WAHA (da doc oficial; verificação contra o servidor-alvo é gate de smoke no rollout):** `GET /api/{session}/lids/{lid}` → `{ lid, pn }`, onde `{lid}` no path aceita **só os dígitos** (sem `@lid`, sem escape). `GET /api/contacts?contactId={id}&session={s}` aceita `contactId` em formato `@c.us` **ou** `@lid` e retorna `{ id, number, name, pushname, shortName, … }`. Um 404 do `wahaRequest` vira `WhatsAppProviderError` com `code === "NOT_FOUND"` (`errors.ts:35-37`).
- **Gate de CI:** `bun run build` + `bun run test` verdes; `bunx tsc --noEmit` avaliado por delta (baseline ~357 erros pré-existentes).
- **Deploys (rollout, fora das tasks, Owner-gated):** redeploy `waha-webhook` + `waha-connect`.

---

## File Structure

- Create: `src/providers/whatsapp/waha/contacts.ts` — `resolveWahaLid` + `getWahaContactName` (identidade/contato; separado de `session.ts`, que é ciclo de vida).
- Create: `src/providers/whatsapp/waha/contacts.test.ts`
- Modify: `src/providers/whatsapp/types.ts` — `IInboundMessage.fromLid?`.
- Modify: `src/providers/whatsapp/waha/parser.ts` + `parser.test.ts` — detecção `@lid`.
- Mirror (via sync, automático): `supabase/functions/_shared/whatsapp/{types.ts,waha/contacts.ts,waha/parser.ts}`.
- Modify: `supabase/functions/waha-webhook/index.ts` — resolução `@lid` + pushname + fallback.
- Modify: `supabase/functions/waha-connect/index.ts` — ação `backfillLids`.
- Modify: `docs/dev/waha-integration.md`.

---

## Task 1: Engine `contacts.ts` — `resolveWahaLid` + `getWahaContactName` (TDD)

**Files:**
- Create: `src/providers/whatsapp/waha/contacts.ts`
- Create: `src/providers/whatsapp/waha/contacts.test.ts`
- Mirror: `supabase/functions/_shared/whatsapp/waha/contacts.ts` (sync)

**Interfaces:**
- Consumes: `wahaRequest` (`./client`), `WhatsAppProviderError` (`../errors`).
- Produces: `resolveWahaLid(apiKey, fetchFn, { baseUrl, sessionName, lid, timeoutMs? }): Promise<{ phone?: string }>`; `getWahaContactName(apiKey, fetchFn, { baseUrl, sessionName, contactId, timeoutMs? }): Promise<string | undefined>`. Default `timeoutMs` = 10 000; o webhook passa 5 000.

- [ ] **Step 1: Testes falhando.** Crie `src/providers/whatsapp/waha/contacts.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { getWahaContactName, resolveWahaLid } from "./contacts";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const target = { baseUrl: "https://waha.example.com", sessionName: "loja-abc123" };

describe("resolveWahaLid", () => {
  it("GETs /api/{session}/lids/{digits} and converts pn to E.164", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { lid: "67186324430852@lid", pn: "5548999887766@c.us" }));
    const result = await resolveWahaLid("key", fetchFn, { ...target, lid: "67186324430852@lid" });
    expect(fetchFn.mock.calls[0][0]).toBe(
      "https://waha.example.com/api/loja-abc123/lids/67186324430852",
    );
    expect(fetchFn.mock.calls[0][1].method).toBe("GET");
    expect(result.phone).toBe("+5548999887766");
  });

  it("accepts bare digits as the lid input", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { lid: "111@lid", pn: "5511988887777@c.us" }));
    const result = await resolveWahaLid("key", fetchFn, { ...target, lid: "111" });
    expect(fetchFn.mock.calls[0][0]).toBe("https://waha.example.com/api/loja-abc123/lids/111");
    expect(result.phone).toBe("+5511988887777");
  });

  it("returns undefined phone on 404 (unknown lid)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(404, { message: "Not found" }));
    const result = await resolveWahaLid("key", fetchFn, { ...target, lid: "999@lid" });
    expect(result.phone).toBeUndefined();
  });

  it("returns undefined phone when pn is missing/empty", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { lid: "999@lid", pn: "" }));
    const result = await resolveWahaLid("key", fetchFn, { ...target, lid: "999@lid" });
    expect(result.phone).toBeUndefined();
  });

  it("returns undefined phone for an empty-digit lid without calling the server", async () => {
    const fetchFn = vi.fn();
    const result = await resolveWahaLid("key", fetchFn, { ...target, lid: "@lid" });
    expect(result.phone).toBeUndefined();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("propagates auth errors (401)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(401, { message: "Unauthorized" }));
    await expect(resolveWahaLid("bad", fetchFn, { ...target, lid: "1@lid" })).rejects.toThrow(
      "Chave da API WAHA inválida ou ausente",
    );
  });
});

describe("getWahaContactName", () => {
  it("GETs /api/contacts with encoded contactId + session and returns pushname", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { id: "1@lid", pushname: "Zé Peças", name: null }));
    const name = await getWahaContactName("key", fetchFn, { ...target, contactId: "1@lid" });
    expect(fetchFn.mock.calls[0][0]).toBe(
      "https://waha.example.com/api/contacts?contactId=1%40lid&session=loja-abc123",
    );
    expect(name).toBe("Zé Peças");
  });

  it("falls back pushname → name → shortName and trims", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { pushname: "  ", name: " Maria Diesel ", shortName: "M" }));
    const name = await getWahaContactName("key", fetchFn, { ...target, contactId: "2@c.us" });
    expect(name).toBe("Maria Diesel");
  });

  it("returns undefined when no name fields are present", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "3@c.us" }));
    const name = await getWahaContactName("key", fetchFn, { ...target, contactId: "3@c.us" });
    expect(name).toBeUndefined();
  });

  it("returns undefined on ANY error (never throws)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(401, { message: "Unauthorized" }));
    const name = await getWahaContactName("bad", fetchFn, { ...target, contactId: "4@c.us" });
    expect(name).toBeUndefined();
  });
});
```

- [ ] **Step 2: RED.** Run: `bun run test src/providers/whatsapp/waha/contacts.test.ts` — Expected: FAIL (módulo `./contacts` não existe).

- [ ] **Step 3: Implementar** `src/providers/whatsapp/waha/contacts.ts`:

```ts
/**
 * WAHA contact/identity helpers — @lid resolution and contact-name lookup.
 * Consumed server-side by `waha-webhook` (inbound) and `waha-connect`
 * (backfill). Runtime-agnostic: relative imports, Web APIs only.
 */

import { WhatsAppProviderError } from "../errors";
import { wahaRequest } from "./client";

export interface IWahaLidTarget {
  baseUrl: string;
  sessionName: string;
  /** Raw lid — accepts "123@lid" or bare digits. */
  lid: string;
  /** Default 10s; the webhook passes 5s to keep the pre-idempotency window short. */
  timeoutMs?: number;
}

/** `pn` is `<digits>@c.us` — convert to E.164 (mirrors session.ts's meIdToE164). */
function pnToE164(pn: string | undefined): string | undefined {
  const digits = (pn ?? "").split("@")[0]?.replace(/\D/g, "") ?? "";
  return digits.length > 0 ? `+${digits}` : undefined;
}

/**
 * Resolves a WhatsApp @lid (privacy identifier) to the contact's real phone
 * via `GET /api/{session}/lids/{lid}` — the GOWS engine keeps the lid↔phone
 * map. The path segment takes the BARE DIGITS (no "@lid" suffix, no
 * escaping). Returns `{ phone: undefined }` when the server doesn't know the
 * lid (404 or empty `pn`) — callers treat that as "unresolved" and fall
 * back. Other errors (auth, network, 5xx) propagate.
 */
export async function resolveWahaLid(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaLidTarget,
): Promise<{ phone?: string }> {
  const digits = target.lid.split("@")[0]?.replace(/\D/g, "") ?? "";
  if (digits.length === 0) return { phone: undefined };
  try {
    const response = await wahaRequest(apiKey, fetchFn, {
      baseUrl: target.baseUrl,
      path: `/api/${target.sessionName}/lids/${digits}`,
      method: "GET",
      timeoutMs: target.timeoutMs ?? 10_000,
    });
    const body = response.body as { pn?: string } | null;
    return { phone: pnToE164(body?.pn) };
  } catch (err) {
    if (err instanceof WhatsAppProviderError && err.code === "NOT_FOUND") {
      return { phone: undefined };
    }
    throw err;
  }
}

/**
 * Best-effort contact display name via
 * `GET /api/contacts?contactId={id}&session={name}` (accepts `@c.us` AND
 * `@lid` ids). Tries `pushname`, then `name`, then `shortName` — each
 * trimmed; whitespace-only values are skipped. Returns `undefined` when no
 * usable name exists and NEVER throws: a missing name must not break
 * reception.
 */
export async function getWahaContactName(
  apiKey: string,
  fetchFn: typeof fetch,
  target: { baseUrl: string; sessionName: string; contactId: string; timeoutMs?: number },
): Promise<string | undefined> {
  try {
    const query = `contactId=${encodeURIComponent(target.contactId)}&session=${encodeURIComponent(target.sessionName)}`;
    const response = await wahaRequest(apiKey, fetchFn, {
      baseUrl: target.baseUrl,
      path: `/api/contacts?${query}`,
      method: "GET",
      timeoutMs: target.timeoutMs ?? 10_000,
    });
    const body = response.body as {
      pushname?: string | null;
      name?: string | null;
      shortName?: string | null;
    } | null;
    for (const candidate of [body?.pushname, body?.name, body?.shortName]) {
      const trimmed = (candidate ?? "").trim();
      if (trimmed.length > 0) return trimmed;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 4: GREEN.** Run: `bun run test src/providers/whatsapp/waha/contacts.test.ts` — Expected: PASS (10/10).

- [ ] **Step 5: Sync + suite.** Run: `bun run scripts/sync-whatsapp-shared.ts` (confere `supabase/functions/_shared/whatsapp/waha/contacts.ts` criado com header de mirror). Run: `bun run test` (suíte toda verde) e `bun run build`.

- [ ] **Step 6: Commit.**

```bash
git add src/providers/whatsapp/waha/contacts.ts src/providers/whatsapp/waha/contacts.test.ts supabase/functions/_shared/whatsapp/
git commit -m "feat(waha): lid->phone resolution + contact-name lookup engine"
```

---

## Task 2: Parser — detecção `@lid` (TDD)

**Files:**
- Modify: `src/providers/whatsapp/types.ts:128-136` (`IInboundMessage`)
- Modify: `src/providers/whatsapp/waha/parser.ts`
- Modify: `src/providers/whatsapp/waha/parser.test.ts`
- Mirror (via sync, automático): `supabase/functions/_shared/whatsapp/types.ts` **e** `supabase/functions/_shared/whatsapp/waha/parser.ts` — o sync espelha ambos; basta rodá-lo e stagear. Nunca editar o espelho à mão.

**Interfaces:**
- Consumes: `IInboundMessage` (`../types`).
- Produces: `IInboundMessage.fromLid?: string`; comportamento do parser: `@lid` ⇒ `fromPhone: ""` + `fromLid: "<jid cru>"`; `@c.us` ⇒ inalterado (`fromLid` ausente).

- [ ] **Step 1: Tipo.** Em `src/providers/whatsapp/types.ts`, dentro de `IInboundMessage`, logo após `fromPhone: string;` (linha ~132) adicione:

```ts
  /**
   * WhatsApp @lid privacy identifier (`<digits>@lid`) — set (with fromPhone
   * empty) when the sender hides their phone number. Consumers resolve it to
   * the real phone via the provider (WAHA `GET /{session}/lids/{lid}`)
   * BEFORE customer matching.
   */
  fromLid?: string;
```

E ajuste o doc-comment de `fromPhone` para: `/** Sender phone in E.164. Empty when the sender arrived as an @lid (see fromLid). */`

- [ ] **Step 2: Testes falhando.** Em `parser.test.ts` adicione:

```ts
  it("marks an @lid sender as fromLid and leaves fromPhone empty", () => {
    const result = parseWahaMessageEvent(
      {
        id: "id6",
        timestamp: 1720000005,
        from: "67186324430852@lid",
        fromMe: false,
        to: "5511999998888@c.us",
        body: "oi",
        hasMedia: false,
      },
      accountId,
    );
    if (result.type !== "message") throw new Error("expected message");
    expect(result.fromPhone).toBe("");
    expect(result.fromLid).toBe("67186324430852@lid");
  });

  it("does not set fromLid for a regular @c.us sender", () => {
    const result = parseWahaMessageEvent(
      {
        id: "id7",
        timestamp: 1720000006,
        from: "5511988887777@c.us",
        fromMe: false,
        to: "5511999998888@c.us",
        body: "oi",
        hasMedia: false,
      },
      accountId,
    );
    if (result.type !== "message") throw new Error("expected message");
    expect(result.fromPhone).toBe("+5511988887777");
    expect(result.fromLid).toBeUndefined();
  });
```

- [ ] **Step 3: RED.** Run: `bun run test src/providers/whatsapp/waha/parser.test.ts` — Expected: FAIL (`fromPhone` vem `+67186324430852` e `fromLid` undefined).

- [ ] **Step 4: Implementar.** Em `parser.ts`: adicione a constante após `NON_INDIVIDUAL_JID` (linha 13):

```ts
const LID_JID = /@lid$/;
```

No branch inbound de `parseWahaMessageEvent` (o `return` da linha ~101), substitua `fromPhone: jidToE164(payload.from),` por:

```ts
    // A sender behind WhatsApp's privacy setting arrives as `<digits>@lid` —
    // NOT a phone. Blindly converting those digits fabricates an impossible
    // "+phone", so surface the raw lid instead and let the webhook resolve it.
    fromPhone: LID_JID.test(payload.from ?? "") ? "" : jidToE164(payload.from),
    fromLid: LID_JID.test(payload.from ?? "") ? payload.from : undefined,
```

Atualize o doc-comment do topo do arquivo (linhas 4-6) mencionando que `@lid` é aceito como 1:1 e sinalizado via `fromLid`. (O branch `fromMe`/echo fica inalterado — echoes são descartados pelo webhook na fase atual.)

- [ ] **Step 5: GREEN + sync + suite.** Run: `bun run test src/providers/whatsapp/waha/parser.test.ts` (7/7). Run: `bun run scripts/sync-whatsapp-shared.ts` e confirme que os espelhos `_shared/whatsapp/types.ts` e `_shared/whatsapp/waha/parser.ts` refletiram a mudança. Run: `bun run test` + `bun run build`.

- [ ] **Step 6: Commit.**

```bash
git add src/providers/whatsapp/types.ts src/providers/whatsapp/waha/parser.ts src/providers/whatsapp/waha/parser.test.ts supabase/functions/_shared/whatsapp/
git commit -m "feat(waha): parser surfaces @lid senders instead of fabricating a phone"
```

---

## Task 3: Webhook — resolver `@lid` + semear pushname + fallback

**Files:**
- Modify: `supabase/functions/waha-webhook/index.ts`

**Interfaces:**
- Consumes: `resolveWahaLid`/`getWahaContactName` (`../_shared/whatsapp/waha/contacts.ts`), `parsed.fromLid` (Task 2).
- Produces: mensagens `@lid` entram com telefone real + nome; fallback com tag `lid_unresolved` e rótulo pt-BR (nunca os dígitos do lid como nome).

> ⚠️ Deno — sem harness local. Gate = releitura completa + `bun run build` + smoke pós-deploy. NÃO deployar sem OK do dono.

- [ ] **Step 1: Import.** Adicione:

```ts
import { getWahaContactName, resolveWahaLid } from "../_shared/whatsapp/waha/contacts.ts";
```

- [ ] **Step 2: Helper de apiKey memoizado.** Declare **após** o bloco de resolução do servidor (depois da linha ~109; o helper referencia `server`):

```ts
  // Server API key, resolved lazily and at most once per invocation — the
  // hot path (text message from a known customer) never pays the Vault read.
  // `resolveSecret` returns `string | undefined`; coalesce to null so the
  // undefined sentinel below means "not fetched yet" and a missing key
  // latches as null (memoized) instead of re-fetching forever.
  let apiKeyMemo: string | null | undefined;
  async function getApiKey(): Promise<string | null> {
    if (apiKeyMemo === undefined) {
      apiKeyMemo = (await resolveSecret(String(server.api_key_ref))) ?? null;
    }
    return apiKeyMemo;
  }
```

- [ ] **Step 3: Resolução `@lid`.** Substitua o bloco atual (linhas ~209-214):

```ts
  const fromPhone = parsed.fromPhone;
  if (!fromPhone) {
    await markProcessed();
    return json({ ok: true, ignored: "no-phone" }, 200);
  }
  const phoneDigits = fromPhone.replace(/\D/g, "");
```

por:

```ts
  // ===== @lid resolution (privacy id → real phone) ===========================
  // A sender behind WhatsApp's privacy setting arrives as `<digits>@lid`, not
  // `<phone>@c.us`. GOWS keeps the lid↔phone map — resolve BEFORE customer
  // matching so dedup and display use the real number. Fail-safe: a resolution
  // error degrades to the unresolved fallback below, never dropping the
  // message. Short timeout (5s): this runs before markProcessed, and a slow
  // lookup here must not outlast WAHA's own webhook-delivery timeout/retry.
  const sessionName = String(
    (accountRow.provider_config as Record<string, unknown> | null)?.sessionName ?? "",
  );
  const wahaBaseUrl = String(server.base_url ?? "").replace(/\/+$/, "");

  let fromPhone = parsed.fromPhone;
  let lidUnresolved = false;
  if (!fromPhone && parsed.fromLid) {
    try {
      const apiKey = await getApiKey();
      if (!apiKey) throw new Error("missing server api key");
      const { phone } = await resolveWahaLid(apiKey, globalThis.fetch, {
        baseUrl: wahaBaseUrl,
        sessionName,
        lid: parsed.fromLid,
        timeoutMs: 5_000,
      });
      if (phone) fromPhone = phone;
    } catch (err) {
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "waha webhook: lid resolution failed",
          lid: parsed.fromLid,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
    if (!fromPhone) {
      // Unresolved lid: keep a stable placeholder derived from the lid digits
      // so the conversation still threads (same digits ⇒ same customer), but
      // tag the customer for triage — the digits are NEVER a validated phone
      // and are NEVER shown as the display name (see the insert below).
      const lidDigits = parsed.fromLid.split("@")[0]?.replace(/\D/g, "") ?? "";
      if (!lidDigits) {
        await markProcessed();
        return json({ ok: true, ignored: "no-phone" }, 200);
      }
      fromPhone = `+${lidDigits}`;
      lidUnresolved = true;
    }
  }
  if (!fromPhone) {
    await markProcessed();
    return json({ ok: true, ignored: "no-phone" }, 200);
  }
  const phoneDigits = fromPhone.replace(/\D/g, "");
```

- [ ] **Step 4: Semear o nome no cliente novo.** No branch `if (!customerId)` (linhas ~229-257), antes do `insert`, adicione:

```ts
    // Seed the display name from the WhatsApp contact (pushname) — best-effort,
    // one extra GET only on the new-customer path. The lid id is the known-good
    // identity when present (the contacts endpoint accepts @lid directly).
    let contactName: string | undefined;
    try {
      const apiKey = await getApiKey();
      if (apiKey) {
        contactName = await getWahaContactName(apiKey, globalThis.fetch, {
          baseUrl: wahaBaseUrl,
          sessionName,
          contactId: parsed.fromLid ?? `${phoneDigits}@c.us`,
          timeoutMs: 5_000,
        });
      }
    } catch {
      /* name is decorative — never blocks the insert */
    }
```

E no objeto do `insert`, troque:
- `full_name: fromPhone, // WAHA v1 has no contact-name field to seed from; phone is the placeholder` →

```ts
        // Display label decision (spec §5 risk 3): an unresolved lid must NEVER
        // surface its digits as a name — fall back to a pt-BR label instead.
        full_name: contactName ?? (lidUnresolved ? "Contato do WhatsApp (número oculto)" : fromPhone),
```

- `whatsapp_name: null,` → `whatsapp_name: contactName ?? null,`
- `tags: ["pending_review"],` → `tags: lidUnresolved ? ["pending_review", "lid_unresolved"] : ["pending_review"],`

- [ ] **Step 5: Reusar o apiKey no passo de mídia.** No bloco de mídia (linhas ~357-361), troque `const apiKey = await resolveSecret(String(server.api_key_ref));` por `const apiKey = await getApiKey();` (o guard `if (!apiKey) throw …` permanece).

- [ ] **Step 6: Releitura + build.** Releia o arquivo inteiro conferindo: imports resolvem contra o `_shared` real; `getApiKey` declarado após `server` existir; **todo caminho terminal chama `markProcessed()` exatamente como antes** (os novos early-returns de `no-phone` chamam; nenhum caminho novo perde a marca nem marca sem persistir); o fluxo `@c.us` (sem `fromLid`) é comportamentalmente idêntico ao anterior exceto pelo seed de nome. Run: `bun run build` (frontend intacto).

- [ ] **Step 7: Commit.**

```bash
git add supabase/functions/waha-webhook/index.ts
git commit -m "feat(waha): webhook resolves @lid senders to the real phone + seeds pushname"
```

---

## Task 4: `waha-connect` — ação Owner-only `backfillLids` (dry-run default, cursor-based)

**Files:**
- Modify: `supabase/functions/waha-connect/index.ts`

**Interfaces:**
- Consumes: `resolveWahaLid`/`getWahaContactName` (`../_shared/whatsapp/waha/contacts.ts`), `getWahaSessionStatus` (já importado), `resolveSecret`, `bestEffortAudit`, `fetchFn`/`actorId`/`ctx` (já no escopo).
- Produces: `POST { action: "backfillLids", storeId, dryRun?: boolean, cursor?: string }` → `{ ok, dryRun, probed, resolved, updatedInPlace, merged, failures, skipped, remaining, nextCursor, entries, traceId }`. **Iteração determinística:** ids ordenados; re-rodar passando `cursor: nextCursor` até `nextCursor: null`.

> ⚠️ Deno — sem harness local. Gate = releitura + `bun run build` + dry-run real pós-deploy (Owner). `dryRun` **default TRUE** — escrever exige `dryRun: false` explícito.

- [ ] **Step 1: ACTIONS + body + JSDoc.** Adicione `"backfillLids"` ao array `ACTIONS`; amplie o tipo do `body` com `dryRun?: boolean;` e `cursor?: string;`; atualize o JSDoc de `Input` com `{ storeId, dryRun?, cursor?, action: 'backfillLids' }` e a string de erro de ação inválida para incluir `backfillLids`.

- [ ] **Step 2: Imports.** Adicione `resolveWahaLid` e `getWahaContactName` de `../_shared/whatsapp/waha/contacts.ts`. (`getWahaSessionStatus` já está importado.)

- [ ] **Step 3: Handler.** Insira o bloco após o handler de `ping` (é store-scoped como `create`/`ping`, antes da seção que exige `accountId`):

```ts
  if (action === "backfillLids") {
    if (!body.storeId) throw new HttpError(422, "storeId é obrigatório");
    const dryRun = body.dryRun !== false; // writes require an explicit dryRun:false
    const cursor = typeof body.cursor === "string" ? body.cursor : "";

    // 1) WAHA accounts of the store + per-server credentials (resolved once).
    const { data: wahaAccounts, error: accErr } = await admin
      .from("whatsapp_accounts")
      .select("id, provider_config, waha_server_id")
      .eq("provider", "waha")
      .eq("store_id", body.storeId);
    if (accErr) throw new HttpError(500, `backfillLids: falha ao listar contas — ${accErr.message}`);
    const accounts = (wahaAccounts ?? []) as Array<{
      id: string;
      provider_config: Record<string, unknown> | null;
      waha_server_id: string | null;
    }>;
    const emptyReport = {
      ok: true,
      dryRun,
      probed: 0,
      resolved: 0,
      updatedInPlace: 0,
      merged: 0,
      failures: 0,
      skipped: 0,
      remaining: 0,
      nextCursor: null as string | null,
      entries: [] as Array<Record<string, unknown>>,
      traceId: ctx.traceId,
    };
    if (accounts.length === 0) return json(emptyReport, 200);

    const serverIds = [
      ...new Set(accounts.map((a) => a.waha_server_id).filter(Boolean)),
    ] as string[];
    const { data: serverRows, error: srvErr } = await admin
      .from("waha_servers")
      .select("id, base_url, api_key_ref")
      .in("id", serverIds);
    if (srvErr) throw new HttpError(500, `backfillLids: falha ao listar servidores — ${srvErr.message}`);
    const credsByServer = new Map<string, { baseUrl: string; apiKey: string }>();
    for (const s of serverRows ?? []) {
      const key = await resolveSecret(String(s.api_key_ref ?? ""));
      if (key) {
        credsByServer.set(String(s.id), {
          baseUrl: String(s.base_url ?? "").replace(/\/+$/, ""),
          apiKey: key,
        });
      }
    }
    const accountById = new Map(accounts.map((a) => [a.id, a]));

    // Session pre-check: a deleted/renamed session 404s on EVERY probe, which
    // would masquerade as "all phones are real". Accounts whose session is not
    // WORKING are excluded; their customers are counted as skipped.
    const liveAccounts = new Set<string>();
    const deadReason = new Map<string, string>();
    for (const acct of accounts) {
      const creds = acct.waha_server_id ? credsByServer.get(acct.waha_server_id) : undefined;
      const session = String(acct.provider_config?.sessionName ?? "");
      if (!creds || !session) {
        deadReason.set(acct.id, "credenciais/sessão ausentes");
        continue;
      }
      try {
        const { state } = await getWahaSessionStatus(creds.apiKey, fetchFn, {
          baseUrl: creds.baseUrl,
          sessionName: session,
        });
        if (state === "WORKING") liveAccounts.add(acct.id);
        else deadReason.set(acct.id, `sessão ${state}`);
      } catch (err) {
        deadReason.set(acct.id, err instanceof Error ? err.message : String(err));
      }
    }

    // 2) Candidate customers: distinct customer_id of ALL conversations on the
    // WAHA accounts — DRAINED with a pagination loop (a single capped read
    // would silently truncate coverage; cf. the drainPaged lesson, PR #158).
    // The .in() here holds only a handful of account ids — no URL risk.
    const accountByCustomer = new Map<string, string>();
    const PAGE = 1000;
    for (let offset = 0; ; offset += PAGE) {
      const { data: convRows, error: convListErr } = await admin
        .from("conversations")
        .select("customer_id, whatsapp_account_id")
        .in("whatsapp_account_id", accounts.map((a) => a.id))
        .not("customer_id", "is", null)
        .order("id", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (convListErr) {
        throw new HttpError(500, `backfillLids: falha ao listar conversas — ${convListErr.message}`);
      }
      for (const row of convRows ?? []) {
        const cid = String(row.customer_id);
        const acctId = String(row.whatsapp_account_id);
        const current = accountByCustomer.get(cid);
        // Prefer probing through a LIVE account when the customer spans several.
        if (!current || (liveAccounts.has(acctId) && !liveAccounts.has(current))) {
          accountByCustomer.set(cid, acctId);
        }
      }
      if ((convRows ?? []).length < PAGE) break;
    }

    // 3) Deterministic cursor iteration: sorted ids, resume strictly after
    // `cursor`. Re-running with the returned nextCursor advances the window —
    // a full sweep terminates in ceil(N/CAP) runs regardless of outcomes.
    const allIds = [...accountByCustomer.keys()].sort();
    const pending = cursor ? allIds.filter((id) => id > cursor) : allIds;
    const CAP = 200;
    const batchIds = pending.slice(0, CAP);
    const remaining = Math.max(0, pending.length - batchIds.length);
    const nextCursor = remaining > 0 ? (batchIds[batchIds.length - 1] ?? null) : null;
    if (batchIds.length === 0) return json({ ...emptyReport, remaining, nextCursor }, 200);

    // ≤200 UUIDs ≈ 7.5 KB of query string — safely under the gateway URL limit
    // (the 1000-id .in() variant reproduces the PR #154 overflow incident).
    const { data: customerRows, error: custErr } = await admin
      .from("customers")
      .select("id, phone, full_name, tags")
      .in("id", batchIds);
    if (custErr) throw new HttpError(500, `backfillLids: falha ao carregar clientes — ${custErr.message}`);
    const customers = (
      (customerRows ?? []) as Array<{
        id: string;
        phone: string | null;
        full_name: string | null;
        tags: string[] | null;
      }>
    ).sort((a, b) => (a.id < b.id ? -1 : 1));

    let probed = 0;
    let resolved = 0;
    let updatedInPlace = 0;
    let merged = 0;
    let failures = 0;
    let skipped = 0;
    const entries: Array<Record<string, unknown>> = [];
    // Dry-run/apply consistency: phones this run would write. A second ghost
    // resolving to the same real phone must be reported as the MERGE the apply
    // run would perform (the first ghost's phone is already taken by then).
    const plannedPhoneOwner = new Map<string, string>(); // realDigits -> customerId

    for (const cust of customers) {
      const digits = String(cust.phone ?? "").replace(/\D/g, "");
      const acct = accountById.get(accountByCustomer.get(cust.id) ?? "");
      const creds = acct?.waha_server_id ? credsByServer.get(acct.waha_server_id) : undefined;
      const probeSession = String(acct?.provider_config?.sessionName ?? "");
      if (digits.length === 0 || !acct || !creds || !probeSession || !liveAccounts.has(acct.id)) {
        skipped += 1;
        entries.push({
          customerId: cust.id,
          action: "skipped",
          reason:
            digits.length === 0
              ? "telefone vazio"
              : (acct && deadReason.get(acct.id)) ?? "credenciais/sessão ausentes",
        });
        continue;
      }

      let realPhone: string | undefined;
      try {
        probed += 1;
        realPhone = (
          await resolveWahaLid(creds.apiKey, fetchFn, {
            baseUrl: creds.baseUrl,
            sessionName: probeSession,
            lid: digits,
          })
        ).phone;
      } catch (err) {
        failures += 1;
        entries.push({
          customerId: cust.id,
          action: "probe-failed",
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
      if (!realPhone) continue; // 404/empty ⇒ it was a real phone — leave alone
      const realDigits = realPhone.replace(/\D/g, "");
      if (realDigits === digits) continue; // identity — not a lid
      resolved += 1;

      // Existing customer already on the REAL phone? Consult the planned map
      // first (dry-run parity), then the DB (same match as the webhook).
      let realId = plannedPhoneOwner.get(realDigits);
      if (!realId) {
        const { data: cands, error: candErr } = await admin
          .from("customers")
          .select("id, phone")
          .eq("store_id", body.storeId)
          .neq("id", cust.id)
          .like("phone", `%${realDigits.slice(-8)}`);
        if (candErr) {
          failures += 1;
          entries.push({ customerId: cust.id, action: "match-failed", error: candErr.message });
          continue;
        }
        realId = (cands ?? []).find(
          (c) => String(c.phone).replace(/\D/g, "") === realDigits,
        )?.id as string | undefined;
      }

      if (!realId) {
        const contactName = await getWahaContactName(creds.apiKey, fetchFn, {
          baseUrl: creds.baseUrl,
          sessionName: probeSession,
          contactId: `${digits}@lid`,
        });
        const patch: Record<string, unknown> = { phone: realPhone };
        // Only replace placeholder names (name === old phone); never clobber a
        // human-edited name.
        if (String(cust.full_name ?? "") === String(cust.phone ?? "")) {
          patch.full_name = contactName ?? realPhone;
        }
        if ((cust.tags ?? []).includes("lid_unresolved")) {
          patch.tags = (cust.tags ?? []).filter((t) => t !== "lid_unresolved");
        }
        if (!dryRun) {
          const { error } = await admin.from("customers").update(patch).eq("id", cust.id);
          if (error) {
            failures += 1;
            entries.push({ customerId: cust.id, action: "update-failed", error: error.message });
            continue;
          }
        }
        plannedPhoneOwner.set(realDigits, cust.id);
        updatedInPlace += 1;
        entries.push({ customerId: cust.id, action: "update", from: cust.phone, to: realPhone });
      } else {
        if (!dryRun) {
          // Crash-safe order: messages first, conversations LAST before the
          // delete — while conversations still point at the ghost, ANY partial
          // failure leaves it discoverable by a re-run (candidacy derives from
          // conversations). Each step checks its own error and aborts.
          const { error: msgErr } = await admin
            .from("messages")
            .update({ author_id: realId })
            .eq("author_id", cust.id)
            .eq("author_type", "customer");
          if (msgErr) {
            failures += 1;
            entries.push({ customerId: cust.id, action: "merge-failed", step: "messages", error: msgErr.message });
            continue;
          }
          const { error: convErr } = await admin
            .from("conversations")
            .update({ customer_id: realId })
            .eq("customer_id", cust.id);
          if (convErr) {
            failures += 1;
            entries.push({ customerId: cust.id, action: "merge-failed", step: "conversations", error: convErr.message });
            continue;
          }
          const { error: delErr } = await admin.from("customers").delete().eq("id", cust.id);
          if (delErr) {
            // FK-linked data elsewhere (lead/order/note) — keep the ghost row, report.
            merged += 1;
            entries.push({ customerId: cust.id, action: "merged-ghost-kept", into: realId, reason: delErr.message });
            continue;
          }
        }
        merged += 1;
        entries.push({ customerId: cust.id, action: "merge", into: realId, from: cust.phone, to: realPhone });
      }
    }

    if (!dryRun && actorId) {
      await bestEffortAudit(admin, {
        store_id: body.storeId,
        actor_id: actorId,
        action: "whatsapp_lid_backfill",
        resource: "whatsapp_account",
        resource_id: accounts[0]?.id ?? "",
        after: { probed, resolved, updatedInPlace, merged, failures, skipped, remaining, nextCursor },
      });
    }
    // Full entries — the dry-run review gate needs EVERY planned change
    // (≤ CAP+skips small objects; payload is negligible).
    return json(
      {
        ok: true,
        dryRun,
        probed,
        resolved,
        updatedInPlace,
        merged,
        failures,
        skipped,
        remaining,
        nextCursor,
        entries,
        traceId: ctx.traceId,
      },
      200,
    );
  }
```

- [ ] **Step 4: Releitura + build.** Releia o arquivo inteiro: `ACTIONS`/JSDoc/string de erro consistentes, imports resolvem (`getWahaSessionStatus` já importado; `resolveWahaLid`/`getWahaContactName` novos), o handler vem ANTES da seção `accountId`-required, **toda query checa `error`**, nada além do handler mudou. Run: `bun run build`.

- [ ] **Step 5: Commit.**

```bash
git add supabase/functions/waha-connect/index.ts
git commit -m "feat(waha): backfillLids action — cursor-based probe backfill with dry-run default"
```

---

## Task 5: Docs

**Files:**
- Modify: `docs/dev/waha-integration.md`

- [ ] **Step 1: Documentar.** Na seção do `waha-webhook`: subsection sobre `@lid` (o que é, resolução via `/lids/{digits}` antes do match de cliente com timeout 5 s, seed de `pushname` em cliente novo, fallback `lid_unresolved` com rótulo "Contato do WhatsApp (número oculto)" — nunca os dígitos como nome). Na seção do `waha-connect`: a ação `backfillLids` (`{ storeId, dryRun?, cursor? }`, **dry-run default**, sonda idempotente por `/lids`, pré-check de sessão WORKING, update-in-place vs merge crash-safe (messages→conversations→delete), CAP 200/execução com `nextCursor` — re-rodar passando o cursor até `null`, contadores `skipped`/`failures`, entries completos no dry-run, audit `whatsapp_lid_backfill`). Documentar a divergência residual dry-run×apply: dois fantasmas resolvendo pro mesmo telefone são reportados via o mapa de telefones planejados (paridade), e um `resolved: 0` com fantasmas conhecidos presentes indica problema no endpoint `/lids` do servidor — investigar antes de `dryRun:false`. Reforçar a regra sync+redeploy (agora também `waha-webhook`).

- [ ] **Step 2: Commit.**

```bash
git add docs/dev/waha-integration.md
git commit -m "docs(waha): document @lid resolution + backfillLids action"
```

---

## Rollout (pós-plano, fora das tasks — Owner-gated)

1. Redeploy **`waha-webhook`** + **`waha-connect`** (confirmar com o dono; `npx supabase functions deploy <fn> --project-ref njizaasajkdqptlxddqn`).
2. **Smoke A (endpoint `/lids` contra o servidor real):** rodar `backfillLids` com `dryRun:true` — com os fantasmas `@lid` conhecidos presentes (os "+6718…"), o relatório DEVE mostrar `resolved > 0`. `resolved: 0` aqui significa que o shape do endpoint não bate com o servidor-alvo (investigar `/lids/{digits}` vs forma encoded `%40lid` antes de qualquer `dryRun:false`).
3. **Smoke B (recepção):** mensagem nova de um contato `@lid` deve entrar com telefone real + nome (pushname); contato normal `@c.us` inalterado (agora com nome).
4. **Backfill:** dry-run (`cursor` vazio) → revisar TODOS os `entries` com o dono → `dryRun:false` → repetir passando `cursor: nextCursor` até `nextCursor: null` → conferir a Inbox (os "+6718…" viram telefones reais / clientes mesclados).
