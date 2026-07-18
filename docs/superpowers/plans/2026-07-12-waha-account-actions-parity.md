# WAHA Account Actions Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the WAHA session card the same 5 action buttons the Meta/Evolution card has — Verificar agora, Mensagem de teste, Importar conversas, Sincronizar fotos, Conexão — without touching the Evolution pipeline that already runs in production.

**Architecture:** Session-lifecycle actions (Verificar agora, Conexão, Mensagem de teste) are new actions/UI on top of the already-isolated `waha-connect` edge. Import + avatar sync are new `provider === 'waha'` branches inside the ALREADY-SHARED `whatsapp-import-history`/`whatsapp-avatar-sync` edges (which already branch `evolution` vs `evolution-go`), landing through the existing engine-agnostic `landNormalizedChat`/`syncContactAvatar` helpers.

**Tech Stack:** React 19 + TanStack Query, shadcn/ui, Vitest (TDD for engine files), Supabase Edge Functions (Deno), the mirrored `src/providers/whatsapp/**` ⇄ `supabase/functions/_shared/whatsapp/**` engine tree.

## Global Constraints

- **Zero migration.** Nothing here changes the DB schema.
- **Zero behavior change to the Evolution/Evolution-Go branches** of `whatsapp-import-history` and `whatsapp-avatar-sync` — only new `provider === 'waha'` branches are added.
- **`waha-connect`/`waha-webhook`/`waha-send` stay isolated** — no import of `_shared/whatsapp/build.ts`, `webhook/core.ts` or `send/core.ts`.
- **Engine files under `src/providers/whatsapp/**` are runtime-agnostic** (Web APIs + relative imports only). Any change there requires running `bun run scripts/sync-whatsapp-shared.ts` before the edge functions that consume the new/changed exports can see them.
- **pt-BR with correct accents** in all user-facing strings; code/comments in English.
- **No hardcoded hex/`--gallo-*`** in any new UI — semantic tokens only (`bg-card`, `text-foreground`, `border-border`, `text-severity-*`).
- Test message text (verbatim, must match Evolution's): `"✅ Mensagem de teste — GALLO Base Diesel. A conexão WhatsApp desta conta está funcionando."`
- A missing `fromMe` on a WAHA history record defaults to `false` (inbound) — never throw.
- Message import status is DERIVED, no ack lookup: `direction === "out" → "sent"`, `direction === "in" → "delivered"`.

---

### Task 1: Engine — `waha/history.ts` REST wrappers + `parser.ts` exports

**Files:**
- Modify: `src/providers/whatsapp/waha/parser.ts`
- Create: `src/providers/whatsapp/waha/history.ts`
- Test: `src/providers/whatsapp/waha/history.test.ts`

**Interfaces:**
- Consumes: `wahaRequest` from `./client`, `IWahaSessionTarget` from `./session`, `IWahaMessagePayload` from `./parser`.
- Produces: `fetchWahaChatsPage(apiKey, fetchFn, target, offset, limit): Promise<{id: string}[]>`, `fetchWahaChatMessagesPage(apiKey, fetchFn, target, chatId, offset, limit): Promise<IWahaMessagePayload[]>` — consumed by Task 2. `parser.ts` newly exports `contentTypeFromMimetype`, `IParsedContent`, `extractContent`, `jidToE164` — consumed by Task 2.

- [ ] **Step 1: Export the 4 currently-private helpers in `parser.ts` (no behavior change)**

In `src/providers/whatsapp/waha/parser.ts`, add the `export` keyword to these 4 existing declarations (do not change their bodies):

```ts
export function contentTypeFromMimetype(mimetype: string | undefined): InboundContentType {
```
```ts
export interface IParsedContent {
```
```ts
export function extractContent(payload: IWahaMessagePayload): IParsedContent {
```
```ts
export function jidToE164(jid: string | undefined): string {
```

- [ ] **Step 2: Run the existing parser suite to confirm zero regression**

Run: `bun run test src/providers/whatsapp/waha/parser.test.ts`
Expected: all 9 existing tests still PASS (exporting a function changes nothing at runtime).

- [ ] **Step 3: Write the failing tests for the new REST wrappers**

Create `src/providers/whatsapp/waha/history.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { fetchWahaChatMessagesPage, fetchWahaChatsPage } from "./history";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const target = { baseUrl: "https://waha.example.com", sessionName: "loja-abc123" };

describe("fetchWahaChatsPage", () => {
  it("GETs /api/{session}/chats with limit+offset and returns chat ids", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, [{ id: "5548999887766@c.us", name: "Zé" }, { id: "999@g.us" }]),
      );
    const rows = await fetchWahaChatsPage("key", fetchFn, target, 0, 100);
    expect(fetchFn.mock.calls[0][0]).toBe(
      "https://waha.example.com/api/loja-abc123/chats?limit=100&offset=0",
    );
    expect(rows).toEqual([{ id: "5548999887766@c.us" }, { id: "999@g.us" }]);
  });

  it("drops rows with no id and returns [] on a non-array body", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { notAnArray: true }));
    const rows = await fetchWahaChatsPage("key", fetchFn, target, 0, 100);
    expect(rows).toEqual([]);
  });
});

describe("fetchWahaChatMessagesPage", () => {
  it("GETs /api/{session}/chats/{chatId}/messages with limit+offset, encoding the chatId", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, [
          { id: "abc", timestamp: 1720000000, from: "5548999887766@c.us", fromMe: false, body: "oi" },
        ]),
      );
    const rows = await fetchWahaChatMessagesPage("key", fetchFn, target, "5548999887766@c.us", 0, 100);
    expect(fetchFn.mock.calls[0][0]).toBe(
      "https://waha.example.com/api/loja-abc123/chats/5548999887766%40c.us/messages?limit=100&offset=0",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("abc");
  });

  it("returns [] on a non-array body", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, null));
    const rows = await fetchWahaChatMessagesPage("key", fetchFn, target, "1@c.us", 0, 100);
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `bun run test src/providers/whatsapp/waha/history.test.ts`
Expected: FAIL — `Cannot find module './history'` (file doesn't exist yet).

- [ ] **Step 5: Create `src/providers/whatsapp/waha/history.ts`**

```ts
/**
 * WAHA chat/message history REST wrappers — thin per-endpoint functions only
 * (mirrors session.ts/contacts.ts's style). Classification, normalization and
 * batching for the history importer live in
 * `src/providers/whatsapp/import/waha-history-core.ts`.
 */

import { wahaRequest } from "./client";
import type { IWahaSessionTarget } from "./session";
import type { IWahaMessagePayload } from "./parser";

export interface IWahaChatSummary {
  id: string;
}

/** One page of `GET /api/{session}/chats`. */
export async function fetchWahaChatsPage(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaSessionTarget,
  offset: number,
  limit: number,
): Promise<IWahaChatSummary[]> {
  const response = await wahaRequest(apiKey, fetchFn, {
    baseUrl: target.baseUrl,
    path: `/api/${target.sessionName}/chats?limit=${limit}&offset=${offset}`,
    method: "GET",
    timeoutMs: 15_000,
  });
  const body = Array.isArray(response.body) ? response.body : [];
  return body
    .map((row) => ({ id: String((row as { id?: string })?.id ?? "") }))
    .filter((row) => row.id.length > 0);
}

/** One page of `GET /api/{session}/chats/{chatId}/messages`. */
export async function fetchWahaChatMessagesPage(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaSessionTarget,
  chatId: string,
  offset: number,
  limit: number,
): Promise<IWahaMessagePayload[]> {
  const response = await wahaRequest(apiKey, fetchFn, {
    baseUrl: target.baseUrl,
    path: `/api/${target.sessionName}/chats/${encodeURIComponent(chatId)}/messages?limit=${limit}&offset=${offset}`,
    method: "GET",
    timeoutMs: 15_000,
  });
  return Array.isArray(response.body) ? (response.body as IWahaMessagePayload[]) : [];
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `bun run test src/providers/whatsapp/waha/history.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add src/providers/whatsapp/waha/parser.ts src/providers/whatsapp/waha/history.ts src/providers/whatsapp/waha/history.test.ts
git commit -m "feat(waha): add chat/message history REST wrappers"
```

---

### Task 2: Engine — `import/waha-history-core.ts` (classify, normalize, batch import)

**Files:**
- Create: `src/providers/whatsapp/import/waha-history-core.ts`
- Test: `src/providers/whatsapp/import/waha-history-core.test.ts`

**Interfaces:**
- Consumes: `fetchWahaChatsPage`/`fetchWahaChatMessagesPage` from `../waha/history` (Task 1); `extractContent`/`jidToE164`/`IWahaMessagePayload` from `../waha/parser` (Task 1); `resolveWahaLid` from `../waha/contacts`; `IWahaSessionTarget` from `../waha/session`; `emptyImportStats`, `landNormalizedChat`, `IImportAccount`, `IImportBatchResult`, `IImportDb`, `INormalizedRecord` from `./core`; `MEDIA_DISCRIMINATOR_TYPES` from `../types`.
- Produces: `classifyWahaChatId(chatId): "individual"|"lid"|"group"|"broadcast"|"other"`, `normalizeWahaHistoryRecord(payload): INormalizedRecord | null`, `processWahaImportBatch(args): Promise<IImportBatchResult>` — consumed by Task 6.

- [ ] **Step 1: Record the pre-task commit for the review package**

Run: `git rev-parse HEAD` and note the SHA (needed if this task is reviewed via `scripts/review-package`).

- [ ] **Step 2: Write the failing tests**

Create `src/providers/whatsapp/import/waha-history-core.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  classifyWahaChatId,
  normalizeWahaHistoryRecord,
  processWahaImportBatch,
} from "./waha-history-core";
import type { IImportDb } from "./core";
import type { IWahaMessagePayload } from "../waha/parser";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const target = { baseUrl: "https://waha.example.com", sessionName: "loja-abc123" };

describe("classifyWahaChatId", () => {
  it("classifies every known suffix", () => {
    expect(classifyWahaChatId("5548999887766@c.us")).toBe("individual");
    expect(classifyWahaChatId("67186324430852@lid")).toBe("lid");
    expect(classifyWahaChatId("120363000000000000@g.us")).toBe("group");
    expect(classifyWahaChatId("1@broadcast")).toBe("broadcast");
    expect(classifyWahaChatId("1@newsletter")).toBe("broadcast");
    expect(classifyWahaChatId("1@something.else")).toBe("other");
  });
});

describe("normalizeWahaHistoryRecord", () => {
  const base: IWahaMessagePayload = {
    id: "id1",
    timestamp: 1720000000,
    from: "5548999887766@c.us",
    fromMe: false,
    body: "Olá",
    hasMedia: false,
  };

  it("normalizes an inbound text message", () => {
    const row = normalizeWahaHistoryRecord(base);
    expect(row).not.toBeNull();
    expect(row?.direction).toBe("in");
    expect(row?.status).toBe("delivered");
    expect(row?.text).toBe("Olá");
    expect(row?.providerMessageId).toBe("id1");
  });

  it("normalizes an outbound message (fromMe: true) as sent", () => {
    const row = normalizeWahaHistoryRecord({ ...base, fromMe: true });
    expect(row?.direction).toBe("out");
    expect(row?.status).toBe("sent");
  });

  it("defaults a missing fromMe to inbound (false) instead of throwing", () => {
    const { fromMe: _drop, ...withoutFromMe } = base;
    const row = normalizeWahaHistoryRecord(withoutFromMe as IWahaMessagePayload);
    expect(row?.direction).toBe("in");
  });

  it("returns null when id is missing", () => {
    const { id: _drop, ...rest } = base;
    expect(normalizeWahaHistoryRecord(rest as IWahaMessagePayload)).toBeNull();
  });

  it("returns null for an invalid timestamp", () => {
    expect(normalizeWahaHistoryRecord({ ...base, timestamp: 0 })).toBeNull();
    expect(normalizeWahaHistoryRecord({ ...base, timestamp: Number.NaN })).toBeNull();
  });

  it("returns null for a timestamp more than 24h in the future", () => {
    const future = Math.floor(Date.now() / 1000) + 2 * 24 * 60 * 60;
    expect(normalizeWahaHistoryRecord({ ...base, timestamp: future })).toBeNull();
  });

  it("normalizes a media message and sets mediaType", () => {
    const row = normalizeWahaHistoryRecord({
      ...base,
      hasMedia: true,
      media: { url: "https://waha.example.com/f.jpg", mimetype: "image/jpeg" },
    });
    expect(row?.mediaType).toBe("image");
  });
});

describe("processWahaImportBatch", () => {
  function makeDb(): IImportDb {
    const customers = new Map<string, string>(); // phoneDigits -> customerId
    const conversations = new Map<string, string>(); // customerId -> conversationId
    const known = new Set<string>();
    let nextId = 1;
    return {
      async findCustomerByPhone(_storeId, phoneDigits) {
        const id = customers.get(phoneDigits);
        return id ? { id } : null;
      },
      async createPendingCustomer({ phone }) {
        const id = `cust-${nextId++}`;
        customers.set(phone.replace(/\D/g, ""), id);
        return { id };
      },
      async findOpenConversation(customerId) {
        const id = conversations.get(customerId);
        return id ? { id } : null;
      },
      async createConversation({ customerId }) {
        const id = `conv-${nextId++}`;
        conversations.set(customerId, id);
        return { id };
      },
      async filterKnownProviderMessageIds(ids) {
        return new Set(ids.filter((id) => known.has(id)));
      },
      async insertImportedMessages(rows) {
        for (const row of rows) known.add(row.providerMessageId);
      },
      async advanceConversationActivity() {},
    };
  }

  it("imports an individual chat's messages and lands them via the shared db", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("/chats?")) return jsonResponse(200, [{ id: "5548999887766@c.us" }]);
      if (url.includes("/messages?")) {
        return jsonResponse(200, [
          { id: "m1", timestamp: 1720000000, from: "5548999887766@c.us", fromMe: false, body: "oi" },
        ]);
      }
      return jsonResponse(404, {});
    });
    const db = makeDb();
    const result = await processWahaImportBatch({
      account: { id: "acct-1", storeId: "store-1" },
      apiKey: "key",
      fetchFn: fetchFn as unknown as typeof fetch,
      target,
      db,
    });
    expect(result.done).toBe(true);
    expect(result.stats.chatsProcessed).toBe(1);
    expect(result.stats.messagesImported).toBe(1);
  });

  it("skips groups, broadcasts and unresolved @lid chats without fetching their messages", async () => {
    const messagesCalls: string[] = [];
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("/chats?")) {
        return jsonResponse(200, [{ id: "1@g.us" }, { id: "2@broadcast" }, { id: "3@lid" }]);
      }
      if (url.includes("/lids/")) return jsonResponse(404, {});
      if (url.includes("/messages?")) {
        messagesCalls.push(url);
        return jsonResponse(200, []);
      }
      return jsonResponse(404, {});
    });
    const db = makeDb();
    const result = await processWahaImportBatch({
      account: { id: "acct-1", storeId: "store-1" },
      apiKey: "key",
      fetchFn: fetchFn as unknown as typeof fetch,
      target,
      db,
    });
    expect(result.stats.chatsSkippedGroup).toBe(1);
    expect(result.stats.chatsSkippedBroadcast).toBe(1);
    expect(result.stats.chatsSkippedLid).toBe(1);
    expect(messagesCalls).toHaveLength(0);
  });

  it("resolves an @lid chat and imports its messages under the resolved phone", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("/chats?")) return jsonResponse(200, [{ id: "999@lid" }]);
      if (url.includes("/lids/999")) return jsonResponse(200, { pn: "5548999887766@c.us" });
      if (url.includes("/messages?")) {
        return jsonResponse(200, [
          { id: "m1", timestamp: 1720000000, from: "999@lid", fromMe: false, body: "oi" },
        ]);
      }
      return jsonResponse(404, {});
    });
    const db = makeDb();
    const result = await processWahaImportBatch({
      account: { id: "acct-1", storeId: "store-1" },
      apiKey: "key",
      fetchFn: fetchFn as unknown as typeof fetch,
      target,
      db,
    });
    expect(result.stats.chatsSkippedLid).toBe(0);
    expect(result.stats.chatsProcessed).toBe(1);
    expect(result.stats.messagesImported).toBe(1);
  });

  it("respects cursor/batchSize and reports nextCursor for a subsequent call", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("/chats?")) {
        return jsonResponse(200, [{ id: "1@c.us" }, { id: "2@c.us" }, { id: "3@c.us" }]);
      }
      if (url.includes("/messages?")) return jsonResponse(200, []);
      return jsonResponse(404, {});
    });
    const db = makeDb();
    const result = await processWahaImportBatch({
      account: { id: "acct-1", storeId: "store-1" },
      apiKey: "key",
      fetchFn: fetchFn as unknown as typeof fetch,
      target,
      db,
      batchSize: 2,
    });
    expect(result.done).toBe(false);
    expect(result.nextCursor).toBe(2);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun run test src/providers/whatsapp/import/waha-history-core.test.ts`
Expected: FAIL — `Cannot find module './waha-history-core'`.

- [ ] **Step 4: Create `src/providers/whatsapp/import/waha-history-core.ts`**

```ts
/**
 * WAHA history import core — REST-pull equivalent of the Evolution importer
 * (`./core.ts`) for the WAHA engine. Pages `GET /api/{session}/chats` and
 * `GET /api/{session}/chats/{chatId}/messages`, resolves `@lid` chats to a
 * real phone via `resolveWahaLid` (same helper the live webhook and the
 * backfill action already use), and lands everything through the shared
 * `landNormalizedChat` — customer/conversation resolution, idempotency and
 * the pool rule are identical to every other import path.
 *
 * Status is DERIVED (no per-message ack lookup): out → "sent", in →
 * "delivered" — same rule the Evolution Go HistorySync import uses.
 *
 * Runtime-agnostic file: relative imports only, Web APIs only.
 */

import { extractContent, jidToE164, type IWahaMessagePayload } from "../waha/parser";
import { resolveWahaLid } from "../waha/contacts";
import { fetchWahaChatMessagesPage, fetchWahaChatsPage } from "../waha/history";
import type { IWahaSessionTarget } from "../waha/session";
import { MEDIA_DISCRIMINATOR_TYPES } from "../types";
import {
  emptyImportStats,
  landNormalizedChat,
  type IImportAccount,
  type IImportBatchResult,
  type IImportDb,
  type IImportStats,
  type INormalizedRecord,
} from "./core";

const CHATS_PAGE_SIZE = 100;
const MESSAGES_PAGE_SIZE = 100;
/** Runaway guards — same reasoning as core.ts's MAX_MESSAGE_PAGES_PER_CHAT. */
const MAX_CHAT_PAGES = 50; // 50 * 100 = 5 000 chats
const MAX_MESSAGE_PAGES_PER_CHAT = 50; // 50 * 100 = 5 000 messages/chat
const BATCH_CHATS_DEFAULT = 10;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type ChatKind = "individual" | "lid" | "group" | "broadcast" | "other";

export function classifyWahaChatId(chatId: string): ChatKind {
  if (chatId.endsWith("@c.us")) return "individual";
  if (chatId.endsWith("@lid")) return "lid";
  if (chatId.endsWith("@g.us")) return "group";
  if (chatId.endsWith("@broadcast") || chatId.endsWith("@newsletter")) return "broadcast";
  return "other";
}

/**
 * WAHA message → flat normalized row; null for un-importable records (same
 * guards as the Evolution/Go normalizers): no `id`, no valid second-epoch
 * timestamp (missing clock or a ms/µs epoch that would land decades in the
 * future), empty/unrecognised body. `fromMe` absent on a record defaults to
 * `false` (inbound) rather than throwing.
 */
export function normalizeWahaHistoryRecord(payload: IWahaMessagePayload): INormalizedRecord | null {
  const providerMessageId = payload.id;
  if (!providerMessageId) return null;

  const tsNum = Number(payload.timestamp);
  if (!Number.isFinite(tsNum) || tsNum <= 0) return null;
  if (tsNum * 1000 > Date.now() + ONE_DAY_MS) return null;

  const content = extractContent(payload);
  if (content.contentType === "unknown" && !content.text) return null;

  const direction: "in" | "out" = payload.fromMe === true ? "out" : "in";
  const status: INormalizedRecord["status"] = direction === "out" ? "sent" : "delivered";
  const mediaType = (MEDIA_DISCRIMINATOR_TYPES as readonly string[]).includes(content.contentType)
    ? content.contentType
    : null;

  return {
    providerMessageId,
    direction,
    text: content.text ?? "",
    mediaType,
    mediaFilename: content.mediaFilename,
    status,
    sentAt: new Date(tsNum * 1000).toISOString(),
  };
}

async function fetchAllWahaChatIds(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaSessionTarget,
  warn: (msg: string, fields?: Record<string, unknown>) => void,
): Promise<string[]> {
  const ids = new Set<string>();
  for (let page = 0; page < MAX_CHAT_PAGES; page++) {
    const offset = page * CHATS_PAGE_SIZE;
    const rows = await fetchWahaChatsPage(apiKey, fetchFn, target, offset, CHATS_PAGE_SIZE);
    for (const row of rows) ids.add(row.id);
    if (rows.length < CHATS_PAGE_SIZE) break;
    if (page === MAX_CHAT_PAGES - 1) {
      warn("fetchAllWahaChatIds page cap reached — older chats skipped", {
        sessionName: target.sessionName,
      });
    }
  }
  return [...ids];
}

async function importWahaChat(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaSessionTarget,
  chatId: string,
  phone: string,
  account: IImportAccount,
  db: IImportDb,
  stats: IImportStats,
  warn: (msg: string, fields?: Record<string, unknown>) => void,
): Promise<void> {
  const records: IWahaMessagePayload[] = [];
  let prevPageIds = new Set<string>();

  for (let page = 0; page < MAX_MESSAGE_PAGES_PER_CHAT; page++) {
    const offset = page * MESSAGES_PAGE_SIZE;
    const pageRecords = await fetchWahaChatMessagesPage(
      apiKey,
      fetchFn,
      target,
      chatId,
      offset,
      MESSAGES_PAGE_SIZE,
    );
    const thisPageIds = new Set(
      pageRecords.map((r) => r.id).filter((id): id is string => Boolean(id)),
    );
    if (page > 0 && thisPageIds.size > 0 && [...thisPageIds].every((id) => prevPageIds.has(id))) {
      warn("fetchWahaChatMessagesPage returned an identical page — stopping", { chatId });
      break;
    }
    prevPageIds = thisPageIds;
    records.push(...pageRecords);
    if (pageRecords.length < MESSAGES_PAGE_SIZE) break;
    if (page === MAX_MESSAGE_PAGES_PER_CHAT - 1) {
      warn("import waha chat page cap reached — older messages skipped", { chatId });
    }
  }

  const normalized: INormalizedRecord[] = [];
  for (const record of records) {
    const row = normalizeWahaHistoryRecord(record);
    if (!row) {
      stats.messagesSkipped++;
      continue;
    }
    normalized.push(row);
  }
  if (normalized.length === 0) return;

  await landNormalizedChat({ account, db, phone, normalized, stats });
}

export interface IWahaImportArgs {
  account: IImportAccount;
  apiKey: string;
  fetchFn: typeof fetch;
  target: IWahaSessionTarget;
  db: IImportDb;
  /** Chat offset into the sorted chat-id list (stable across calls). */
  cursor?: number;
  batchSize?: number;
  warn?: (msg: string, fields?: Record<string, unknown>) => void;
}

/**
 * Process one batch of chats from a WAHA session's stored history. Mirrors
 * `processImportBatch`'s cursor/batch contract exactly — the frontend
 * (`ImportConversationsDialog`/`runHistoryImport`) does not need to know
 * which engine it's driving.
 */
export async function processWahaImportBatch(args: IWahaImportArgs): Promise<IImportBatchResult> {
  const { account, apiKey, fetchFn, target, db } = args;
  const warn = args.warn ?? (() => {});
  const stats = emptyImportStats();

  const allChats = (await fetchAllWahaChatIds(apiKey, fetchFn, target, warn)).slice().sort();
  const cursor = Number.isFinite(args.cursor) ? Math.max(0, Math.floor(args.cursor as number)) : 0;
  const batchSize = Math.max(1, Math.floor(args.batchSize ?? BATCH_CHATS_DEFAULT));
  const batch = allChats.slice(cursor, cursor + batchSize);

  for (const chatId of batch) {
    const kind = classifyWahaChatId(chatId);
    if (kind === "group") {
      stats.chatsSkippedGroup++;
      continue;
    }
    if (kind === "broadcast") {
      stats.chatsSkippedBroadcast++;
      continue;
    }
    if (kind === "other") {
      stats.chatsSkippedOther++;
      continue;
    }

    let phone: string | undefined;
    if (kind === "individual") {
      phone = jidToE164(chatId);
    } else {
      // lid — resolve to a real phone before touching messages at all.
      try {
        const resolved = await resolveWahaLid(apiKey, fetchFn, {
          baseUrl: target.baseUrl,
          sessionName: target.sessionName,
          lid: chatId,
        });
        phone = resolved.phone;
      } catch (error) {
        stats.chatsFailed++;
        warn("waha lid resolution failed during import — cursor advances past it", {
          chatId,
          detail: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      if (!phone) {
        stats.chatsSkippedLid++;
        continue;
      }
    }
    if (!phone) {
      stats.chatsSkippedOther++;
      continue;
    }

    try {
      await importWahaChat(apiKey, fetchFn, target, chatId, phone, account, db, stats, warn);
      stats.chatsProcessed++;
    } catch (error) {
      stats.chatsFailed++;
      warn("import waha chat failed — cursor advances past it", {
        chatId,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const nextCursor = cursor + batch.length;
  return { done: nextCursor >= allChats.length, nextCursor, stats };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test src/providers/whatsapp/import/waha-history-core.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 6: Sync the engine mirror**

Run: `bun run scripts/sync-whatsapp-shared.ts`
Expected: `synced N files → supabase/functions/_shared/whatsapp/` where N includes the new `history.ts` and `waha-history-core.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/providers/whatsapp/import/waha-history-core.ts src/providers/whatsapp/import/waha-history-core.test.ts supabase/functions/_shared/whatsapp
git commit -m "feat(waha): add history-import batch core (classify/normalize/land)"
```

---

### Task 3: Engine — `waha/contacts.ts` profile-picture lookup

**Files:**
- Modify: `src/providers/whatsapp/waha/contacts.ts`
- Test: `src/providers/whatsapp/waha/contacts.test.ts`

**Interfaces:**
- Consumes: `wahaRequest` from `./client`, `WhatsAppProviderError` from `../errors`.
- Produces: `fetchWahaProfilePictureUrl(apiKey, fetchFn, target): Promise<string | undefined>` where `target: { baseUrl: string; sessionName: string; contactId: string; timeoutMs?: number }` — consumed by Task 5.

- [ ] **Step 1: Write the failing tests**

Append to `src/providers/whatsapp/waha/contacts.test.ts` (new `describe` block at the end of the file, same imports style already in the file — add `fetchWahaProfilePictureUrl` to the existing import line at the top):

```ts
import { fetchWahaProfilePictureUrl, getWahaContactName, resolveWahaLid } from "./contacts";
```

```ts
describe("fetchWahaProfilePictureUrl", () => {
  it("GETs /api/contacts/profile-picture with contactId + session and returns the URL", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { profilePictureURL: "https://waha.example.com/pic.jpg" }),
      );
    const url = await fetchWahaProfilePictureUrl("key", fetchFn, {
      ...target,
      contactId: "5548999887766@c.us",
    });
    expect(fetchFn.mock.calls[0][0]).toBe(
      "https://waha.example.com/api/contacts/profile-picture?contactId=5548999887766%40c.us&session=loja-abc123",
    );
    expect(url).toBe("https://waha.example.com/pic.jpg");
  });

  it("returns undefined on 404 (no public photo)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(404, { message: "Not found" }));
    const url = await fetchWahaProfilePictureUrl("key", fetchFn, { ...target, contactId: "1@c.us" });
    expect(url).toBeUndefined();
  });

  it("returns undefined when profilePictureURL is empty", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { profilePictureURL: "" }));
    const url = await fetchWahaProfilePictureUrl("key", fetchFn, { ...target, contactId: "2@c.us" });
    expect(url).toBeUndefined();
  });

  it("propagates auth errors (401)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(401, { message: "Unauthorized" }));
    await expect(
      fetchWahaProfilePictureUrl("bad", fetchFn, { ...target, contactId: "3@c.us" }),
    ).rejects.toThrow("Chave da API WAHA inválida ou ausente");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test src/providers/whatsapp/waha/contacts.test.ts`
Expected: FAIL — `fetchWahaProfilePictureUrl is not exported`.

- [ ] **Step 3: Add `fetchWahaProfilePictureUrl` to `contacts.ts`**

Append at the end of `src/providers/whatsapp/waha/contacts.ts`:

```ts
/**
 * Contact profile-picture URL via `GET /api/contacts/profile-picture`
 * (WAHA REST docs, "Profile"). Returns `undefined` on a 404/empty response
 * (no public photo / private) and NEVER throws for that case — other errors
 * (auth, network, 5xx) propagate, same contract as {@link resolveWahaLid}.
 */
export async function fetchWahaProfilePictureUrl(
  apiKey: string,
  fetchFn: typeof fetch,
  target: { baseUrl: string; sessionName: string; contactId: string; timeoutMs?: number },
): Promise<string | undefined> {
  try {
    const query = `contactId=${encodeURIComponent(target.contactId)}&session=${encodeURIComponent(target.sessionName)}`;
    const response = await wahaRequest(apiKey, fetchFn, {
      baseUrl: target.baseUrl,
      path: `/api/contacts/profile-picture?${query}`,
      method: "GET",
      timeoutMs: target.timeoutMs ?? 10_000,
    });
    const body = response.body as { profilePictureURL?: string | null } | null;
    const url = (body?.profilePictureURL ?? "").trim();
    return url.length > 0 ? url : undefined;
  } catch (err) {
    if (err instanceof WhatsAppProviderError && err.code === "NOT_FOUND") {
      return undefined;
    }
    throw err;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test src/providers/whatsapp/waha/contacts.test.ts`
Expected: PASS (all tests in the file, including the 4 new ones).

- [ ] **Step 5: Sync the engine mirror**

Run: `bun run scripts/sync-whatsapp-shared.ts`

- [ ] **Step 6: Commit**

```bash
git add src/providers/whatsapp/waha/contacts.ts src/providers/whatsapp/waha/contacts.test.ts supabase/functions/_shared/whatsapp
git commit -m "feat(waha): add profile-picture URL lookup"
```

---

### Task 4: Edge + Frontend — Mensagem de teste

**Files:**
- Modify: `supabase/functions/waha-connect/index.ts`
- Modify: `src/features/admin-settings/api/wahaConnect.ts`
- Modify: `src/features/admin-settings/components/TestMessageDialog.tsx`

**Interfaces:**
- Consumes: `sendWahaText` from `_shared/whatsapp/waha/send.ts` (already exists, already mirrored). `invokeWaha` from `wahaConnect.ts` (already exists).
- Produces: `sendWahaTestMessage(accountId, toDigits): Promise<void>` in `wahaConnect.ts` — consumed by `TestMessageDialog.tsx` in this same task, and rendered from `WahaSection.tsx` in Task 8.

- [ ] **Step 1: Add the `test-message` action to `waha-connect`**

In `supabase/functions/waha-connect/index.ts`:

1. Add the import (alongside the other `_shared/whatsapp/waha/session.ts` import block):

```ts
import { sendWahaText } from "../_shared/whatsapp/waha/send.ts";
```

2. Update the module docstring's `Input` list (top of file) to add:

```
 *   { accountId, action: 'test-message', to }
```

3. Add `"test-message"` to the `ACTIONS` array:

```ts
const ACTIONS = [
  "create",
  "ping",
  "backfillLids",
  "qr",
  "state",
  "logout",
  "restart",
  "test-message",
  "delete",
  "updateConfig",
] as const;
```

4. Add `to?: string;` to the body type in `servePost`:

```ts
const body = (await parseJsonBody(req)) as {
  accountId?: string;
  storeId?: string;
  label?: string;
  purpose?: string;
  wahaServerId?: string;
  sessionConfig?: IWahaSessionSettings;
  dryRun?: boolean;
  cursor?: string;
  to?: string;
  action?: string;
};
```

5. Insert a new `case "test-message":` in the `switch (action)` block, right after `case "restart":`'s closing brace and before `case "delete":`:

```ts
      case "test-message": {
        const digits = String(body.to ?? "").replace(/\D/g, "");
        if (digits.length < 12 || digits.length > 13) {
          return json(
            {
              error: "Informe o número com DDI e DDD (ex.: 5554999887766).",
              code: "VALIDATION_ERROR",
              traceId: ctx.traceId,
            },
            422,
          );
        }
        const result = await sendWahaText(apiKey, fetchFn, target, {
          toPhone: `+${digits}`,
          text: "✅ Mensagem de teste — GALLO Base Diesel. A conexão WhatsApp desta conta está funcionando.",
        });
        if (actorId) {
          await bestEffortAudit(admin, {
            store_id: account.store_id,
            actor_id: actorId,
            action: "whatsapp_test_message_sent",
            resource: "whatsapp_account",
            resource_id: account.id,
            after: { toMasked: `***${digits.slice(-4)}`, providerMessageId: result.providerMessageId },
          });
        }
        return json({ ok: true, providerMessageId: result.providerMessageId, traceId: ctx.traceId }, 200);
      }
```

- [ ] **Step 2: Add `sendWahaTestMessage` to the frontend client**

In `src/features/admin-settings/api/wahaConnect.ts`, append:

```ts
/** Ad-hoc validation send — never persisted as a conversation message. */
export async function sendWahaTestMessage(accountId: string, toDigits: string): Promise<void> {
  await invokeWaha<{ ok: boolean }>({ accountId, action: "test-message", to: toDigits });
}
```

- [ ] **Step 3: Make `TestMessageDialog.tsx` provider-aware**

In `src/features/admin-settings/components/TestMessageDialog.tsx`:

1. Add the import:

```ts
import { sendWahaTestMessage } from "../api/wahaConnect";
```

2. Replace the body of `handleSend`:

```ts
  const handleSend = async () => {
    if (!account) return;
    const digits = normalizeTestPhoneDigits(number);
    if (!digits) {
      toast.error("Informe o número com DDI e DDD — ex.: 5554999887766.");
      return;
    }
    setSending(true);
    try {
      if (account.provider === "waha") {
        await sendWahaTestMessage(account.id, digits);
      } else {
        await sendEvolutionTestMessage(account.id, digits);
      }
      toast.success("Mensagem de teste enviada. Confira o celular de destino.");
      onClose();
    } catch (err) {
      toast.error(
        account.provider === "waha"
          ? err instanceof Error
            ? err.message
            : "Não foi possível enviar a mensagem de teste."
          : connectErrorMessage(err),
      );
    } finally {
      setSending(false);
    }
  };
```

- [ ] **Step 4: Verify the frontend build and full test suite are green**

Run: `bun run build`
Expected: build succeeds, no new TypeScript errors from these 3 files.

Run: `bun run test`
Expected: all existing tests still PASS (no test file exists for these network-calling wrapper functions today — same as `sendEvolutionTestMessage`, which is also untested; only pure helpers like `formatTestPhoneMask` get dedicated tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/waha-connect/index.ts src/features/admin-settings/api/wahaConnect.ts src/features/admin-settings/components/TestMessageDialog.tsx
git commit -m "feat(waha): add test-message action + wire TestMessageDialog"
```

---

### Task 5: Edge — `whatsapp-avatar-sync` WAHA branch

**Files:**
- Create: `supabase/functions/whatsapp-avatar-sync/wahaServer.ts`
- Modify: `supabase/functions/whatsapp-avatar-sync/index.ts`

**Interfaces:**
- Consumes: `fetchWahaProfilePictureUrl` from `_shared/whatsapp/waha/contacts.ts` (Task 3, already synced).
- Produces: nothing new consumed elsewhere — this task is a leaf.

- [ ] **Step 1: Create the local WAHA server resolver**

Create `supabase/functions/whatsapp-avatar-sync/wahaServer.ts`:

```ts
import { HttpError } from "../_shared/http.ts";

// NOTE: mirrors supabase/functions/waha-connect/wahaServer.ts's
// resolveWahaServerForPing shape (baseUrl+apiKey only, no HMAC — this edge
// never touches webhooks). Kept per-edge to match the existing goServer.ts /
// import-history wahaServer.ts convention — there is no _shared/wahaServer yet.

interface AccountLike {
  id: string;
  waha_server_id: string | null;
}

// deno-lint-ignore no-explicit-any
type Admin = { from: (t: string) => any };
type ResolveSecret = (name: string) => Promise<string | undefined>;

export interface IResolvedWahaServer {
  baseUrl: string;
  apiKey: string;
}

export async function resolveWahaServer(
  admin: Admin,
  resolveSecret: ResolveSecret,
  account: AccountLike,
): Promise<IResolvedWahaServer> {
  if (!account.waha_server_id) {
    throw new HttpError(422, "Conta WAHA sem servidor configurado (waha_server_id ausente).");
  }
  const { data: server, error } = await admin
    .from("waha_servers")
    .select("base_url, api_key_ref")
    .eq("id", account.waha_server_id)
    .maybeSingle();
  if (error || !server) {
    throw new HttpError(422, "Servidor WAHA não encontrado para esta conta.");
  }
  const baseUrl = String(server.base_url ?? "").replace(/\/+$/, "");
  if (!baseUrl) throw new HttpError(422, "Servidor WAHA sem endpoint.");
  const apiKey = await resolveSecret(String(server.api_key_ref ?? ""));
  if (!apiKey) throw new HttpError(422, "Chave da API do servidor WAHA não definida.");
  return { baseUrl, apiKey };
}
```

- [ ] **Step 2: Wire the WAHA branch into `whatsapp-avatar-sync/index.ts`**

1. Add imports at the top:

```ts
import { fetchWahaProfilePictureUrl } from "../_shared/whatsapp/waha/contacts.ts";
import { resolveWahaServer } from "./wahaServer.ts";
```

2. Widen `IAccountRow` (add `waha_server_id` and `sessionName` to `provider_config`):

```ts
interface IAccountRow {
  id: string;
  store_id: string;
  provider: string;
  credentials_ref: string;
  go_server_id: string | null;
  waha_server_id: string | null;
  provider_config: {
    baseUrl?: string;
    instanceName?: string;
    instanceId?: string;
    sessionName?: string;
  } | null;
}
```

3. Add `waha_server_id` to the account SELECT:

```ts
  const { data: account } = await admin
    .from("whatsapp_accounts")
    .select("id, store_id, provider, credentials_ref, go_server_id, waha_server_id, provider_config")
    .eq("id", accountId)
    .eq("store_id", profile.store_id)
    .maybeSingle<IAccountRow>();
```

4. Widen the provider validation:

```ts
  if (!account) return jsonError("conta não encontrada nesta loja", "NOT_FOUND", 404);
  if (
    account.provider !== "evolution" &&
    account.provider !== "evolution-go" &&
    account.provider !== "waha"
  ) {
    return jsonError(
      "sincronização disponível apenas para contas Evolution ou WAHA",
      "VALIDATION_ERROR",
      422,
    );
  }
```

5. Add the `waha` branch as the FIRST branch of the existing `if (account.provider === "evolution-go") { ... } else { ... }` chain — turn it into a 3-way chain:

```ts
  let target: IEvolutionInstanceTarget;
  let apiKey: string;
  let fetchPicUrl: ((wire: string, traceId?: string) => Promise<string | null>) | undefined;

  if (account.provider === "waha") {
    const sessionName = account.provider_config?.sessionName;
    if (!sessionName) {
      return jsonError("sessão WAHA sem sessionName configurado", "CONFIG_MISSING", 422);
    }
    const { baseUrl, apiKey: wahaKey } = await resolveWahaServer(admin, deps.resolveSecret, account);
    apiKey = wahaKey;
    target = { baseUrl, instanceName: sessionName }; // unused by the WAHA path; fetchPicUrl drives it
    fetchPicUrl = async (wire) =>
      (await fetchWahaProfilePictureUrl(wahaKey, fetch, {
        baseUrl,
        sessionName,
        contactId: `${wire}@c.us`,
      })) ?? null;
  } else if (account.provider === "evolution-go") {
    const instanceId = account.provider_config?.instanceId ?? "";
    if (!instanceId) {
      return jsonError("conta Evolution Go ainda não pareada", "CONFIG_MISSING", 422);
    }
    const { baseUrl } = await resolveGoServer(admin, deps.resolveSecret, account);
    const instanceToken = await deps.resolveSecret(
      `${account.credentials_ref}${EVOLUTION_GO_SECRET_SUFFIXES.instanceToken}`,
    );
    if (!instanceToken) {
      return jsonError("token da instância Go não cadastrado", "MISSING_API_KEY", 422);
    }
    const goTarget: IGoInstanceTarget = { baseUrl, instanceId };
    apiKey = instanceToken;
    target = { baseUrl, instanceName: instanceId }; // unused by the Go path; fetchPicUrl drives it
    fetchPicUrl = (wire, t) => fetchGoProfilePictureUrl(instanceToken, deps, goTarget, wire, t);
  } else {
    const baseUrl = account.provider_config?.baseUrl;
    const instanceName = account.provider_config?.instanceName;
    if (!baseUrl || !instanceName) {
      return jsonError("configure URL base e instância antes de sincronizar", "CONFIG_MISSING", 422);
    }
    const key = await deps.resolveSecret(`${account.credentials_ref}_API_KEY`);
    if (!key) {
      return jsonError("chave de API da instância não cadastrada", "MISSING_API_KEY", 422);
    }
    apiKey = key;
    target = { baseUrl, instanceName };
    fetchPicUrl = undefined; // default: classic Evolution fetch inside syncContactAvatar
  }
```

(This replaces the existing `if (account.provider === "evolution-go") { ... } else { ... }` block — the `evolution-go` and classic-Evolution bodies are copied verbatim from the current file, unchanged.)

- [ ] **Step 3: Verify the frontend build and full test suite are green**

Run: `bun run build`
Expected: success.

Run: `bun run test`
Expected: all tests PASS (no dedicated test file for this edge function today — same as `goServer.ts`, which also has none).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/whatsapp-avatar-sync/wahaServer.ts supabase/functions/whatsapp-avatar-sync/index.ts
git commit -m "feat(waha): add avatar-sync branch for WAHA accounts"
```

---

### Task 6: Edge — `whatsapp-import-history` WAHA branch

**Files:**
- Create: `supabase/functions/whatsapp-import-history/wahaServer.ts`
- Modify: `supabase/functions/whatsapp-import-history/index.ts`
- Modify: `supabase/functions/_shared/import-db.ts`

**Interfaces:**
- Consumes: `processWahaImportBatch` from `_shared/whatsapp/import/waha-history-core.ts` (Task 2, already synced).
- Produces: nothing new consumed elsewhere — this task is a leaf.

- [ ] **Step 1: Create the local WAHA server resolver**

Create `supabase/functions/whatsapp-import-history/wahaServer.ts` — **byte-identical** to `supabase/functions/whatsapp-avatar-sync/wahaServer.ts` created in Task 5 (same convention as the two existing `goServer.ts` copies — no `_shared/wahaServer.ts` yet):

```ts
import { HttpError } from "../_shared/http.ts";

// NOTE: mirrors supabase/functions/waha-connect/wahaServer.ts's
// resolveWahaServerForPing shape (baseUrl+apiKey only, no HMAC — this edge
// never touches webhooks). Kept per-edge to match the existing goServer.ts /
// avatar-sync wahaServer.ts convention — there is no _shared/wahaServer yet.

interface AccountLike {
  id: string;
  waha_server_id: string | null;
}

// deno-lint-ignore no-explicit-any
type Admin = { from: (t: string) => any };
type ResolveSecret = (name: string) => Promise<string | undefined>;

export interface IResolvedWahaServer {
  baseUrl: string;
  apiKey: string;
}

export async function resolveWahaServer(
  admin: Admin,
  resolveSecret: ResolveSecret,
  account: AccountLike,
): Promise<IResolvedWahaServer> {
  if (!account.waha_server_id) {
    throw new HttpError(422, "Conta WAHA sem servidor configurado (waha_server_id ausente).");
  }
  const { data: server, error } = await admin
    .from("waha_servers")
    .select("base_url, api_key_ref")
    .eq("id", account.waha_server_id)
    .maybeSingle();
  if (error || !server) {
    throw new HttpError(422, "Servidor WAHA não encontrado para esta conta.");
  }
  const baseUrl = String(server.base_url ?? "").replace(/\/+$/, "");
  if (!baseUrl) throw new HttpError(422, "Servidor WAHA sem endpoint.");
  const apiKey = await resolveSecret(String(server.api_key_ref ?? ""));
  if (!apiKey) throw new HttpError(422, "Chave da API do servidor WAHA não definida.");
  return { baseUrl, apiKey };
}
```

- [ ] **Step 2: Widen `makeImportDb`'s provider type**

In `supabase/functions/_shared/import-db.ts`, change:

```ts
export function makeImportDb(
  admin: SupabaseClient,
  provider: "evolution" | "evolution-go",
): IImportDb {
```

to:

```ts
export function makeImportDb(
  admin: SupabaseClient,
  provider: "evolution" | "evolution-go" | "waha",
): IImportDb {
```

(No other change — the function body already writes whatever string is passed into `messages.provider`, and `'waha'` is already an accepted value there, confirmed by `waha-webhook`/`waha-send` writing `provider: "waha"` into `messages` in production today.)

- [ ] **Step 3: Wire the WAHA branch into `whatsapp-import-history/index.ts`**

1. Add imports at the top (alongside the existing `_shared/whatsapp/import/core.ts` import):

```ts
import {
  processImportBatch,
  type IImportBatchResult,
  type IImportSource,
} from "../_shared/whatsapp/import/core.ts";
import { processWahaImportBatch } from "../_shared/whatsapp/import/waha-history-core.ts";
import { resolveWahaServer } from "./wahaServer.ts";
```

(This replaces the existing `import { processImportBatch, type IImportSource } from "../_shared/whatsapp/import/core.ts";` line — same module, now also importing the `IImportBatchResult` type.)

2. Widen `IAccountRow`:

```ts
interface IAccountRow {
  id: string;
  store_id: string;
  provider: string;
  credentials_ref: string;
  waha_server_id: string | null;
  provider_config: { baseUrl?: string; instanceName?: string; sessionName?: string } | null;
}
```

3. Add `waha_server_id` to the SELECT:

```ts
  const { data: account } = await admin
    .from("whatsapp_accounts")
    .select("id, store_id, provider, credentials_ref, waha_server_id, provider_config")
    .eq("id", accountId)
    .eq("store_id", profile.store_id)
    .maybeSingle<IAccountRow>();
```

4. Replace the validation + fetch/import block (from `if (!account) return jsonError(...)` through the `processImportBatch(...)` call and its trailing `log.info`/`return json(result, 200)`) with:

```ts
  if (!account) return jsonError("conta não encontrada nesta loja", "NOT_FOUND", 404);
  if (account.provider !== "evolution" && account.provider !== "waha") {
    return jsonError(
      "importação disponível apenas para contas Evolution ou WAHA",
      "VALIDATION_ERROR",
      422,
    );
  }

  const deps = makeEngineDeps(admin, traceId);

  let result: IImportBatchResult;
  if (account.provider === "waha") {
    const sessionName = account.provider_config?.sessionName;
    if (!sessionName) {
      return jsonError("sessão WAHA sem sessionName configurado", "CONFIG_MISSING", 422);
    }
    const { baseUrl, apiKey } = await resolveWahaServer(admin, deps.resolveSecret, account);
    result = await processWahaImportBatch({
      account: { id: account.id, storeId: account.store_id },
      apiKey,
      fetchFn: globalThis.fetch,
      target: { baseUrl, sessionName },
      db: makeImportDb(admin, "waha"),
      cursor,
      warn: (msg, fields) => log.warn(msg, fields),
    });
  } else {
    const baseUrl = account.provider_config?.baseUrl;
    const instanceName = account.provider_config?.instanceName;
    if (!baseUrl || !instanceName) {
      return jsonError("configure URL base e instância antes de importar", "CONFIG_MISSING", 422);
    }
    const apiKey = await deps.resolveSecret(`${account.credentials_ref}_API_KEY`);
    if (!apiKey) {
      return jsonError("chave de API da instância não cadastrada", "MISSING_API_KEY", 422);
    }
    const target = { baseUrl, instanceName };
    const source: IImportSource = {
      listChats: async () => (await findChats(apiKey, deps, target, traceId)).map((c) => c.remoteJid),
      listMessages: (remoteJid, page) => findMessages(apiKey, deps, target, remoteJid, page, traceId),
    };
    result = await processImportBatch({
      account: { id: account.id, storeId: account.store_id },
      source,
      db: makeImportDb(admin, "evolution"),
      cursor,
      warn: (msg, fields) => log.warn(msg, fields),
    });
  }

  const actorId = await resolveActorSellerId(admin, callerId);
  if (actorId) {
    await bestEffortAudit(admin, {
      store_id: account.store_id,
      actor_id: actorId,
      action: "whatsapp_history_imported",
      resource: "whatsapp_account",
      resource_id: account.id,
      after: { ...result.stats, cursor, done: result.done, traceId },
    });
  }
  log.info("import batch processed", { accountId: account.id, ...result.stats });

  return json(result, 200);
```

(The old code had `const deps = makeEngineDeps(admin, traceId);` positioned right after the config checks, and the `apiKey`/`target`/`source` block right after that — this replacement folds those into the `else` branch and moves `makeEngineDeps` earlier so both branches can use it.)

- [ ] **Step 4: Verify the frontend build and full test suite are green**

Run: `bun run build`
Expected: success.

Run: `bun run test`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/whatsapp-import-history/wahaServer.ts supabase/functions/whatsapp-import-history/index.ts supabase/functions/_shared/import-db.ts
git commit -m "feat(waha): add history-import branch for WAHA accounts"
```

---

### Task 7: Frontend — WahaSection: Verificar agora + Conexão

**Files:**
- Modify: `src/features/admin-settings/components/WahaSection.tsx`

**Interfaces:**
- Consumes: `invokeWaha` (already imported in the file).
- Produces: `handleCheckNow`, `openConnection` functions and the `WahaConnectionInfoDialog` component — the button row layout this task produces is extended by Task 8 (which inserts 3 more buttons between "Verificar agora" and "Conexão").

- [ ] **Step 1: Add the `connectionInfoTarget` state**

In `WahaSection`'s state block (right after `const [paramsTarget, setParamsTarget] = useState<IWhatsAppAccount | null>(null);`), add:

```ts
  const [connectionInfoTarget, setConnectionInfoTarget] = useState<IWhatsAppAccount | null>(null);
```

- [ ] **Step 2: Add `handleCheckNow` and `openConnection`**

Right after the `handleRepair` function (after its closing `};`), add:

```ts
  const handleCheckNow = async (row: IWhatsAppAccount) => {
    setBusyId(row.id);
    try {
      await invokeWaha({ accountId: row.id, action: "state" });
      toast.success(`Status de "${row.label}" atualizado.`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível verificar o status.");
    } finally {
      setBusyId(null);
    }
  };

  /**
   * "Conexão" is the single, always-visible entry point for pairing status.
   * Disconnected/pending sessions go straight into the repair flow (restart +
   * QR) — same as the old "Parear novamente" dropdown item. A CONNECTED
   * session opens a read-only info dialog instead: clicking "Conexão" must
   * never restart a working session just to look at it.
   */
  const openConnection = (row: IWhatsAppAccount) => {
    if (row.status === "connected") {
      setConnectionInfoTarget(row);
    } else {
      void handleRepair(row);
    }
  };
```

- [ ] **Step 3: Remove the "Parear novamente" dropdown item**

Delete this block from the `DropdownMenuContent` (it's superseded by the new "Conectar" button added in Step 4):

```tsx
                        {row.status !== "connected" && (
                          <DropdownMenuItem disabled={busy} onSelect={() => void handleRepair(row)}>
                            <Icon icon="mdi:qrcode" size={15} className="mr-2" aria-hidden />
                            Parear novamente
                          </DropdownMenuItem>
                        )}
```

- [ ] **Step 4: Add the "Verificar agora" and "Conexão"/"Conectar" buttons**

Replace the action-buttons `<div className="flex flex-wrap gap-2">...</div>` block with:

```tsx
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => void handleRestart(row)}
                        >
                          <Icon icon="mdi:restart" size={14} className="mr-1.5" aria-hidden />
                          Reiniciar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => setParamsTarget(row)}
                        >
                          <Icon icon="mdi:tune-variant" size={14} className="mr-1.5" aria-hidden />
                          Parâmetros
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => void handleCheckNow(row)}
                        >
                          <Icon icon="mdi:refresh" size={14} className="mr-1.5" aria-hidden />
                          Verificar agora
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => openConnection(row)}
                        >
                          <Icon icon="mdi:qrcode-scan" size={14} className="mr-1.5" aria-hidden />
                          {row.status === "connected" ? "Conexão" : "Conectar"}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => startEdit(row)}>
                          <Icon
                            icon="mdi:pencil-outline"
                            size={14}
                            className="mr-1.5"
                            aria-hidden
                          />
                          Editar
                        </Button>
                      </div>
```

(Task 8 will insert 3 more buttons between "Verificar agora" and "Conexão" — leave a mental note, no action needed now.)

- [ ] **Step 5: Add the `WahaConnectionInfoDialog` component**

Right after `WahaSection`'s closing `}` (before `type WizardPhase = "form" | "creating" | "pairing";`), add:

```tsx
/**
 * Read-only connection details for an already-connected session, plus a
 * "Reconectar" escape hatch. Opened by the "Conexão" button when
 * `status === "connected"` — never auto-restarts on open.
 */
function WahaConnectionInfoDialog({
  account,
  serverName,
  rawState,
  onClose,
  onReconnect,
}: {
  account: IWhatsAppAccount;
  serverName: string;
  rawState: string | undefined;
  onClose: () => void;
  onReconnect: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conexão — {account.label}</DialogTitle>
          <DialogDescription>Detalhes da sessão conectada a este número.</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Servidor</dt>
          <dd className="text-right text-foreground">{serverName}</dd>
          <dt className="text-muted-foreground">Sessão</dt>
          <dd className="text-right font-mono text-foreground">
            {account.providerConfig?.sessionName ?? "—"}
          </dd>
          <dt className="text-muted-foreground">Número</dt>
          <dd className="text-right text-foreground">{account.phoneNumber || "—"}</dd>
          <dt className="text-muted-foreground">Estado</dt>
          <dd className="text-right text-foreground">{rawState ?? "—"}</dd>
        </dl>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button
            onClick={() => {
              onReconnect();
              onClose();
            }}
          >
            <Icon icon="mdi:qrcode-scan" size={14} className="mr-1.5" aria-hidden />
            Reconectar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Render the dialog**

In `WahaSection`'s return block, right after the `{paramsTarget && (...)}` block, add:

```tsx
      {connectionInfoTarget && (
        <WahaConnectionInfoDialog
          account={connectionInfoTarget}
          serverName={servers.find((s) => s.id === connectionInfoTarget.wahaServerId)?.name ?? "—"}
          rawState={rawStates[connectionInfoTarget.id]}
          onClose={() => setConnectionInfoTarget(null)}
          onReconnect={() => void handleRepair(connectionInfoTarget)}
        />
      )}
```

- [ ] **Step 7: Verify the build**

Run: `bun run build`
Expected: success, no new TypeScript errors.

Run: `bun run test`
Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/admin-settings/components/WahaSection.tsx
git commit -m "feat(waha): add Verificar agora and Conexão buttons to the session card"
```

---

### Task 8: Frontend — WahaSection: wire Mensagem de teste / Importar conversas / Sincronizar fotos

**Files:**
- Modify: `src/features/admin-settings/components/WahaSection.tsx`
- Modify: `src/features/admin-settings/components/ImportConversationsDialog.tsx`

**Interfaces:**
- Consumes: `TestMessageDialog` (Task 4), `ImportConversationsDialog`/`SyncAvatarsDialog` (already exist, now WAHA-capable via Tasks 5/6's backend branches).

- [ ] **Step 1: Make `ImportConversationsDialog`'s copy provider-aware**

In `src/features/admin-settings/components/ImportConversationsDialog.tsx`, replace:

```tsx
          <DialogDescription>
            {account
              ? `Conta ${account.label} — traz para o Inbox o histórico que o servidor Evolution tem armazenado.`
              : ""}
          </DialogDescription>
```

with:

```tsx
          <DialogDescription>
            {account
              ? `Conta ${account.label} — traz para o Inbox o histórico que o ${
                  account.provider === "waha" ? "servidor WAHA" : "servidor Evolution"
                } tem armazenado.`
              : ""}
          </DialogDescription>
```

- [ ] **Step 2: Add imports and state to `WahaSection.tsx`**

Add these imports (alongside the existing `InstanceAccessSheet` import):

```ts
import { TestMessageDialog } from "./TestMessageDialog";
import { ImportConversationsDialog } from "./ImportConversationsDialog";
import { SyncAvatarsDialog } from "./SyncAvatarsDialog";
```

Add these 3 state variables (alongside `connectionInfoTarget` from Task 7):

```ts
  const [testTarget, setTestTarget] = useState<IWhatsAppAccount | null>(null);
  const [importTarget, setImportTarget] = useState<IWhatsAppAccount | null>(null);
  const [syncAvatarsTarget, setSyncAvatarsTarget] = useState<IWhatsAppAccount | null>(null);
```

- [ ] **Step 3: Insert the 3 new buttons between "Verificar agora" and "Conexão"**

In the action-buttons block from Task 7, insert these 3 `Button`s right after the "Verificar agora" `Button` and right before the "Conexão"/"Conectar" `Button`:

```tsx
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={row.status !== "connected"}
                          onClick={() => setTestTarget(row)}
                          title={
                            row.status === "connected"
                              ? "Envia um texto padrão para validar a conexão"
                              : "Disponível com a sessão conectada"
                          }
                        >
                          <Icon icon="mdi:message-check-outline" size={14} className="mr-1.5" aria-hidden />
                          Mensagem de teste
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={row.status !== "connected"}
                          onClick={() => setImportTarget(row)}
                          title={
                            row.status === "connected"
                              ? "Importa o histórico de conversas que a sessão WAHA tem armazenado"
                              : "Disponível com a sessão conectada"
                          }
                        >
                          <Icon icon="mdi:download-multiple" size={14} className="mr-1.5" aria-hidden />
                          Importar conversas
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={row.status !== "connected"}
                          onClick={() => setSyncAvatarsTarget(row)}
                          title={
                            row.status === "connected"
                              ? "Busca no WhatsApp a foto de perfil dos contatos e exibe nas Conversas"
                              : "Disponível com a sessão conectada"
                          }
                        >
                          <Icon icon="mdi:image-sync-outline" size={14} className="mr-1.5" aria-hidden />
                          Sincronizar fotos
                        </Button>
```

- [ ] **Step 4: Render the 3 dialogs**

In `WahaSection`'s return block, right after the `{connectionInfoTarget && (...)}` block added in Task 7, add:

```tsx
      <TestMessageDialog account={testTarget} onClose={() => setTestTarget(null)} />
      <ImportConversationsDialog account={importTarget} onClose={() => setImportTarget(null)} />
      <SyncAvatarsDialog account={syncAvatarsTarget} onClose={() => setSyncAvatarsTarget(null)} />
```

- [ ] **Step 5: Verify the build**

Run: `bun run build`
Expected: success.

Run: `bun run test`
Expected: all tests PASS.

- [ ] **Step 6: Manual smoke check (dev server)**

Run the dev server (already running per this session at `http://localhost:5173`) and open `Configurações → WhatsApp → aba WAHA`. Confirm: every session card shows 8 buttons in order — Reiniciar, Parâmetros, Verificar agora, Mensagem de teste, Importar conversas, Sincronizar fotos, Conexão/Conectar, Editar — and that the 3 new dialog-opening buttons are disabled (greyed, with the "Disponível com a sessão conectada" tooltip) on any session whose `status !== "connected"`.

- [ ] **Step 7: Commit**

```bash
git add src/features/admin-settings/components/WahaSection.tsx src/features/admin-settings/components/ImportConversationsDialog.tsx
git commit -m "feat(waha): wire Mensagem de teste, Importar conversas and Sincronizar fotos into the session card"
```

---

### Task 9: Docs + final verification

**Files:**
- Modify: `docs/dev/waha-integration.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by other tasks — this is the final task.

- [ ] **Step 1: Document the new `waha-connect` action**

In `docs/dev/waha-integration.md`, section "4. Resolução em runtime" → `waha-connect`, update the action list sentence to include `test-message` (`{ accountId, action: 'test-message', to }` — ad-hoc validation send via `sendWahaText`, never persisted to `messages`, same text/audit contract as the Evolution equivalent).

- [ ] **Step 2: Document the new shared-edge branches**

In the same file, add a new subsection right after the `waha-send` subsection (before "### Status de deploy"):

```markdown
### Paridade de ações de conta (`whatsapp-import-history` / `whatsapp-avatar-sync`)

Diferente das 3 edges acima, `whatsapp-import-history` e `whatsapp-avatar-sync` **não são isoladas** — já eram compartilhadas entre Evolution e Evolution Go antes da WAHA existir, com um core de aterrissagem (`landNormalizedChat`, em `_shared/whatsapp/import/core.ts`) engine-agnóstico. A WAHA entra como 3º branch em ambas:

- **`whatsapp-import-history`** — `processWahaImportBatch` (`_shared/whatsapp/import/waha-history-core.ts`, espelhado de `src/providers/whatsapp/import/waha-history-core.ts`) pagina `GET /api/{session}/chats` e `GET /api/{session}/chats/{chatId}/messages`, resolve `@lid` via `resolveWahaLid` (mesmo helper do webhook/backfill) e aterrissa via `landNormalizedChat`. Mesmo contrato de lote/cursor (`{done, nextCursor, stats}`) que a Evolution já usa — o diálogo `ImportConversationsDialog` não sabe qual engine está por trás.
- **`whatsapp-avatar-sync`** — novo `fetchPicUrl` via `fetchWahaProfilePictureUrl` (`GET /api/contacts/profile-picture`), mesmo mecanismo de injeção que o branch Evolution Go já usa.
- Ambas resolvem servidor/chave via um `wahaServer.ts` local por edge (mesma convenção do `goServer.ts` — sem `_shared/wahaServer.ts` ainda).

Spec: `docs/superpowers/specs/2026-07-12-waha-account-actions-parity-design.md`.
```

- [ ] **Step 3: Final full verification**

Run: `bun run scripts/sync-whatsapp-shared.ts`
Expected: no diff (already synced by Tasks 2/3; this is a defensive re-run).

Run: `bun run build`
Expected: success.

Run: `bun run test`
Expected: all tests PASS (full suite, including the new files from Tasks 1-3).

- [ ] **Step 4: Commit**

```bash
git add docs/dev/waha-integration.md
git commit -m "docs(waha): document test-message action and import/avatar-sync waha branches"
```

- [ ] **Step 5: Report readiness for deploy**

This plan does NOT deploy anything — `waha-connect`, `whatsapp-import-history` and `whatsapp-avatar-sync` all need a manual redeploy before the new behavior is live, and per project convention that requires explicit owner confirmation for each edge function before running it. Stop here and report which 3 edge functions need redeploying; do not deploy or bump the version without being asked.

---

## Self-Review Notes

**Spec coverage:** §2 (Verificar agora) → Task 7. §3 (Conexão) → Task 7. §4 (Mensagem de teste) → Task 4. §5 (Sincronizar fotos) → Tasks 3 + 5. §6 (Importar conversas) → Tasks 1 + 2 + 6. §6.4 (frontend copy) → Task 8 Step 1. Global Constraints (no migration, isolation, mirror sync, pt-BR copy) → threaded through every task.

**Type consistency verified:** `INormalizedRecord`, `IImportDb`, `IImportAccount`, `IImportBatchResult`, `emptyImportStats` used identically in Task 2's implementation and test as defined in the existing `core.ts`. `IWahaMessagePayload`, `IWahaSessionTarget` used identically across Tasks 1, 2 and 3. `processWahaImportBatch`'s args shape in Task 2 matches exactly how Task 6 calls it.
