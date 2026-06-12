import { describe, expect, it, vi } from "vitest";
import { MockWhatsAppProvider } from "../mock/MockWhatsAppProvider";
import { WhatsAppProviderError } from "../errors";
import type { IAccountRecord } from "../webhook/core";
import type { IFailoverAwareAccount } from "../failover";
import { processSendRequest, type ISendDb, type ISendRequest, type ISender } from "./core";

const ACCOUNT: IFailoverAwareAccount = {
  id: "acc-1",
  storeId: "store-1",
  provider: "meta",
  phoneNumber: "+5555911111111",
  credentialsRef: "WHATSAPP_META_TEST",
  providerConfig: { phoneNumberId: "123", businessAccountId: "456" },
  currentState: "healthy",
  stateChangedAt: null,
  failoverPolicy: "disabled",
  failoverAccountId: null,
  isFailoverActive: false,
};

const BACKUP_EVOLUTION: IAccountRecord = {
  id: "acc-bkp",
  storeId: "store-1",
  provider: "evolution",
  phoneNumber: "+5555922222222",
  credentialsRef: "WHATSAPP_EVO_TEST",
  providerConfig: { baseUrl: "https://evo.test", instanceName: "gallo" },
};

const SELLER: ISender = { sellerId: "seller-1", role: "seller_internal", storeId: "store-1" };
const MANAGER: ISender = { sellerId: "seller-9", role: "manager", storeId: "store-1" };

interface IFakeOpts {
  assignedSellerId?: string | null;
  status?: string;
  within24h?: boolean;
  provider?: "meta" | "evolution";
  customerPhone?: string | null;
  customerWhatsappStatus?: string | null;
  /** PRD-120: failover overrides applied to the primary account. */
  failover?: Partial<IFailoverAwareAccount>;
  /** PRD-120: row returned by getAccountRecord (default: Evolution backup). */
  failoverRow?: IAccountRecord | null;
}

function makeDb(opts: IFakeOpts = {}) {
  const calls = {
    queued: [] as Array<Record<string, unknown>>,
    sent: [] as string[],
    failed: [] as Array<{ id: string; reason: string; code?: string }>,
    touched: [] as string[],
    audits: [] as Array<Record<string, unknown>>,
    signed: [] as string[],
    invalidCustomers: [] as string[],
  };
  const db: ISendDb = {
    getSendContext: async () => ({
      conversation: {
        id: "conv-1",
        storeId: "store-1",
        status: opts.status ?? "em_andamento",
        assignedSellerId: opts.assignedSellerId === undefined ? "seller-1" : opts.assignedSellerId,
      },
      account: { ...ACCOUNT, provider: opts.provider ?? "meta", ...(opts.failover ?? {}) },
      customerId: "cust-1",
      customerPhone: opts.customerPhone === undefined ? "+55 (55) 99888-7777" : opts.customerPhone,
      customerWhatsappStatus: opts.customerWhatsappStatus ?? "unknown",
    }),
    getAccountRecord: async () =>
      opts.failoverRow === undefined ? BACKUP_EVOLUTION : opts.failoverRow,
    isWithin24hWindow: async () => opts.within24h ?? true,
    insertQueuedMessage: async (input) => {
      calls.queued.push(input);
      return { id: "msg-1" };
    },
    markMessageSent: async (id, pmid) => {
      calls.sent.push(`${id}:${pmid}`);
    },
    markMessageFailed: async (id, reason, code) => {
      calls.failed.push({ id, reason, code });
    },
    markCustomerWhatsappInvalid: async (customerId) => {
      calls.invalidCustomers.push(customerId);
    },
    touchConversation: async (id) => {
      calls.touched.push(id);
    },
    createSignedMediaUrl: async (path) => {
      calls.signed.push(path);
      return `https://signed.test/${path}`;
    },
    audit: async (input) => {
      calls.audits.push(input);
    },
  };
  return { db, calls };
}

function send(
  input: Partial<ISendRequest>,
  db: ISendDb,
  sender: ISender = SELLER,
  engine = new MockWhatsAppProvider(),
) {
  return processSendRequest({
    input: { conversationId: "conv-1", kind: "text", text: "olá", ...input },
    sender,
    db,
    buildProvider: () => engine,
    traceId: "trace-send",
  });
}

describe("processSendRequest — happy path (RF-030/040/050)", () => {
  it("persists queued, dispatches, marks sent, touches conversation and audits", async () => {
    const { db, calls } = makeDb();
    const result = await send({}, db);

    expect(result.dispatchStatus).toBe("sent");
    expect(result.messageId).toBe("msg-1");
    expect(calls.queued[0]).toMatchObject({ provider: "meta", text: "olá", sellerId: "seller-1" });
    expect(calls.sent[0]).toMatch(/^msg-1:mock-/);
    expect(calls.touched).toEqual(["conv-1"]);
    expect(calls.audits[0]).toMatchObject({
      action: "dispatch",
      after: expect.objectContaining({ success: true, kind: "text" }),
    });
  });

  it("forwards a client-generated messageId to the queued insert (optimistic dedup)", async () => {
    const { db, calls } = makeDb();
    const clientId = "11111111-1111-4111-8111-111111111111";
    await send({ messageId: clientId }, db);
    // The Inbox sends a UUID so the optimistic bubble and the Realtime INSERT
    // share one id — no duplicate bubble during the send window.
    expect(calls.queued[0]).toMatchObject({ messageId: clientId });
  });

  it("media: signs storage paths and passes the URL to the engine (RF-042)", async () => {
    const { db, calls } = makeDb();
    const engine = new MockWhatsAppProvider();
    const spy = vi.spyOn(engine, "sendMedia");

    await send(
      { kind: "media", mediaPath: "conversations/c/out/img.jpg", mediaType: "image", text: "foto" },
      db,
      SELLER,
      engine,
    );

    expect(calls.signed).toEqual(["conversations/c/out/img.jpg"]);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaIdOrUrl: "https://signed.test/conversations/c/out/img.jpg",
        caption: "foto",
        to: "+5555998887777",
      }),
    );
  });

  it("media: forwards the original fileName to the engine for documents (PRD-119)", async () => {
    const { db } = makeDb();
    const engine = new MockWhatsAppProvider();
    const spy = vi.spyOn(engine, "sendMedia");

    await send(
      {
        kind: "media",
        mediaPath: "https://signed.test/quote.pdf",
        mediaType: "document",
        text: "",
        fileName: "orçamento.pdf",
      },
      db,
      SELLER,
      engine,
    );

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "orçamento.pdf", mediaType: "document" }),
    );
  });
});

describe("processSendRequest — permission and state gates (RF-010..012)", () => {
  it("blocks a seller sending in another seller's conversation", async () => {
    const { db, calls } = makeDb({ assignedSellerId: "seller-other" });
    await expect(send({}, db)).rejects.toMatchObject({ code: "FORBIDDEN", httpStatus: 403 });
    expect(calls.queued).toHaveLength(0);
  });

  it("allows staff in any conversation and sellers in pool conversations", async () => {
    const staff = makeDb({ assignedSellerId: "seller-other" });
    await expect(send({}, staff.db, MANAGER)).resolves.toMatchObject({ dispatchStatus: "sent" });

    const pool = makeDb({ assignedSellerId: null });
    await expect(send({}, pool.db)).resolves.toMatchObject({ dispatchStatus: "sent" });
  });

  it("rejects closed conversations (RF-012)", async () => {
    const { db } = makeDb({ status: "arquivada" });
    await expect(send({}, db)).rejects.toMatchObject({ code: "CONVERSATION_CLOSED" });
  });
});

describe("processSendRequest — 24h window (RF-020..023)", () => {
  it("meta + text outside the window → TEMPLATE_REQUIRED before persisting", async () => {
    const { db, calls } = makeDb({ within24h: false });
    await expect(send({}, db)).rejects.toMatchObject({
      code: "TEMPLATE_REQUIRED",
      message: "Fora da janela de 24h. Use um template HSM.",
    });
    expect(calls.queued).toHaveLength(0);
  });

  it("templates skip the window; evolution skips it entirely", async () => {
    const meta = makeDb({ within24h: false });
    await expect(
      send({ kind: "template", templateName: "boas_vindas", templateLanguage: "pt_BR" }, meta.db),
    ).resolves.toMatchObject({ dispatchStatus: "sent" });

    const evo = makeDb({ within24h: false, provider: "evolution" });
    await expect(send({}, evo.db)).resolves.toMatchObject({ dispatchStatus: "sent" });
  });
});

describe("processSendRequest — provider failure (RF-044/051)", () => {
  it("marks failed with reason, audits the failure and rethrows", async () => {
    const { db, calls } = makeDb();
    const engine = new MockWhatsAppProvider();
    engine.sendText = async () => {
      throw new WhatsAppProviderError("VALIDATION_ERROR", 422, "Número não é WhatsApp");
    };

    await expect(send({}, db, SELLER, engine)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(calls.failed[0]).toMatchObject({ id: "msg-1", reason: "Número não é WhatsApp" });
    expect(calls.audits[0]).toMatchObject({
      after: expect.objectContaining({ success: false, errorCode: "VALIDATION_ERROR" }),
    });
    expect(calls.touched).toHaveLength(0);
  });
});

describe("processSendRequest — invalid whatsapp number gate (PRD-118 RF-051)", () => {
  it("bounces with CUSTOMER_INVALID_WHATSAPP before persisting", async () => {
    const { db, calls } = makeDb({ customerWhatsappStatus: "invalid" });
    await expect(send({}, db)).rejects.toMatchObject({
      code: "CUSTOMER_INVALID_WHATSAPP",
      httpStatus: 422,
    });
    expect(calls.queued).toHaveLength(0);
  });

  it("seller cannot override; staff override sends and audits dispatch_override_invalid", async () => {
    const seller = makeDb({ customerWhatsappStatus: "invalid" });
    await expect(send({ overrideInvalid: true }, seller.db)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const staff = makeDb({ customerWhatsappStatus: "invalid" });
    await expect(send({ overrideInvalid: true }, staff.db, MANAGER)).resolves.toMatchObject({
      dispatchStatus: "sent",
    });
    expect(staff.calls.audits[0]).toMatchObject({
      action: "dispatch_override_invalid",
      resourceId: "cust-1",
    });
  });

  it("retry audits dispatch_retry with the original message id (RF-040)", async () => {
    const { db, calls } = makeDb();
    await expect(send({ retryOfMessageId: "msg-old" }, db)).resolves.toMatchObject({
      dispatchStatus: "sent",
    });
    expect(calls.audits[0]).toMatchObject({
      action: "dispatch_retry",
      after: expect.objectContaining({ originalMessageId: "msg-old" }),
    });
  });

  it("sync Meta 131026 persists failure_code and flags the customer (RF-050 sync)", async () => {
    const { db, calls } = makeDb();
    const engine = new MockWhatsAppProvider();
    engine.sendText = async () => {
      throw new WhatsAppProviderError("VALIDATION_ERROR", 422, "Número não é WhatsApp", {
        metaCode: 131026,
      });
    };
    await expect(send({}, db, SELLER, engine)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(calls.failed[0]).toMatchObject({ id: "msg-1", code: "131026" });
    expect(calls.invalidCustomers).toEqual(["cust-1"]);
  });
});

describe("processSendRequest — input validation (RF-003)", () => {
  it("rejects empty text, oversized text and incomplete media/template inputs", async () => {
    const { db } = makeDb();
    await expect(send({ text: "  " }, db)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(send({ text: "x".repeat(5000) }, db)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(send({ kind: "media", mediaType: "image" }, db)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(send({ kind: "template" }, db)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects conversations without account or customer phone", async () => {
    const noPhone = makeDb({ customerPhone: null });
    await expect(send({}, noPhone.db)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("processSendRequest — failover (PRD-120 RF-040/041)", () => {
  const ACTIVE_FAILOVER: Partial<IFailoverAwareAccount> = {
    currentState: "down",
    failoverPolicy: "automatic",
    failoverAccountId: "acc-bkp",
    isFailoverActive: true,
  };

  it("routes text through the backup account and audits failover_used", async () => {
    const { db, calls } = makeDb({ failover: ACTIVE_FAILOVER });
    const engine = new MockWhatsAppProvider();
    const spy = vi.spyOn(engine, "sendText");

    await send({}, db, SELLER, engine);

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ accountId: "acc-bkp" }));
    expect(calls.queued[0]).toMatchObject({ provider: "evolution" });
    expect(calls.audits[0]).toMatchObject({
      action: "failover_used",
      resource: "whatsapp_account",
      resourceId: "acc-1",
      after: expect.objectContaining({ toAccountId: "acc-bkp" }),
    });
    expect(calls.audits[1]).toMatchObject({
      action: "dispatch",
      after: expect.objectContaining({ usedFailover: true, provider: "evolution" }),
    });
  });

  it("skips the Meta 24h pre-check when the EFFECTIVE account is Evolution", async () => {
    const { db } = makeDb({ failover: ACTIVE_FAILOVER, within24h: false });
    await expect(send({}, db)).resolves.toMatchObject({ dispatchStatus: "sent" });
  });

  it("template over an Evolution backup bounces FAILOVER_INCOMPATIBLE without persisting", async () => {
    const { db, calls } = makeDb({ failover: ACTIVE_FAILOVER });
    await expect(
      send({ kind: "template", templateName: "boas_vindas", templateLanguage: "pt_BR" }, db),
    ).rejects.toMatchObject({ code: "FAILOVER_INCOMPATIBLE", httpStatus: 422 });
    expect(calls.queued).toHaveLength(0);
  });

  it("inactive failover keeps the primary account (no failover audit)", async () => {
    const { db, calls } = makeDb({
      failover: { failoverPolicy: "manual", failoverAccountId: "acc-bkp", isFailoverActive: false },
    });
    await send({}, db);
    expect(calls.queued[0]).toMatchObject({ provider: "meta" });
    expect(calls.audits.some((a) => a.action === "failover_used")).toBe(false);
  });

  it("missing backup row fails open to the primary", async () => {
    const { db, calls } = makeDb({ failover: ACTIVE_FAILOVER, failoverRow: null });
    await send({}, db);
    expect(calls.queued[0]).toMatchObject({ provider: "meta" });
    expect(calls.audits.some((a) => a.action === "failover_used")).toBe(false);
  });
});

