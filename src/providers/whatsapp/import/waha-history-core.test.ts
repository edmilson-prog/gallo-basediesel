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
      async findConversation(customerId) {
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

  it("retries a transient failure listing chats instead of crashing the whole batch", async () => {
    // Regression test: found 2026-07-14 on a real Vendas (1000+ conversation)
    // import — fetchAllWahaChatIds re-lists the whole chat set on every batch
    // call, and one dropped page anywhere in that volume threw uncaught,
    // crashing the request with a 500 instead of the batch just continuing.
    let chatsCalls = 0;
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("/chats?")) {
        chatsCalls++;
        if (chatsCalls === 1) return jsonResponse(500, { message: "temporary hiccup" });
        return jsonResponse(200, [{ id: "5548999887766@c.us" }]);
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
    });
    expect(chatsCalls).toBe(2);
    expect(result.stats.chatsProcessed).toBe(1);
  });

  it("retries a transient failure fetching a chat's messages", async () => {
    let messagesCalls = 0;
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("/chats?")) return jsonResponse(200, [{ id: "5548999887766@c.us" }]);
      if (url.includes("/messages?")) {
        messagesCalls++;
        if (messagesCalls === 1) return jsonResponse(429, { message: "rate limited" });
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
    expect(messagesCalls).toBe(2);
    expect(result.stats.chatsProcessed).toBe(1);
    expect(result.stats.messagesImported).toBe(1);
  });

  it("does not retry a non-transient error (401) — fails the chat immediately", async () => {
    let chatsCalls = 0;
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("/chats?")) {
        chatsCalls++;
        return jsonResponse(200, [{ id: "5548999887766@c.us" }]);
      }
      if (url.includes("/messages?")) return jsonResponse(401, { message: "invalid key" });
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
    expect(chatsCalls).toBe(1);
    expect(result.stats.chatsFailed).toBe(1);
    expect(result.stats.chatsProcessed).toBe(0);
  });
});
