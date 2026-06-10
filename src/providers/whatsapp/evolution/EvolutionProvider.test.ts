import { describe, expect, it, vi } from "vitest";
import { hmacSha256Hex } from "../crypto";
import type { IIntegrationLogEntry } from "../types";
import { EvolutionProvider } from "./EvolutionProvider";
import { mapEvolutionError } from "./errors";
import { parseEvolutionInbound } from "./parser";

const CONFIG = {
  accountId: "acc-evo-1",
  baseUrl: "https://evo.test.local",
  instanceName: "gallo-matriz",
  credentialsRef: "WHATSAPP_EVO_TEST",
};

const SECRETS: Record<string, string> = {
  WHATSAPP_EVO_TEST_API_KEY: "evo-api-key",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeProvider(fetchImpl: typeof fetch, secrets: Record<string, string> = SECRETS) {
  const logs: IIntegrationLogEntry[] = [];
  const provider = new EvolutionProvider(CONFIG, {
    resolveSecret: async (name) => secrets[name],
    logIntegration: (entry) => {
      logs.push(entry);
    },
    fetchFn: fetchImpl,
  });
  return { provider, logs };
}

// ===== Sending ==============================================================

describe("EvolutionProvider sending (RF-020..041)", () => {
  it("sendText posts with apikey header and returns key.id", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://evo.test.local/message/sendText/gallo-matriz");
      expect(init?.headers).toMatchObject({ apikey: "evo-api-key" });
      expect(JSON.parse(String(init?.body))).toMatchObject({
        number: "5555912345678",
        text: "Olá",
      });
      return jsonResponse({ key: { id: "BAE5F1A2" } });
    }) as unknown as typeof fetch;
    const { provider, logs } = makeProvider(fetchFn);

    const result = await provider.sendText({
      accountId: CONFIG.accountId,
      to: "+5555912345678",
      text: "Olá",
      traceId: "trace-evo",
    });

    expect(result).toEqual({ providerMessageId: "BAE5F1A2", status: "sent" });
    expect(logs[0]).toMatchObject({
      integrationName: "whatsapp_evolution",
      endpoint: "/message/sendText/gallo-matriz",
      httpStatus: 200,
      traceId: "trace-evo",
    });
    expect(JSON.stringify(logs[0])).not.toContain("evo-api-key");
  });

  it("sendMedia requires a URL (no separate upload on Evolution)", async () => {
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        mediatype: "image",
        media: "https://storage.test/signed.jpg",
        caption: "foto",
      });
      return jsonResponse({ key: { id: "MEDIA1" } });
    }) as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn);

    await expect(
      provider.sendMedia({
        accountId: "a",
        to: "+5555912345678",
        mediaType: "image",
        mediaIdOrUrl: "media-id-123",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const result = await provider.sendMedia({
      accountId: "a",
      to: "+5555912345678",
      mediaType: "image",
      mediaIdOrUrl: "https://storage.test/signed.jpg",
      caption: "foto",
    });
    expect(result.providerMessageId).toBe("MEDIA1");
  });

  it("sendTemplate and sendInteractive throw NOT_SUPPORTED (RF-040/041)", async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn);

    await expect(
      provider.sendTemplate({
        accountId: "a",
        to: "+55",
        templateName: "x",
        languageCode: "pt_BR",
      }),
    ).rejects.toMatchObject({
      code: "NOT_SUPPORTED",
      httpStatus: 422,
      message: "Provider Evolution não suporta templates HSM",
    });
    await expect(
      provider.sendInteractive({
        accountId: "a",
        to: "+55",
        bodyText: "x",
        kind: "buttons",
        options: [{ id: "1", title: "Sim" }],
      }),
    ).rejects.toMatchObject({
      code: "NOT_SUPPORTED",
      message: "Provider Evolution não suporta mensagens interativas",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("maps a disconnected instance to PROVIDER_DISCONNECTED 503 (RF-080)", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ message: "Connection Closed: instance not connected" }, 400),
    ) as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn);

    await expect(
      provider.sendText({ accountId: "a", to: "+5555912345678", text: "oi" }),
    ).rejects.toMatchObject({
      code: "PROVIDER_DISCONNECTED",
      httpStatus: 503,
      message: "WhatsApp desconectado, reconectar via QR Code",
    });
  });
});

// ===== Capabilities =========================================================

describe("EvolutionProvider capabilities (RF-004 honestas)", () => {
  const { provider } = makeProvider(vi.fn() as unknown as typeof fetch);

  it("declares no templates/interactive/upload, custom webhook yes", () => {
    expect(provider.capabilities).toMatchObject({
      supportsTemplates: false,
      supportsInteractive: false,
      supportsMediaUpload: false,
      supportsStatusReadReceipts: true,
      supportsCustomWebhook: true,
    });
  });

  it("uploadOutboundMedia throws NOT_SUPPORTED pointing to URL sends (RF-070)", async () => {
    await expect(
      provider.uploadOutboundMedia(new Uint8Array([1]), "image/png"),
    ).rejects.toMatchObject({ code: "NOT_SUPPORTED" });
  });
});

// ===== Error mapping ========================================================

describe("mapEvolutionError (RF-080)", () => {
  it.each([
    [401, { message: "Unauthorized" }, "UNAUTHORIZED"],
    [404, { message: "The instance does not exist" }, "NOT_FOUND"],
    [400, { message: ["Session is not connected"] }, "PROVIDER_DISCONNECTED"],
    [500, { message: "boom" }, "INTEGRATION_ERROR"],
  ])("HTTP %i → %s", (status, body, expected) => {
    expect(mapEvolutionError(status, body, "/x").code).toBe(expected);
  });
});

// ===== Health ===============================================================

describe("EvolutionProvider healthCheck (RF-050/051)", () => {
  it.each([
    ["open", true],
    ["connecting", false],
    ["close", false],
  ])("state %s → healthy %s with state in detail", async (state, healthy) => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toBe("https://evo.test.local/instance/connectionState/gallo-matriz");
      return jsonResponse({ instance: { state } });
    }) as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn);

    const result = await provider.healthCheck();
    expect(result.healthy).toBe(healthy);
    expect(result.detail).toBe(`state: ${state}`);
  });

  it("never throws — VPS unreachable reports healthy=false", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn);

    const result = await provider.healthCheck();
    expect(result.healthy).toBe(false);
    expect(result.detail).toContain("ECONNREFUSED");
  });
});

// ===== Webhook signature ====================================================

describe("EvolutionProvider verifyWebhookSignature (RF-061)", () => {
  const body = '{"event":"messages.upsert"}';

  it("returns true when no webhook secret is configured (IP allowlist mode)", async () => {
    const { provider } = makeProvider(vi.fn() as unknown as typeof fetch);
    expect(await provider.verifyWebhookSignature(body, "anything")).toBe(true);
  });

  it("validates HMAC when the secret exists", async () => {
    const { provider } = makeProvider(vi.fn() as unknown as typeof fetch, {
      ...SECRETS,
      WHATSAPP_EVO_TEST_WEBHOOK_SECRET: "hook-secret",
    });
    const valid = await hmacSha256Hex("hook-secret", body);
    expect(await provider.verifyWebhookSignature(body, valid)).toBe(true);
    expect(await provider.verifyWebhookSignature(body, `sha256=${valid}`)).toBe(true);
    expect(await provider.verifyWebhookSignature(body, "deadbeef")).toBe(false);
  });
});

// ===== Parser ===============================================================

function upsertEvent(message: unknown, key?: Record<string, unknown>) {
  return {
    event: "messages.upsert",
    instance: "gallo-matriz",
    sender: "5555911111111@s.whatsapp.net",
    data: {
      key: { id: "EVOKEY1", remoteJid: "5555988887777@s.whatsapp.net", fromMe: false, ...key },
      pushName: "Cliente Teste",
      message,
      messageTimestamp: 1765400000,
    },
  };
}

describe("parseEvolutionInbound (RF-060)", () => {
  it("normalizes conversation text", () => {
    const parsed = parseEvolutionInbound(
      upsertEvent({ conversation: "preciso de um filtro" }),
      "acc-evo-1",
    );
    expect(parsed).toMatchObject({
      type: "message",
      providerMessageId: "EVOKEY1",
      fromPhone: "+5555988887777",
      toAccountPhone: "+5555911111111",
      accountId: "acc-evo-1",
      contentType: "text",
      text: "preciso de um filtro",
    });
  });

  it("normalizes image with caption — mediaId is the message key id", () => {
    const parsed = parseEvolutionInbound(
      upsertEvent({ imageMessage: { caption: "foto da peça", mimetype: "image/jpeg" } }),
      "acc",
    );
    expect(parsed).toMatchObject({
      type: "message",
      contentType: "image",
      mediaId: "EVOKEY1",
      mediaCaption: "foto da peça",
    });
  });

  it("normalizes messages.update acks to statuses", () => {
    const parsed = parseEvolutionInbound(
      {
        event: "messages.update",
        instance: "gallo-matriz",
        data: { keyId: "EVOKEY9", status: "READ", messageTimestamp: 1765400100 },
      },
      "acc",
    );
    expect(parsed).toMatchObject({
      type: "status",
      providerMessageId: "EVOKEY9",
      status: "read",
    });
  });

  it("throws on own-message echoes (fromMe=true) and unknown events", () => {
    expect(() =>
      parseEvolutionInbound(upsertEvent({ conversation: "eco" }, { fromMe: true }), "acc"),
    ).toThrow(/fromMe/);
    expect(() => parseEvolutionInbound({ event: "connection.update", data: {} }, "acc")).toThrow(
      /não suportado/,
    );
    expect(() => parseEvolutionInbound({ foo: "bar" }, "acc")).toThrow(/irreconhecível/);
  });
});

// ===== Media download =======================================================

describe("EvolutionProvider downloadInboundMedia (RF-071)", () => {
  it("fetches base64 by message key and decodes bytes", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe(
        "https://evo.test.local/chat/getBase64FromMediaMessage/gallo-matriz",
      );
      expect(JSON.parse(String(init?.body))).toMatchObject({
        message: { key: { id: "EVOKEY1" } },
      });
      return jsonResponse({ base64: btoa("abc"), mimetype: "image/jpeg", fileName: "p.jpg" });
    }) as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn);

    const result = await provider.downloadInboundMedia("EVOKEY1");
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.filename).toBe("p.jpg");
    expect(result.sizeBytes).toBe(3);
    expect(new TextDecoder().decode(result.data)).toBe("abc");
  });
});
