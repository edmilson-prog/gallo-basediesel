import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { IWhatsAppProvider } from "./IWhatsAppProvider";
import {
  getWhatsAppProvider,
  invalidateWhatsAppProviderCache,
  WhatsAppAccountNotFoundError,
} from "./factory";
import { MockWhatsAppProvider } from "./mock/MockWhatsAppProvider";

// A developer's .env.local may point VITE_DATA_SOURCE at supabase, so the
// suite pins the engine via the explicit RF-015 gate — the factory must then
// resolve the mock engine for any accountId without touching the network.

describe("getWhatsAppProvider (mock engine)", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_WHATSAPP_PROVIDER", "mock");
    invalidateWhatsAppProviderCache();
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("returns the mock engine for any accountId under the mock data source", async () => {
    const provider = await getWhatsAppProvider("any-account-id");
    expect(provider).toBeInstanceOf(MockWhatsAppProvider);
    expect(provider.providerName).toBe("mock");
  });

  it("caches the instance per accountId (RF-012)", async () => {
    const first = await getWhatsAppProvider("account-a");
    const second = await getWhatsAppProvider("account-a");
    expect(second).toBe(first);
  });

  it("keeps separate instances per accountId (no global singleton)", async () => {
    const a = await getWhatsAppProvider("account-a");
    const b = await getWhatsAppProvider("account-b");
    expect(b).not.toBe(a);
  });

  it("invalidateWhatsAppProviderCache(accountId) drops only that entry (RF-013)", async () => {
    const a = await getWhatsAppProvider("account-a");
    const b = await getWhatsAppProvider("account-b");
    invalidateWhatsAppProviderCache("account-a");
    expect(await getWhatsAppProvider("account-a")).not.toBe(a);
    expect(await getWhatsAppProvider("account-b")).toBe(b);
  });

  it("invalidateWhatsAppProviderCache() clears everything", async () => {
    const a = await getWhatsAppProvider("account-a");
    invalidateWhatsAppProviderCache();
    expect(await getWhatsAppProvider("account-a")).not.toBe(a);
  });

  it("exposes a named error type for missing accounts (RF-014)", () => {
    const err = new WhatsAppAccountNotFoundError("x");
    expect(err.name).toBe("WhatsAppAccountNotFoundError");
    expect(err.message).toContain("Conta WhatsApp não encontrada ou inativa");
  });
});

describe("MockWhatsAppProvider contract (RF-020..024)", () => {
  const provider: IWhatsAppProvider = new MockWhatsAppProvider();

  it("declares every capability as available (RF-024)", () => {
    expect(provider.capabilities).toMatchObject({
      supportsTemplates: true,
      supportsInteractive: true,
      supportsMediaUpload: true,
      supportsStatusReadReceipts: true,
      supportsCustomWebhook: true,
    });
    expect(provider.capabilities.maxMessageLength).toBeGreaterThan(0);
    expect(provider.capabilities.maxMediaSizeBytes).toBeGreaterThan(0);
  });

  it("sendText returns a mock-prefixed id with status sent (RF-021)", async () => {
    const result = await provider.sendText({
      accountId: "account-a",
      to: "+5555912345678",
      text: "olá",
    });
    expect(result.providerMessageId).toMatch(/^mock-/);
    expect(result.status).toBe("sent");
  });

  it("sendMedia / sendTemplate / sendInteractive honour the same contract", async () => {
    const media = await provider.sendMedia({
      accountId: "a",
      to: "+55",
      mediaType: "image",
      mediaIdOrUrl: "mock-media-1",
    });
    const template = await provider.sendTemplate({
      accountId: "a",
      to: "+55",
      templateName: "boas_vindas",
      languageCode: "pt_BR",
    });
    const interactive = await provider.sendInteractive({
      accountId: "a",
      to: "+55",
      bodyText: "Escolha:",
      kind: "buttons",
      options: [{ id: "1", title: "Sim" }],
    });
    for (const result of [media, template, interactive]) {
      expect(result.providerMessageId).toMatch(/^mock-/);
      expect(result.status).toBe("sent");
    }
  });

  it("parseInboundMessage normalizes a mock message payload (RF-022)", () => {
    const parsed = provider.parseInboundMessage({
      kind: "message",
      fromPhone: "+5555988887777",
      text: "preciso de um filtro",
    });
    expect(parsed.type).toBe("message");
    if (parsed.type === "message") {
      expect(parsed.fromPhone).toBe("+5555988887777");
      expect(parsed.text).toBe("preciso de um filtro");
      expect(parsed.contentType).toBe("text");
      expect(parsed.rawPayload).toBeDefined();
    }
  });

  it("parseInboundMessage normalizes a status payload", () => {
    const parsed = provider.parseInboundMessage({
      kind: "status",
      providerMessageId: "mock-123",
      status: "read",
    });
    expect(parsed.type).toBe("status");
    if (parsed.type === "status") {
      expect(parsed.providerMessageId).toBe("mock-123");
      expect(parsed.status).toBe("read");
    }
  });

  it("parseInboundMessage throws on unparseable payloads", () => {
    expect(() => provider.parseInboundMessage({ foo: "bar" })).toThrow(/unparseable/);
  });

  it("media round-trip returns bytes and a media id", async () => {
    const upload = await provider.uploadOutboundMedia(new Uint8Array([1, 2, 3]), "image/png");
    expect(upload.mediaId).toMatch(/^mock-media-/);
    const download = await provider.downloadInboundMedia("media-1");
    expect(download.sizeBytes).toBe(download.data.byteLength);
    expect(download.mimeType.length).toBeGreaterThan(0);
  });

  it("healthCheck is always healthy (RF-023)", async () => {
    const health = await provider.healthCheck();
    expect(health.healthy).toBe(true);
    expect(new Date(health.checkedAt).getTime()).not.toBeNaN();
  });

  it("verifyWebhookSignature accepts non-empty and rejects empty signatures", () => {
    expect(provider.verifyWebhookSignature("body", "sig")).toBe(true);
    expect(provider.verifyWebhookSignature("body", "")).toBe(false);
  });
});
