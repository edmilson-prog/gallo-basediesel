import { describe, expect, it, vi } from "vitest";
import { MockWhatsAppProvider } from "../mock/MockWhatsAppProvider";
import { WhatsAppProviderError } from "../errors";
import type { IAccountRecord } from "../webhook/core";
import { processSendRequest, type ISendDb, type ISendRequest, type ISender } from "./core";

const ACCOUNT: IAccountRecord = {
  id: "acc-1",
  storeId: "store-1",
  provider: "meta",
  phoneNumber: "+5555911111111",
  credentialsRef: "WHATSAPP_META_TEST",
  providerConfig: { phoneNumberId: "123", businessAccountId: "456" },
};

const SELLER: ISender = { sellerId: "seller-1", role: "seller_internal", storeId: "store-1" };
const MANAGER: ISender = { sellerId: "seller-9", role: "manager", storeId: "store-1" };

interface IFakeOpts {
  assignedSellerId?: string | null;
  status?: string;
  within24h?: boolean;
  provider?: "meta" | "evolution";
  customerPhone?: string | null;
}

function makeDb(opts: IFakeOpts = {}) {
  const calls = {
    queued: [] as Array<Record<string, unknown>>,
    sent: [] as string[],
    failed: [] as Array<{ id: string; reason: string }>,
    touched: [] as string[],
    audits: [] as Array<Record<string, unknown>>,
    signed: [] as string[],
  };
  const db: ISendDb = {
    getSendContext: async () => ({
      conversation: {
        id: "conv-1",
        storeId: "store-1",
        status: opts.status ?? "em_andamento",
        assignedSellerId: opts.assignedSellerId === undefined ? "seller-1" : opts.assignedSellerId,
      },
      account: { ...ACCOUNT, provider: opts.provider ?? "meta" },
      customerPhone: opts.customerPhone === undefined ? "+55 (55) 99888-7777" : opts.customerPhone,
    }),
    isWithin24hWindow: async () => opts.within24h ?? true,
    insertQueuedMessage: async (input) => {
      calls.queued.push(input);
      return { id: "msg-1" };
    },
    markMessageSent: async (id, pmid) => {
      calls.sent.push(`${id}:${pmid}`);
    },
    markMessageFailed: async (id, reason) => {
      calls.failed.push({ id, reason });
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
