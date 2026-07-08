import { describe, expect, it, vi } from "vitest";
import type { IIntegrationLogEntry, IOpenWaAccountConfig } from "../types";
import { OpenWaProvider } from "./OpenWaProvider";

const CONFIG: IOpenWaAccountConfig = {
  accountId: "acc-openwa-1",
  baseUrl: "https://openwa.test.local",
  sessionId: "sess-loja2",
  apiKeySecretName: "WA_OPENWA_SERVER_LOJA2_AB",
};

const SECRETS: Record<string, string> = {
  WA_OPENWA_SERVER_LOJA2_AB: "openwa-server-key",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeProvider(fetchImpl: typeof fetch, secrets: Record<string, string> = SECRETS) {
  const logs: IIntegrationLogEntry[] = [];
  const provider = new OpenWaProvider(CONFIG, {
    resolveSecret: async (name) => secrets[name],
    logIntegration: (entry) => {
      logs.push(entry);
    },
    fetchFn: fetchImpl,
  });
  return { provider, logs };
}

// ===== Sending ==============================================================

describe("OpenWaProvider sending", () => {
  it("sendText posts an x-api-key-authenticated chatId payload and returns the message id", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://openwa.test.local/api/sessions/sess-loja2/messages/send-text");
      expect(init?.headers).toMatchObject({ "x-api-key": "openwa-server-key" });
      expect(JSON.parse(String(init?.body))).toMatchObject({
        chatId: "5555912345678@c.us",
        text: "Olá",
      });
      return jsonResponse({ waMessageId: "true_5555912345678@c.us_ABC123" });
    }) as unknown as typeof fetch;
    const { provider, logs } = makeProvider(fetchFn);

    const result = await provider.sendText({
      accountId: CONFIG.accountId,
      to: "+5555912345678",
      text: "Olá",
      traceId: "trace-openwa",
    });

    expect(result).toEqual({ providerMessageId: "true_5555912345678@c.us_ABC123", status: "sent" });
    expect(logs[0]).toMatchObject({
      integrationName: "whatsapp_openwa",
      endpoint: "/api/sessions/sess-loja2/messages/send-text",
      httpStatus: 200,
      traceId: "trace-openwa",
    });
    expect(JSON.stringify(logs[0])).not.toContain("openwa-server-key");
  });

  it("rejects an empty text body without calling fetch", async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn);

    await expect(
      provider.sendText({ accountId: "a", to: "+5555912345678", text: "" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("sendMedia requires a URL (no separate upload step)", async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn);

    await expect(
      provider.sendMedia({
        accountId: "a",
        to: "+5555912345678",
        mediaType: "image",
        mediaIdOrUrl: "not-a-url",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("sendMedia posts to send-document with caption/filename for a document", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe(
        "https://openwa.test.local/api/sessions/sess-loja2/messages/send-document",
      );
      expect(JSON.parse(String(init?.body))).toMatchObject({
        chatId: "5555912345678@c.us",
        url: "https://storage.test/quote.pdf",
        caption: "segue",
        filename: "orçamento.pdf",
      });
      return jsonResponse({ waMessageId: "DOC1" });
    }) as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn);

    const result = await provider.sendMedia({
      accountId: "a",
      to: "+5555912345678",
      mediaType: "document",
      mediaIdOrUrl: "https://storage.test/quote.pdf",
      caption: "segue",
      filename: "orçamento.pdf",
    });
    expect(result.providerMessageId).toBe("DOC1");
  });

  it("sendMedia routes audio to send-audio", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toBe(
        "https://openwa.test.local/api/sessions/sess-loja2/messages/send-audio",
      );
      return jsonResponse({ waMessageId: "AUDIO1" });
    }) as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn);

    const result = await provider.sendMedia({
      accountId: "a",
      to: "+5555912345678",
      mediaType: "audio",
      mediaIdOrUrl: "https://storage.test/voice.ogg",
    });
    expect(result.providerMessageId).toBe("AUDIO1");
  });

  it("sendMedia routes image to send-image", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toBe(
        "https://openwa.test.local/api/sessions/sess-loja2/messages/send-image",
      );
      return jsonResponse({ waMessageId: "IMG1" });
    }) as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn);

    const result = await provider.sendMedia({
      accountId: "a",
      to: "+5555912345678",
      mediaType: "image",
      mediaIdOrUrl: "https://storage.test/photo.jpg",
    });
    expect(result.providerMessageId).toBe("IMG1");
  });

  it("sendTemplate and sendInteractive throw NOT_SUPPORTED without calling fetch", async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn);

    await expect(
      provider.sendTemplate({ accountId: "a", to: "+55", templateName: "x", languageCode: "pt_BR" }),
    ).rejects.toMatchObject({ code: "NOT_SUPPORTED" });
    await expect(
      provider.sendInteractive({
        accountId: "a",
        to: "+55",
        bodyText: "x",
        kind: "buttons",
        options: [{ id: "1", title: "Sim" }],
      }),
    ).rejects.toMatchObject({ code: "NOT_SUPPORTED" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("accepts the legacy whatsapp-web.js native id shape as a fallback", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ id: { _serialized: "NATIVE1" } }),
    ) as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn);

    const result = await provider.sendText({ accountId: "a", to: "+5555912345678", text: "oi" });
    expect(result.providerMessageId).toBe("NATIVE1");
  });

  it("throws INTEGRATION_ERROR when the response carries no message id", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({})) as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn);

    await expect(
      provider.sendText({ accountId: "a", to: "+5555912345678", text: "oi" }),
    ).rejects.toMatchObject({ code: "INTEGRATION_ERROR" });
  });

  it("maps a disconnected session to PROVIDER_DISCONNECTED 503", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(
        { message: "Session is not connected. The WhatsApp client is not ready.", statusCode: 409 },
        409,
      ),
    ) as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn);

    await expect(
      provider.sendText({ accountId: "a", to: "+5555912345678", text: "oi" }),
    ).rejects.toMatchObject({ code: "PROVIDER_DISCONNECTED", httpStatus: 503 });
  });
});

// ===== Capabilities =========================================================

describe("OpenWaProvider capabilities", () => {
  const { provider } = makeProvider(vi.fn() as unknown as typeof fetch);

  it("declares no templates/interactive/upload, custom webhook and read receipts yes", () => {
    expect(provider.capabilities).toMatchObject({
      supportsTemplates: false,
      supportsInteractive: false,
      supportsMediaUpload: false,
      supportsStatusReadReceipts: true,
      supportsCustomWebhook: true,
    });
  });

  it("uploadOutboundMedia throws NOT_SUPPORTED pointing to URL sends", async () => {
    await expect(
      provider.uploadOutboundMedia(new Uint8Array([1]), "image/png"),
    ).rejects.toMatchObject({ code: "NOT_SUPPORTED" });
  });
});

// ===== Webhook signature =====================================================

describe("OpenWaProvider verifyWebhookSignature", () => {
  it("always returns true (no documented HMAC secret feature)", async () => {
    const { provider } = makeProvider(vi.fn() as unknown as typeof fetch);
    expect(await provider.verifyWebhookSignature("{}", "anything")).toBe(true);
    expect(await provider.verifyWebhookSignature("{}", "")).toBe(true);
  });
});

// ===== Media download (no HTTP — bytes are packed inline by the parser) ====

describe("OpenWaProvider downloadInboundMedia", () => {
  it("decodes packed base64 with NO fetch call (no download-by-id endpoint exists)", async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn);
    const mediaId = JSON.stringify({ data: btoa("abc"), mimeType: "image/jpeg", filename: "p.jpg" });

    const result = await provider.downloadInboundMedia(mediaId);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.filename).toBe("p.jpg");
    expect(result.sizeBytes).toBe(3);
    expect(new TextDecoder().decode(result.data)).toBe("abc");
  });

  it("throws NOT_FOUND when mediaId is not a packed JSON envelope", async () => {
    const { provider } = makeProvider(vi.fn() as unknown as typeof fetch);

    await expect(provider.downloadInboundMedia("not-json")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

// ===== Health ================================================================

describe("OpenWaProvider healthCheck", () => {
  it.each([
    [{ status: "connected" }, true],
    [{ status: "qr_ready" }, false],
    [{ status: "disconnected" }, false],
  ])("payload %j → healthy %s", async (body, healthy) => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toBe("https://openwa.test.local/api/sessions/sess-loja2");
      return jsonResponse(body);
    }) as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn);

    const result = await provider.healthCheck();
    expect(result.healthy).toBe(healthy);
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
