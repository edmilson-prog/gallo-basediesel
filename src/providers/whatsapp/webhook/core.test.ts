import { describe, expect, it, vi } from "vitest";
import { MockWhatsAppProvider } from "../mock/MockWhatsAppProvider";
import type { IWhatsAppProvider } from "../IWhatsAppProvider";
import { processWebhookEvent, type IAccountRecord, type IWebhookDb } from "./core";

const ACCOUNT: IAccountRecord = {
  id: "acc-1",
  storeId: "store-1",
  provider: "evolution",
  phoneNumber: "+5555911111111",
  credentialsRef: "WHATSAPP_EVO_TEST",
  providerConfig: { baseUrl: "https://evo.test", instanceName: "gallo-matriz" },
};

interface IFakeState {
  processed: Set<string>;
  customers: Array<{ id: string; storeId: string; phoneDigits: string; sellerId: string }>;
  conversations: Array<{ id: string; customerId: string; accountId: string; open: boolean }>;
  messages: Array<Record<string, unknown>>;
  statusApplied: Array<Record<string, unknown>>;
  uploads: string[];
  audits: Array<Record<string, unknown>>;
  bumps: string[];
  mediaSet: Array<{ messageId: string; mediaUrl: string | null; status: string }>;
  invalidCustomers: string[];
}

function makeFakeDb(state: IFakeState, opts?: { knownOutboundId?: string }): IWebhookDb {
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}-${++seq}`;
  return {
    isProcessed: async (key) => state.processed.has(key),
    markProcessed: async (key) => {
      state.processed.add(key);
    },
    findMetaAccount: async () => ({ ...ACCOUNT, provider: "meta" }),
    findEvolutionAccount: async (instanceName) =>
      instanceName === "gallo-matriz" ? ACCOUNT : null,
    findCustomerByPhone: async (storeId, digits) => {
      const found = state.customers.find((c) => c.storeId === storeId && c.phoneDigits === digits);
      return found ? { id: found.id, sellerId: found.sellerId } : null;
    },
    resolveDefaultSellerId: async () => "seller-manager",
    createPendingCustomer: async ({ storeId, phone, sellerId }) => {
      const customer = {
        id: nextId("cust"),
        storeId,
        phoneDigits: phone.replace(/\D/g, ""),
        sellerId,
      };
      state.customers.push(customer);
      return { id: customer.id, sellerId };
    },
    findOpenConversation: async (customerId, accountId) => {
      const found = state.conversations.find(
        (c) => c.customerId === customerId && c.accountId === accountId && c.open,
      );
      return found ? { id: found.id } : null;
    },
    createConversation: async ({ customerId, accountId }) => {
      const conversation = { id: nextId("conv"), customerId, accountId, open: true };
      state.conversations.push(conversation);
      return { id: conversation.id };
    },
    insertInboundMessage: async (input) => {
      const message = { id: nextId("msg"), ...input };
      state.messages.push(message);
      return { id: message.id as string };
    },
    bumpConversation: async (conversationId) => {
      state.bumps.push(conversationId);
    },
    findOutboundMessageByProviderMessageId: async (pmid) =>
      pmid === opts?.knownOutboundId
        ? {
            id: "msg-outbound-1",
            conversationId: "conv-out-1",
            customerId: "cust-out-1",
            storeId: "store-1",
          }
        : null,
    applyStatusToMessage: async (input) => {
      state.statusApplied.push(input);
    },
    markCustomerWhatsappInvalid: async (customerId) => {
      state.invalidCustomers.push(customerId);
    },
    setMessageMedia: async (messageId, mediaUrl, status) => {
      state.mediaSet.push({ messageId, mediaUrl, status });
    },
    uploadMedia: async (path) => {
      state.uploads.push(path);
    },
    audit: async (input) => {
      state.audits.push(input);
    },
  };
}

function emptyState(): IFakeState {
  return {
    processed: new Set(),
    customers: [],
    conversations: [],
    messages: [],
    statusApplied: [],
    uploads: [],
    audits: [],
    bumps: [],
    mediaSet: [],
    invalidCustomers: [],
  };
}

function evolutionTextEvent(text = "preciso de um filtro", keyId = "EVOKEY1") {
  return {
    event: "messages.upsert",
    instance: "gallo-matriz",
    sender: "5555911111111@s.whatsapp.net",
    data: {
      key: { id: keyId, remoteJid: "5555988887777@s.whatsapp.net", fromMe: false },
      message: { conversation: text },
      messageTimestamp: 1765400000,
    },
  };
}

const buildMock = (): IWhatsAppProvider => new MockWhatsAppProvider();

function run(
  state: IFakeState,
  rawPayload: unknown,
  overrides?: Partial<Parameters<typeof processWebhookEvent>[0]>,
) {
  return processWebhookEvent({
    provider: "evolution",
    rawPayload,
    db: makeFakeDb(state),
    buildProvider: buildMock,
    traceId: "trace-test",
    ...overrides,
  });
}

describe("processWebhookEvent — inbound messages (RF-040/050)", () => {
  it("creates customer (pending, default seller), conversation and message for a new contact", async () => {
    const state = emptyState();
    const result = await run(state, evolutionTextEvent());

    expect(result.outcome).toBe("message-created");
    expect(state.customers).toHaveLength(1);
    expect(state.customers[0]?.sellerId).toBe("seller-manager");
    expect(state.conversations).toHaveLength(1);
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toMatchObject({
      provider: "evolution",
      text: "preciso de um filtro",
      providerMessageId: "EVOKEY1",
    });
    expect(state.bumps).toEqual([state.conversations[0]?.id]);
    expect(state.processed.has("whatsapp:evolution:EVOKEY1")).toBe(true);
    expect(state.audits[0]).toMatchObject({
      action: "webhook_received",
      after: expect.objectContaining({ fromPhoneMasked: "***7777", customerCreated: true }),
    });
  });

  it("reuses existing customer and open conversation (no duplication)", async () => {
    const state = emptyState();
    state.customers.push({
      id: "cust-old",
      storeId: "store-1",
      phoneDigits: "5555988887777",
      sellerId: "seller-lucas",
    });
    state.conversations.push({
      id: "conv-old",
      customerId: "cust-old",
      accountId: "acc-1",
      open: true,
    });

    const result = await run(state, evolutionTextEvent("segunda mensagem", "EVOKEY2"));

    expect(result).toMatchObject({ outcome: "message-created", conversationId: "conv-old" });
    expect(state.customers).toHaveLength(1);
    expect(state.conversations).toHaveLength(1);
  });

  it("does NOT reuse a closed conversation — opens a new one", async () => {
    const state = emptyState();
    state.customers.push({
      id: "cust-old",
      storeId: "store-1",
      phoneDigits: "5555988887777",
      sellerId: "seller-lucas",
    });
    state.conversations.push({
      id: "conv-closed",
      customerId: "cust-old",
      accountId: "acc-1",
      open: false,
    });

    const result = await run(state, evolutionTextEvent());
    expect(result.outcome).toBe("message-created");
    expect(result.conversationId).not.toBe("conv-closed");
    expect(state.conversations).toHaveLength(2);
  });

  it("is idempotent — the same event never creates a second message (RNF-002)", async () => {
    const state = emptyState();
    await run(state, evolutionTextEvent());
    const second = await run(state, evolutionTextEvent());

    expect(second.outcome).toBe("duplicate");
    expect(state.messages).toHaveLength(1);
  });

  it("returns account-not-found (and does not mark processed) for unknown instances", async () => {
    const state = emptyState();
    const payload = { ...evolutionTextEvent(), instance: "outra-instancia" };
    const result = await run(state, payload);

    expect(result.outcome).toBe("account-not-found");
    expect(state.messages).toHaveLength(0);
    expect(state.processed.size).toBe(0);
  });

  it("ignores unparseable payloads and own-message echoes (RNF-007)", async () => {
    const state = emptyState();
    const warn = vi.fn();
    expect((await run(state, { foo: "bar" }, { warn })).outcome).toBe("ignored");
    const echo = evolutionTextEvent();
    echo.data.key.fromMe = true;
    expect((await run(state, echo, { warn })).outcome).toBe("ignored");
    expect(warn).toHaveBeenCalledTimes(2);
    expect(state.messages).toHaveLength(0);
  });
});

describe("processWebhookEvent — statuses (RF-060/061)", () => {
  function statusEvent(status = "READ", keyId = "OUT1") {
    return {
      event: "messages.update",
      instance: "gallo-matriz",
      data: { keyId, status, messageTimestamp: 1765400100 },
    };
  }

  it("applies delivered/read status to a known outbound message", async () => {
    const state = emptyState();
    const result = await processWebhookEvent({
      provider: "evolution",
      rawPayload: statusEvent(),
      db: makeFakeDb(state, { knownOutboundId: "OUT1" }),
      buildProvider: buildMock,
      traceId: "t",
    });

    expect(result).toMatchObject({ outcome: "status-applied", messageId: "msg-outbound-1" });
    expect(state.statusApplied[0]).toMatchObject({
      status: "read",
      eventKey: "whatsapp:evolution:OUT1",
    });
    expect(state.processed.has("whatsapp:evolution:OUT1")).toBe(true);
  });

  function metaFailedStatusEvent(code: number, keyId = "wamid.OUT") {
    return {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { display_phone_number: "5555911111111", phone_number_id: "123" },
                statuses: [
                  {
                    id: keyId,
                    status: "failed",
                    timestamp: "1765400100",
                    errors: [{ code, title: "Falha", message: `meta error ${code}` }],
                  },
                ],
              },
            },
          ],
        },
      ],
    };
  }

  it("Meta 131026 marks the customer's whatsapp as invalid and audits it (PRD-118 RF-050)", async () => {
    const state = emptyState();
    const result = await processWebhookEvent({
      provider: "meta",
      rawPayload: metaFailedStatusEvent(131026),
      db: makeFakeDb(state, { knownOutboundId: "wamid.OUT" }),
      buildProvider: buildMock,
      traceId: "t",
    });

    expect(result.outcome).toBe("status-applied");
    expect(state.statusApplied[0]).toMatchObject({ status: "failed", failureCode: "131026" });
    expect(state.invalidCustomers).toEqual(["cust-out-1"]);
    expect(state.audits[0]).toMatchObject({
      action: "customer_whatsapp_marked_invalid",
      resourceId: "cust-out-1",
    });
  });

  it("other failure codes do NOT flag the customer", async () => {
    const state = emptyState();
    await processWebhookEvent({
      provider: "meta",
      rawPayload: metaFailedStatusEvent(131047),
      db: makeFakeDb(state, { knownOutboundId: "wamid.OUT" }),
      buildProvider: buildMock,
      traceId: "t",
    });

    expect(state.statusApplied[0]).toMatchObject({ status: "failed", failureCode: "131047" });
    expect(state.invalidCustomers).toEqual([]);
    expect(state.audits).toHaveLength(0);
  });

  it("logs and marks processed when the outbound message is unknown", async () => {
    const state = emptyState();
    const warn = vi.fn();
    const result = await processWebhookEvent({
      provider: "evolution",
      rawPayload: statusEvent("DELIVERY_ACK", "GHOST"),
      db: makeFakeDb(state),
      buildProvider: buildMock,
      traceId: "t",
      warn,
    });

    expect(result.outcome).toBe("status-unmatched");
    expect(warn).toHaveBeenCalled();
    expect(state.processed.has("whatsapp:evolution:GHOST")).toBe(true);
  });
});

describe("processWebhookEvent — media (RF-070, RNF-006)", () => {
  function mediaEvent() {
    const event = evolutionTextEvent("", "EVOMEDIA1");
    event.data.message = {
      imageMessage: { caption: "foto da peça", mimetype: "image/jpeg" },
    } as never;
    return event;
  }

  it("downloads media, uploads to storage and stamps the path", async () => {
    const state = emptyState();
    const result = await run(state, mediaEvent());

    expect(result.outcome).toBe("message-created");
    expect(state.uploads).toHaveLength(1);
    expect(state.uploads[0]).toMatch(
      new RegExp(`^conversations/${result.conversationId}/${result.messageId}/media\\.`),
    );
    expect(state.mediaSet[0]).toMatchObject({ messageId: result.messageId, status: "ok" });
  });

  it("marks media failed on timeout but keeps the message (download não bloqueia)", async () => {
    const state = emptyState();
    const slowProvider = new MockWhatsAppProvider();
    slowProvider.downloadInboundMedia = () => new Promise(() => {});
    const warn = vi.fn();

    const result = await run(state, mediaEvent(), {
      buildProvider: () => slowProvider,
      mediaTimeoutMs: 20,
      warn,
    });

    expect(result.outcome).toBe("message-created");
    expect(state.messages).toHaveLength(1);
    expect(state.mediaSet[0]).toMatchObject({ mediaUrl: null, status: "failed" });
    expect(state.processed.has("whatsapp:evolution:EVOMEDIA1")).toBe(true);
    expect(warn).toHaveBeenCalledWith("inbound media download failed", expect.anything());
  });
});

describe("processWebhookEvent — meta routing", () => {
  it("parses a Meta envelope and resolves the meta account", async () => {
    const state = emptyState();
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { display_phone_number: "5555911111111", phone_number_id: "123" },
                messages: [
                  {
                    id: "wamid.X",
                    from: "5555988887777",
                    timestamp: "1765400000",
                    type: "text",
                    text: { body: "olá" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const result = await processWebhookEvent({
      provider: "meta",
      rawPayload: payload,
      db: makeFakeDb(state),
      buildProvider: buildMock,
      traceId: "t",
    });

    expect(result.outcome).toBe("message-created");
    expect(state.messages[0]).toMatchObject({ provider: "meta", providerMessageId: "wamid.X" });
  });
});
