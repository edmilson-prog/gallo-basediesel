import { describe, expect, it } from "vitest";
import {
  emptyImportStats,
  landNormalizedChat,
  processImportBatch,
  type IImportDb,
  type IImportSource,
  type INormalizedRecord,
} from "./core";
import type { IEvolutionStoredMessage } from "../evolution/instance";

const ACCOUNT = { id: "acc-1", storeId: "store-1" };

interface IFakeState {
  customers: Array<{ id: string; phoneDigits: string }>;
  conversations: Array<Record<string, unknown>>;
  messages: Array<Record<string, unknown>>;
  known: Set<string>;
  advances: Array<{ conversationId: string; lastMessageAt: string }>;
}

function emptyState(): IFakeState {
  return { customers: [], conversations: [], messages: [], known: new Set(), advances: [] };
}

function makeDb(state: IFakeState): IImportDb {
  let seq = 0;
  const nextId = (p: string) => `${p}-${++seq}`;
  return {
    findCustomerByPhone: async (_storeId, digits) => {
      const found = state.customers.find((c) => c.phoneDigits === digits);
      return found ? { id: found.id } : null;
    },
    createPendingCustomer: async ({ phone }) => {
      const customer = { id: nextId("cust"), phoneDigits: phone.replace(/\D/g, "") };
      state.customers.push(customer);
      return { id: customer.id };
    },
    findConversation: async (customerId) => {
      const found = state.conversations.find((c) => c.customerId === customerId);
      return found ? { id: found.id as string } : null;
    },
    createConversation: async (input) => {
      const conversation = { id: nextId("conv"), ...input };
      state.conversations.push(conversation);
      return { id: conversation.id as string };
    },
    filterKnownProviderMessageIds: async (ids) => new Set(ids.filter((id) => state.known.has(id))),
    insertImportedMessages: async (rows) => {
      for (const row of rows) {
        state.messages.push(row);
        state.known.add(row.providerMessageId);
      }
    },
    advanceConversationActivity: async (conversationId, lastMessageAt) => {
      state.advances.push({ conversationId, lastMessageAt });
    },
  };
}

function storedText(
  id: string,
  fromMe: boolean,
  ts: number,
  text = "msg",
  status?: string,
): IEvolutionStoredMessage {
  return {
    key: { id, remoteJid: "5555988887777@s.whatsapp.net", fromMe },
    message: { conversation: text },
    messageTimestamp: ts,
    status,
  };
}

function makeSource(
  chats: string[],
  byJid: Record<string, IEvolutionStoredMessage[]>,
): IImportSource {
  return {
    listChats: async () => chats,
    listMessages: async (remoteJid, page) =>
      page === 1 ? { records: byJid[remoteJid] ?? [], pages: 1 } : { records: [], pages: 1 },
  };
}

describe("processImportBatch", () => {
  it("imports an individual chat end-to-end: pending customer, aguardando conversation, in/out messages", async () => {
    const state = emptyState();
    const source = makeSource(["5555988887777@s.whatsapp.net"], {
      "5555988887777@s.whatsapp.net": [
        storedText("M2", true, 1765400100, "resposta", "READ"),
        storedText("M1", false, 1765400000, "pergunta"),
      ],
    });
    const result = await processImportBatch({ account: ACCOUNT, source, db: makeDb(state) });

    expect(result.done).toBe(true);
    expect(result.stats).toMatchObject({
      chatsProcessed: 1,
      customersCreated: 1,
      conversationsCreated: 1,
      messagesImported: 2,
      messagesSkipped: 0,
    });
    expect(state.conversations[0]).toMatchObject({
      status: "aguardando",
      accountId: "acc-1",
      // Imported conversations land in the pool, never auto-assigned to the
      // customer's wallet owner — connecting an instance drops its history to
      // whoever operates that number to pick up.
      assignedSellerId: null,
      createdAt: new Date(1765400000 * 1000).toISOString(),
      lastMessageAt: new Date(1765400100 * 1000).toISOString(),
    });
    const directions = state.messages.map((m) => [m.providerMessageId, m.direction, m.status]);
    expect(directions).toContainEqual(["M1", "in", "delivered"]);
    expect(directions).toContainEqual(["M2", "out", "read"]);
    const inbound = state.messages.find((m) => m.providerMessageId === "M1");
    expect(inbound?.authorId).toBe(state.customers[0]?.id);
    const outbound = state.messages.find((m) => m.providerMessageId === "M2");
    expect(outbound?.authorId).toBeNull();
    expect(state.advances).toEqual([
      {
        conversationId: state.conversations[0]?.id,
        lastMessageAt: new Date(1765400100 * 1000).toISOString(),
      },
    ]);
  });

  it("classifies skipped chats by JID type (group / list-channel / hidden-number / other)", async () => {
    const state = emptyState();
    const source = makeSource(
      [
        "1203630@g.us", // group
        "status@broadcast", // broadcast list / status
        "99@newsletter", // channel / newsletter
        "123456789@lid", // hidden-number privacy contact (a REAL 1:1, not a group)
        "weird@unknown", // any other non-individual suffix
        "5555988887777@s.whatsapp.net", // importable individual chat
      ],
      { "5555988887777@s.whatsapp.net": [storedText("M1", false, 1765400000)] },
    );
    const result = await processImportBatch({ account: ACCOUNT, source, db: makeDb(state) });
    expect(result.stats.chatsSkippedGroup).toBe(1); // @g.us only
    expect(result.stats.chatsSkippedBroadcast).toBe(2); // @broadcast + @newsletter
    expect(result.stats.chatsSkippedLid).toBe(1); // @lid
    expect(result.stats.chatsSkippedOther).toBe(1); // unknown suffix
    expect(result.stats.chatsProcessed).toBe(1);
  });

  it("is idempotent: already-known provider_message_ids are skipped and empty chats create nothing", async () => {
    const state = emptyState();
    state.known.add("M1");
    const source = makeSource(["5555988887777@s.whatsapp.net"], {
      "5555988887777@s.whatsapp.net": [storedText("M1", false, 1765400000)],
    });
    const result = await processImportBatch({ account: ACCOUNT, source, db: makeDb(state) });
    expect(result.stats.messagesSkipped).toBe(1);
    expect(result.stats.conversationsCreated).toBe(0);
    expect(state.conversations).toHaveLength(0);
  });

  it("dedups partially overlapping pages within the same batch (sliding window)", async () => {
    const state = emptyState();
    const pages: Record<number, IEvolutionStoredMessage[]> = {
      1: [storedText("A", false, 1765400000), storedText("B", false, 1765400001)],
      2: [storedText("B", false, 1765400001), storedText("C", false, 1765400002)],
      3: [],
    };
    const source: IImportSource = {
      listChats: async () => ["5555988887777@s.whatsapp.net"],
      listMessages: async (_jid, page) => ({ records: pages[page] ?? [] }),
    };
    const result = await processImportBatch({ account: ACCOUNT, source, db: makeDb(state) });
    expect(result.stats.messagesImported).toBe(3);
    expect(result.stats.messagesSkipped).toBe(1); // the repeated B
    const ids = state.messages.map((m) => m.providerMessageId).sort();
    expect(ids).toEqual(["A", "B", "C"]);
  });

  it("paginates chats with a stable cursor (sorted jids) and reports done only at the end", async () => {
    const state = emptyState();
    const jids = ["551199@s.whatsapp.net", "552299@s.whatsapp.net", "553399@s.whatsapp.net"];
    const source = makeSource(
      jids,
      Object.fromEntries(jids.map((j, i) => [j, [storedText(`M${i}`, false, 1765400000 + i)]])),
    );
    const first = await processImportBatch({
      account: ACCOUNT,
      source,
      db: makeDb(state),
      batchSize: 2,
    });
    expect(first).toMatchObject({ done: false, nextCursor: 2 });
    const second = await processImportBatch({
      account: ACCOUNT,
      source,
      db: makeDb(state),
      cursor: first.nextCursor,
      batchSize: 2,
    });
    expect(second.done).toBe(true);
    expect(first.stats.chatsProcessed + second.stats.chatsProcessed).toBe(3);
  });

  it("skips records without a key id or without renderable content", async () => {
    const state = emptyState();
    const source = makeSource(["5555988887777@s.whatsapp.net"], {
      "5555988887777@s.whatsapp.net": [
        {
          key: { remoteJid: "5555988887777@s.whatsapp.net", fromMe: false },
          message: { conversation: "sem id" },
          messageTimestamp: 1765400000,
        },
        {
          key: { id: "PROTO", remoteJid: "5555988887777@s.whatsapp.net", fromMe: false },
          message: {},
          messageTimestamp: 1765400000,
        },
        storedText("OK1", false, 1765400000),
      ],
    });
    const result = await processImportBatch({ account: ACCOUNT, source, db: makeDb(state) });
    expect(result.stats.messagesImported).toBe(1);
    expect(result.stats.messagesSkipped).toBe(2);
  });

  it("skips records without a valid second-epoch timestamp (missing or ms-epoch)", async () => {
    const state = emptyState();
    const jid = "5555988887777@s.whatsapp.net";
    const source = makeSource([jid], {
      [jid]: [
        {
          key: { id: "NOTS", remoteJid: jid, fromMe: false },
          message: { conversation: "sem relógio" },
        },
        storedText("MSEPOCH", false, 1765400000000), // ms epoch → decades in the future
        storedText("OK1", false, 1765400000),
      ],
    });
    const result = await processImportBatch({ account: ACCOUNT, source, db: makeDb(state) });
    expect(result.stats.messagesImported).toBe(1);
    expect(result.stats.messagesSkipped).toBe(2);
    expect(state.messages.map((m) => m.providerMessageId)).toEqual(["OK1"]);
  });

  it("advances past a poisoned chat: failure is counted, the rest still imports", async () => {
    const state = emptyState();
    const source: IImportSource = {
      listChats: async () => ["551111@s.whatsapp.net", "552222@s.whatsapp.net"],
      listMessages: async (remoteJid, page) => {
        if (remoteJid === "551111@s.whatsapp.net") throw new Error("boom");
        return page === 1
          ? { records: [storedText("G1", false, 1765400000)], pages: 1 }
          : { records: [], pages: 1 };
      },
    };
    const result = await processImportBatch({ account: ACCOUNT, source, db: makeDb(state) });
    expect(result.done).toBe(true);
    expect(result.stats.chatsFailed).toBe(1);
    expect(result.stats.chatsProcessed).toBe(1);
    expect(result.stats.messagesImported).toBe(1);
  });

  it("stops paging when a non-paginating server repeats the same page", async () => {
    const state = emptyState();
    let calls = 0;
    const samePage = [storedText("R1", false, 1765400000), storedText("R2", false, 1765400001)];
    const source: IImportSource = {
      listChats: async () => ["5555988887777@s.whatsapp.net"],
      listMessages: async () => {
        calls++;
        return { records: samePage }; // no `pages`, always the same full page
      },
    };
    const result = await processImportBatch({ account: ACCOUNT, source, db: makeDb(state) });
    expect(calls).toBe(2); // page 1 + the identical page 2 → stop
    expect(result.stats.messagesImported).toBe(2); // R1/R2 only once
  });

  it("clamps batchSize to at least 1 so the cursor always progresses", async () => {
    const state = emptyState();
    const jids = ["551199@s.whatsapp.net", "552299@s.whatsapp.net"];
    const source = makeSource(
      jids,
      Object.fromEntries(jids.map((j, i) => [j, [storedText(`B${i}`, false, 1765400000 + i)]])),
    );
    const result = await processImportBatch({
      account: ACCOUNT,
      source,
      db: makeDb(state),
      batchSize: 0,
    });
    expect(result.nextCursor).toBeGreaterThan(0);
    expect(result.done).toBe(false);
  });

  it("accumulates stats helpers (emptyImportStats baseline)", () => {
    expect(emptyImportStats()).toEqual({
      chatsProcessed: 0,
      chatsSkippedGroup: 0,
      chatsSkippedBroadcast: 0,
      chatsSkippedLid: 0,
      chatsSkippedOther: 0,
      chatsFailed: 0,
      customersCreated: 0,
      conversationsCreated: 0,
      messagesImported: 0,
      messagesSkipped: 0,
    });
  });
});

const isoOf = (sec: number) => new Date(sec * 1000).toISOString();
const normRec = (
  providerMessageId: string,
  direction: "in" | "out",
  ts: number,
  text = "msg",
): INormalizedRecord => ({
  providerMessageId,
  direction,
  text,
  mediaType: null,
  status: direction === "out" ? "sent" : "delivered",
  sentAt: isoOf(ts),
});

describe("landNormalizedChat", () => {
  it("creates a pool conversation, dedups by id in-memory, lands in/out rows", async () => {
    const state = emptyState();
    const stats = emptyImportStats();
    await landNormalizedChat({
      account: ACCOUNT,
      db: makeDb(state),
      phone: "+5555988887777",
      normalized: [
        normRec("X1", "in", 1765400000, "pergunta"),
        normRec("X1", "in", 1765400000, "duplicada"), // same id → dedup
        normRec("X2", "out", 1765400100, "resposta"),
      ],
      stats,
    });

    expect(stats).toMatchObject({
      customersCreated: 1,
      conversationsCreated: 1,
      messagesImported: 2,
      messagesSkipped: 1, // the duplicate X1
    });
    expect(state.conversations[0]).toMatchObject({
      status: "aguardando",
      accountId: "acc-1",
      assignedSellerId: null,
      createdAt: isoOf(1765400000),
      lastMessageAt: isoOf(1765400100),
    });
    const inbound = state.messages.find((m) => m.providerMessageId === "X1");
    expect(inbound?.authorId).toBe(state.customers[0]?.id);
    const outbound = state.messages.find((m) => m.providerMessageId === "X2");
    expect(outbound?.authorId).toBeNull();
    expect(state.advances).toEqual([
      { conversationId: state.conversations[0]?.id, lastMessageAt: isoOf(1765400100) },
    ]);
  });

  it("reuses an existing customer and open conversation (no duplicate creation)", async () => {
    const state = emptyState();
    state.customers.push({ id: "cust-existing", phoneDigits: "5555988887777" });
    state.conversations.push({ id: "conv-existing", customerId: "cust-existing" });
    const stats = emptyImportStats();
    await landNormalizedChat({
      account: ACCOUNT,
      db: makeDb(state),
      phone: "+5555988887777",
      normalized: [normRec("Y1", "in", 1765400000)],
      stats,
    });
    expect(stats.customersCreated).toBe(0);
    expect(stats.conversationsCreated).toBe(0);
    expect(state.messages.map((m) => m.providerMessageId)).toEqual(["Y1"]);
  });

  it("reuses an existing CLOSED conversation instead of spawning a duplicate", async () => {
    // Regression test: a migrated account's already-resolved conversations
    // must absorb re-imported history, not fork into a second conversation
    // for the same customer (found 2026-07-14 on a real Evolution→WAHA
    // migration — the import used to filter to open-only, unlike the live
    // webhook's customer-inbound reopen rule).
    const state = emptyState();
    state.customers.push({ id: "cust-existing", phoneDigits: "5555988887777" });
    state.conversations.push({
      id: "conv-closed",
      customerId: "cust-existing",
      status: "resolvida",
    });
    const stats = emptyImportStats();
    await landNormalizedChat({
      account: ACCOUNT,
      db: makeDb(state),
      phone: "+5555988887777",
      normalized: [normRec("Z1", "in", 1765400000)],
      stats,
    });
    expect(stats.conversationsCreated).toBe(0);
    expect(state.conversations).toHaveLength(1);
    expect(state.conversations[0]).toMatchObject({ id: "conv-closed", status: "resolvida" });
    const landed = state.messages.find((m) => m.providerMessageId === "Z1");
    expect(landed?.conversationId).toBe("conv-closed");
  });

  it("creates nothing when every record is already known (idempotent re-run)", async () => {
    const state = emptyState();
    state.known.add("K1");
    const stats = emptyImportStats();
    await landNormalizedChat({
      account: ACCOUNT,
      db: makeDb(state),
      phone: "+5555988887777",
      normalized: [normRec("K1", "in", 1765400000)],
      stats,
    });
    expect(state.conversations).toHaveLength(0);
    expect(state.customers).toHaveLength(0);
    expect(stats.conversationsCreated).toBe(0);
  });

  it("carries the original mediaFilename through to the inserted row (document import)", async () => {
    const state = emptyState();
    const stats = emptyImportStats();
    const doc: INormalizedRecord = {
      providerMessageId: "D1",
      direction: "in",
      text: "",
      mediaType: "document",
      mediaFilename: "Historico.pdf",
      status: "delivered",
      sentAt: isoOf(1765400000),
    };
    await landNormalizedChat({
      account: ACCOUNT,
      db: makeDb(state),
      phone: "+5555988887777",
      normalized: [doc],
      stats,
    });
    const inserted = state.messages.find((m) => m.providerMessageId === "D1");
    expect(inserted).toMatchObject({ mediaType: "document", mediaFilename: "Historico.pdf" });
  });
});
