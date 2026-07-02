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
  customers: Array<{
    id: string;
    storeId: string;
    phoneDigits: string;
    /** Real customers carry an owner; auto-created (imported) anchors do not. */
    sellerId?: string;
    name?: string;
    whatsappName?: string;
  }>;
  /** Records of applyInboundContactName calls (whatsapp_name + heal path). */
  nameFills: Array<{ customerId: string; name: string }>;
  conversations: Array<{
    id: string;
    customerId: string;
    accountId: string;
    open: boolean;
    status?: string;
  }>;
  messages: Array<Record<string, unknown>>;
  statusApplied: Array<Record<string, unknown>>;
  uploads: string[];
  audits: Array<Record<string, unknown>>;
  bumps: string[];
  touches: Array<{ conversationId: string; lastMessageAt: string }>;
  mediaSet: Array<{ messageId: string; mediaUrl: string | null; status: string }>;
  invalidCustomers: string[];
  /** Simulated whatsapp_accounts.status for the single test account. */
  accountStatus: string;
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
      instanceName === "gallo-matriz" && state.accountStatus !== "disconnected" ? ACCOUNT : null,
    findEvolutionAccountAnyStatus: async (instanceName) =>
      instanceName === "gallo-matriz" ? ACCOUNT : null,
    findEvolutionGoAccount: async (instanceId) =>
      instanceId === "inst-9" && state.accountStatus !== "disconnected"
        ? { ...ACCOUNT, provider: "evolution-go" as const }
        : null,
    findEvolutionGoAccountAnyStatus: async (instanceId) =>
      instanceId === "inst-9" ? { ...ACCOUNT, provider: "evolution-go" as const } : null,
    setAccountConnectionStatus: async (_accountId, status) => {
      if (state.accountStatus === status) return false;
      state.accountStatus = status;
      return true;
    },
    findCustomerByPhone: async (storeId, digits) => {
      const found = state.customers.find((c) => c.storeId === storeId && c.phoneDigits === digits);
      return found ? { id: found.id } : null;
    },
    createPendingCustomer: async ({ storeId, phone, name }) => {
      const customer = {
        id: nextId("cust"),
        storeId,
        phoneDigits: phone.replace(/\D/g, ""),
        name,
        whatsappName: name,
      };
      state.customers.push(customer);
      return { id: customer.id };
    },
    applyInboundContactName: async (customerId, name) => {
      state.nameFills.push({ customerId, name });
      const customer = state.customers.find((c) => c.id === customerId);
      if (!customer) return;
      // Always refresh the live WhatsApp name.
      customer.whatsappName = name;
      // Heal the display name only while it's empty / phone-like (no letter).
      const current = customer.name ?? "";
      if (current === "" || !/\p{L}/u.test(current)) customer.name = name;
    },
    findOpenConversation: async (customerId, accountId) => {
      const found = state.conversations.find(
        (c) => c.customerId === customerId && c.accountId === accountId && c.open,
      );
      return found ? { id: found.id } : null;
    },
    createConversation: async ({ customerId, accountId, status, assignedSellerId }) => {
      const conversation = {
        id: nextId("conv"),
        customerId,
        accountId,
        open: true,
        status,
        assignedSellerId,
      };
      state.conversations.push(conversation);
      return { id: conversation.id };
    },
    insertOutboundEchoMessage: async (input) => {
      const message = { id: nextId("msg"), direction: "out", ...input };
      state.messages.push(message);
      return { id: message.id as string };
    },
    touchConversation: async (conversationId, lastMessageAt) => {
      state.touches.push({ conversationId, lastMessageAt });
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
    nameFills: [],
    conversations: [],
    messages: [],
    statusApplied: [],
    uploads: [],
    audits: [],
    bumps: [],
    touches: [],
    mediaSet: [],
    invalidCustomers: [],
    accountStatus: "connected",
  };
}

function evolutionTextEvent(text = "preciso de um filtro", keyId = "EVOKEY1", pushName?: string) {
  return {
    event: "messages.upsert",
    instance: "gallo-matriz",
    sender: "5555911111111@s.whatsapp.net",
    data: {
      key: { id: keyId, remoteJid: "5555988887777@s.whatsapp.net", fromMe: false },
      pushName,
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
  it("creates customer (pending, no wallet owner), conversation and message for a new contact", async () => {
    const state = emptyState();
    const result = await run(state, evolutionTextEvent());

    expect(result.outcome).toBe("message-created");
    expect(state.customers).toHaveLength(1);
    // Imported/auto-created anchors carry NO wallet owner (seller_id null) until
    // manually converted — the webhook never assigns a seller.
    expect(state.customers[0]?.sellerId).toBeUndefined();
    expect(state.conversations).toHaveLength(1);
    // New inbound conversations land UNASSIGNED (queue), never auto-assigned to
    // the customer's wallet owner — visibility is by instance access.
    expect(state.conversations[0]).toMatchObject({ assignedSellerId: null });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toMatchObject({
      provider: "evolution",
      text: "preciso de um filtro",
      providerMessageId: "EVOKEY1",
      mediaFilename: null,
    });
    expect(state.bumps).toEqual([state.conversations[0]?.id]);
    expect(state.processed.has("whatsapp:evolution:EVOKEY1")).toBe(true);
    expect(state.audits[0]).toMatchObject({
      action: "webhook_received",
      after: expect.objectContaining({ fromPhoneMasked: "***7777", customerCreated: true }),
    });
  });

  it("fires onCustomerAutoCreated once for a brand-new contact (background photo)", async () => {
    const state = emptyState();
    const onCustomerAutoCreated = vi.fn();
    await run(state, evolutionTextEvent(), { onCustomerAutoCreated });

    expect(onCustomerAutoCreated).toHaveBeenCalledTimes(1);
    expect(onCustomerAutoCreated).toHaveBeenCalledWith({
      customerId: state.customers[0]?.id,
      phone: "+5555988887777",
      account: ACCOUNT,
    });
  });

  it("does NOT fire onCustomerAutoCreated when the contact already exists", async () => {
    const state = emptyState();
    state.customers.push({
      id: "cust-old",
      storeId: "store-1",
      phoneDigits: "5555988887777",
      sellerId: "seller-lucas",
    });
    const onCustomerAutoCreated = vi.fn();
    await run(state, evolutionTextEvent("oi de novo", "EVOKEY9"), { onCustomerAutoCreated });

    expect(onCustomerAutoCreated).not.toHaveBeenCalled();
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

  it("ignores unparseable payloads (RNF-007)", async () => {
    const state = emptyState();
    const warn = vi.fn();
    // Unparseable payload → parse throws → warn called once
    expect((await run(state, { foo: "bar" }, { warn })).outcome).toBe("ignored");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("ignores upsert payloads without data.key.id (empty provider message id)", async () => {
    const state = emptyState();
    const event = evolutionTextEvent();
    (event.data.key as { id?: string }).id = undefined;
    const result = await run(state, event);
    expect(result).toMatchObject({ outcome: "ignored", detail: "missing provider message id" });
    expect(state.messages).toHaveLength(0);
    expect(state.processed.size).toBe(0);
    expect(state.audits).toHaveLength(0);
  });

  it("names a brand-new contact from the inbound pushName", async () => {
    const state = emptyState();
    await run(state, evolutionTextEvent("oi", "EVONAME1", "João da Oficina"));
    expect(state.customers[0]?.name).toBe("João da Oficina");
  });

  it("creates without a name (phone fallback) when pushName is absent or phone-like", async () => {
    const state = emptyState();
    await run(state, evolutionTextEvent("oi", "EVONAME2")); // no pushName
    expect(state.customers[0]?.name).toBeUndefined();

    const state2 = emptyState();
    await run(state2, evolutionTextEvent("oi", "EVONAME3", "+55 55 98888-7777")); // digits only
    expect(state2.customers[0]?.name).toBeUndefined();
  });

  it("heals an existing phone-named contact from the inbound pushName", async () => {
    const state = emptyState();
    state.customers.push({
      id: "cust-old",
      storeId: "store-1",
      phoneDigits: "5555988887777",
      sellerId: "seller-lucas",
    });
    await run(state, evolutionTextEvent("oi de novo", "EVONAME4", "Maria Peças"));
    expect(state.nameFills).toEqual([{ customerId: "cust-old", name: "Maria Peças" }]);
  });

  it("refreshes whatsapp_name but never overwrites a hand-edited display name", async () => {
    const state = emptyState();
    state.customers.push({
      id: "cust-renamed",
      storeId: "store-1",
      phoneDigits: "5555988887777",
      sellerId: "seller-lucas",
      name: "Oficina do Zé", // a manually-set name (has letters)
    });
    await run(state, evolutionTextEvent("oi", "EVONAME5", "José Carlos"));
    const customer = state.customers.find((c) => c.id === "cust-renamed");
    expect(customer?.whatsappName).toBe("José Carlos"); // live name refreshed…
    expect(customer?.name).toBe("Oficina do Zé"); // …display name preserved
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
      eventKey: "whatsapp:evolution:OUT1:read",
    });
    expect(state.processed.has("whatsapp:evolution:OUT1:read")).toBe(true);
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
    expect(state.processed.has("whatsapp:evolution:GHOST:delivered")).toBe(true);
  });

  it("each ack of the same message gets its own idempotency key (sent → read)", async () => {
    const state = emptyState();
    const first = await processWebhookEvent({
      provider: "evolution",
      rawPayload: statusEvent("SERVER_ACK", "OUT2"),
      db: makeFakeDb(state, { knownOutboundId: "OUT2" }),
      buildProvider: buildMock,
      traceId: "t",
    });
    const second = await processWebhookEvent({
      provider: "evolution",
      rawPayload: statusEvent("READ", "OUT2"),
      db: makeFakeDb(state, { knownOutboundId: "OUT2" }),
      buildProvider: buildMock,
      traceId: "t",
    });

    expect(first.outcome).toBe("status-applied");
    expect(second.outcome).toBe("status-applied"); // NOT swallowed by the sent ack
    expect(state.statusApplied.map((s) => s.status)).toEqual(["sent", "read"]);
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

  function documentEvent(fileName = "Catalogo-UFI.pdf") {
    const event = evolutionTextEvent("", "EVODOC1");
    event.data.message = {
      documentMessage: { fileName },
    } as never;
    return event;
  }

  it("threads the original document filename into the inbound insert (mediaFilename)", async () => {
    const state = emptyState();
    const result = await run(state, documentEvent());

    expect(result.outcome).toBe("message-created");
    expect(state.messages[0]).toMatchObject({ mediaFilename: "Catalogo-UFI.pdf" });
  });

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

describe("processWebhookEvent — evolution connection.update (status sync)", () => {
  function connectionEvent(state: string, event = "connection.update") {
    return { event, instance: "gallo-matriz", data: { state } };
  }

  it("close flips a connected account to disconnected (with audit)", async () => {
    const state = emptyState();
    const result = await run(state, connectionEvent("close"));

    expect(result.outcome).toBe("connection-synced");
    expect(state.accountStatus).toBe("disconnected");
    expect(state.audits[0]).toMatchObject({
      action: "whatsapp_instance_disconnected",
      after: expect.objectContaining({ reason: "connection_update", state: "close" }),
    });
  });

  it("open flips a disconnected account back to connected (any-status lookup)", async () => {
    const state = emptyState();
    state.accountStatus = "disconnected";
    const result = await run(state, connectionEvent("open"));

    expect(result.outcome).toBe("connection-synced");
    expect(state.accountStatus).toBe("connected");
    expect(state.audits[0]).toMatchObject({ action: "whatsapp_instance_connected" });
  });

  it("is idempotent: same state again does not re-audit", async () => {
    const state = emptyState();
    await run(state, connectionEvent("open"));

    expect(state.accountStatus).toBe("connected");
    expect(state.audits).toHaveLength(0);
  });

  it("ignores the transient connecting state", async () => {
    const state = emptyState();
    const result = await run(state, connectionEvent("connecting"));

    expect(result.outcome).toBe("ignored");
    expect(state.accountStatus).toBe("connected");
  });

  it("accepts the uppercase CONNECTION_UPDATE event name and data.connection key", async () => {
    const state = emptyState();
    const result = await run(state, {
      event: "CONNECTION_UPDATE",
      instance: "gallo-matriz",
      data: { connection: "close" },
    });

    expect(result.outcome).toBe("connection-synced");
    expect(state.accountStatus).toBe("disconnected");
  });

  it("returns account-not-found for an unknown instance", async () => {
    const state = emptyState();
    const result = await run(state, {
      event: "connection.update",
      instance: "outra-instancia",
      data: { state: "close" },
    });

    expect(result.outcome).toBe("account-not-found");
    expect(state.accountStatus).toBe("connected");
  });
});

function evolutionEchoEvent(text = "te envio o boleto", keyId = "3EB0ECHO1") {
  return {
    event: "messages.upsert",
    instance: "gallo-matriz",
    sender: "5555911111111@s.whatsapp.net",
    data: {
      key: { id: keyId, remoteJid: "5555988887777@s.whatsapp.net", fromMe: true },
      message: { conversation: text },
      messageTimestamp: 1765400000,
    },
  };
}

describe("processWebhookEvent — outbound echoes (real inbox spec)", () => {
  it("ignores the echo of an app-sent message (dedup by provider_message_id)", async () => {
    const state = emptyState();
    const result = await processWebhookEvent({
      provider: "evolution",
      rawPayload: evolutionEchoEvent("oi", "APP-SENT-1"),
      db: makeFakeDb(state, { knownOutboundId: "APP-SENT-1" }),
      buildProvider: buildMock,
      traceId: "trace-test",
    });
    expect(result.outcome).toBe("duplicate");
    expect(state.messages).toHaveLength(0);
    expect(state.processed.has("whatsapp:evolution:APP-SENT-1")).toBe(true);
  });

  it("mirrors a phone-sent message: aguardando conversation, out message, no unread bump", async () => {
    const state = emptyState();
    const result = await run(state, evolutionEchoEvent());

    expect(result.outcome).toBe("echo-created");
    expect(state.customers).toHaveLength(1); // pending customer for the new number
    // Echo conversations also land QUEUED (pool) — the webhook cannot know
    // which seller sent from the phone, so it never pins the chat; someone
    // claims it in the app (spec 2026-07-02).
    expect(state.conversations[0]).toMatchObject({ status: "aguardando", assignedSellerId: null });
    expect(state.messages[0]).toMatchObject({
      provider: "evolution",
      text: "te envio o boleto",
      providerMessageId: "3EB0ECHO1",
    });
    expect(state.bumps).toHaveLength(0); // NEVER the unread-bumping path
    // Pinned ISO: the touch uses the MESSAGE timestamp, never now().
    expect(state.touches).toEqual([
      {
        conversationId: state.conversations[0]?.id,
        lastMessageAt: new Date(1765400000 * 1000).toISOString(),
      },
    ]);
    expect(state.audits[0]).toMatchObject({
      action: "webhook_received",
      after: expect.objectContaining({ direction: "out", toPhoneMasked: "***7777" }),
    });
  });

  it("reuses the existing open conversation for the destination customer", async () => {
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
    const result = await run(state, evolutionEchoEvent("segunda", "3EB0ECHO2"));
    expect(result).toMatchObject({ outcome: "echo-created", conversationId: "conv-old" });
    expect(state.conversations).toHaveLength(1);
    // Reuse never rewrites the pre-existing conversation status.
    expect(state.conversations[0]?.status).toBeUndefined();
  });

  it("is idempotent across redeliveries (processed_events)", async () => {
    const state = emptyState();
    await run(state, evolutionEchoEvent());
    const second = await run(state, evolutionEchoEvent());
    expect(second.outcome).toBe("duplicate");
    expect(state.messages).toHaveLength(1);
  });

  it("returns account-not-found (and does not mark processed) for an unknown instance", async () => {
    const state = emptyState();
    const payload = { ...evolutionEchoEvent(), instance: "desconhecida" };
    const result = await run(state, payload);

    expect(result.outcome).toBe("account-not-found");
    expect(state.messages).toHaveLength(0);
    expect(state.processed.size).toBe(0);
  });
});

describe("processWebhookEvent — status keys (echo/ack share the provider message id)", () => {
  function ackEvent(status: string, keyId: string) {
    return {
      event: "messages.update",
      instance: "gallo-matriz",
      data: { keyId, status, messageTimestamp: 1765400100 },
    };
  }

  it("echo then ack: the echo mark never swallows the delivery status", async () => {
    const state = emptyState();
    // 1st: fake WITHOUT knownOutboundId — the echo is phone-sent and mirrors.
    const echo = await processWebhookEvent({
      provider: "evolution",
      rawPayload: evolutionEchoEvent("x", "SEQ1"),
      db: makeFakeDb(state),
      buildProvider: buildMock,
      traceId: "trace-test",
    });
    expect(echo.outcome).toBe("echo-created");

    // 2nd: same state, fake WITH knownOutboundId — the ack finds the message.
    const ack = await processWebhookEvent({
      provider: "evolution",
      rawPayload: ackEvent("DELIVERY_ACK", "SEQ1"),
      db: makeFakeDb(state, { knownOutboundId: "SEQ1" }),
      buildProvider: buildMock,
      traceId: "trace-test",
    });
    expect(ack.outcome).toBe("status-applied"); // NOT duplicate
    expect(state.statusApplied).toHaveLength(1);
  });

  it("ack before the upsert: the status-unmatched mark never suppresses the echo mirror", async () => {
    const state = emptyState();
    const warn = vi.fn();
    const ack = await processWebhookEvent({
      provider: "evolution",
      rawPayload: ackEvent("SERVER_ACK", "SEQ2"),
      db: makeFakeDb(state),
      buildProvider: buildMock,
      traceId: "trace-test",
      warn,
    });
    expect(ack.outcome).toBe("status-unmatched");

    const echo = await run(state, evolutionEchoEvent("x", "SEQ2"));
    expect(echo.outcome).toBe("echo-created"); // bare key was never marked
    expect(state.messages).toHaveLength(1);
  });
});

describe("processWebhookEvent — evolution-go", () => {
  it("normalizes a whatsmeow inbound text message via the go parser", async () => {
    const state = emptyState();
    const payload = {
      event: "Message",
      instanceId: "inst-9",
      data: {
        Info: {
          Chat: "5555988887777@s.whatsapp.net",
          Sender: "5555988887777@s.whatsapp.net",
          IsFromMe: false,
          Type: "text",
          PushName: "Cliente",
          ID: "GOIN1",
          Timestamp: "2026-06-25T10:00:00Z",
        },
        Message: { conversation: "olá go" },
      },
    };
    const result = await run(state, payload, { provider: "evolution-go" });
    expect(result.outcome).toBe("message-created");
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toMatchObject({
      provider: "evolution-go",
      providerMessageId: "GOIN1",
      text: "olá go",
    });
  });

  it("LoggedOut flips a connected Go account to disconnected (with audit)", async () => {
    const state = emptyState();
    const payload = {
      event: "LoggedOut",
      instanceId: "inst-9",
      data: { Reason: 401, reason: "401: logged out from another device", OnConnect: false },
    };
    const result = await run(state, payload, { provider: "evolution-go" });

    expect(result.outcome).toBe("connection-synced");
    expect(state.accountStatus).toBe("disconnected");
    expect(state.audits[0]).toMatchObject({
      action: "whatsapp_instance_disconnected",
      after: expect.objectContaining({ event: "LoggedOut", reason: "evolution_go_webhook" }),
    });
    expect(state.messages).toHaveLength(0);
  });

  it("Connection close flips a connected Go account to disconnected", async () => {
    const state = emptyState();
    const payload = { event: "Connection", instanceId: "inst-9", data: { State: "close" } };
    const result = await run(state, payload, { provider: "evolution-go" });

    expect(result.outcome).toBe("connection-synced");
    expect(state.accountStatus).toBe("disconnected");
    expect(state.audits[0]).toMatchObject({ action: "whatsapp_instance_disconnected" });
  });

  it("Connection open flips a disconnected Go account back to connected", async () => {
    const state = emptyState();
    state.accountStatus = "disconnected";
    const payload = { event: "Connection", instanceId: "inst-9", data: { State: "open" } };
    const result = await run(state, payload, { provider: "evolution-go" });

    expect(result.outcome).toBe("connection-synced");
    expect(state.accountStatus).toBe("connected");
    expect(state.audits[0]).toMatchObject({ action: "whatsapp_instance_connected" });
  });

  it("Connection connecting is transient — ignored, status untouched", async () => {
    const state = emptyState();
    const payload = { event: "Connection", instanceId: "inst-9", data: { State: "connecting" } };
    const result = await run(state, payload, { provider: "evolution-go" });

    expect(result.outcome).toBe("ignored");
    expect(state.accountStatus).toBe("connected");
  });

  it("LoggedOut for an unknown instance returns account-not-found", async () => {
    const state = emptyState();
    const payload = { event: "LoggedOut", instanceId: "unknown-instance", data: { Reason: 401 } };
    const result = await run(state, payload, { provider: "evolution-go" });

    expect(result.outcome).toBe("account-not-found");
    expect(state.audits).toHaveLength(0);
  });

  it("captures a whatsmeow HistorySync event raw (Phase 2 spike) without inserting a message", async () => {
    const state = emptyState();
    const captureRawEvent = vi.fn();
    const payload = {
      event: "HistorySync",
      instanceId: "inst-9",
      data: { Data: { conversations: [{ ID: "5555988887777@s.whatsapp.net" }] } },
    };
    const result = await run(state, payload, { provider: "evolution-go", captureRawEvent });

    expect(result.outcome).toBe("ignored");
    expect(result.detail).toBe("captured: HistorySync");
    expect(captureRawEvent).toHaveBeenCalledTimes(1);
    expect(captureRawEvent).toHaveBeenCalledWith({
      kind: "HistorySync",
      instanceId: "inst-9",
      payload,
    });
    expect(state.messages).toHaveLength(0);
  });

  it("does NOT capture a normal Message event — it still flows to the parser", async () => {
    const state = emptyState();
    const captureRawEvent = vi.fn();
    const payload = {
      event: "Message",
      instanceId: "inst-9",
      data: {
        Info: {
          Chat: "5555988887777@s.whatsapp.net",
          Sender: "5555988887777@s.whatsapp.net",
          IsFromMe: false,
          ID: "GOIN2",
          Timestamp: "2026-06-25T10:00:00Z",
        },
        Message: { conversation: "oi" },
      },
    };
    const result = await run(state, payload, { provider: "evolution-go", captureRawEvent });

    expect(result.outcome).toBe("message-created");
    expect(captureRawEvent).not.toHaveBeenCalled();
  });

  it("does NOT capture a SendMessage event (phone-sent echo) — it flows to the parser as an echo", async () => {
    const state = emptyState();
    const captureRawEvent = vi.fn();
    const payload = {
      event: "SendMessage",
      instanceId: "inst-9",
      data: {
        Info: {
          Chat: "5555988887777@s.whatsapp.net",
          Sender: "5555911111111@s.whatsapp.net",
          IsFromMe: true,
          ID: "GOOUT1",
          Timestamp: "2026-06-25T10:00:00Z",
        },
        Message: { conversation: "mandei do celular" },
      },
    };
    const result = await run(state, payload, { provider: "evolution-go", captureRawEvent });

    expect(result.outcome).toBe("echo-created");
    expect(captureRawEvent).not.toHaveBeenCalled();
    expect(state.messages[0]).toMatchObject({
      provider: "evolution-go",
      text: "mandei do celular",
      providerMessageId: "GOOUT1",
    });
  });

  it("capture is best-effort: a captureRawEvent failure still answers ignored", async () => {
    const state = emptyState();
    const warn = vi.fn();
    const captureRawEvent = vi.fn().mockRejectedValue(new Error("db down"));
    const payload = { event: "HistorySync", instanceId: "inst-9", data: {} };
    const result = await run(state, payload, {
      provider: "evolution-go",
      captureRawEvent,
      warn,
    });

    expect(result.outcome).toBe("ignored");
    expect(warn).toHaveBeenCalledWith(
      "failed to capture raw evolution-go event",
      expect.anything(),
    );
  });
});
