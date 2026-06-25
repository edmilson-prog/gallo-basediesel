import { describe, expect, it, vi } from "vitest";
import { EvolutionGoProvider } from "./EvolutionGoProvider";
import { encodeGoMediaRef } from "./media";
import type { IIntegrationLogEntry } from "../types";

const CONFIG = {
  accountId: "acc-go-1",
  baseUrl: "https://go.test",
  instanceId: "inst-uuid-9",
  credentialsRef: "WA_GO_TEST",
};
const SECRETS: Record<string, string> = {
  WA_GO_TEST_API_KEY: "global-key",
  WA_GO_TEST_INSTANCE_TOKEN: "inst-token",
};
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function makeProvider(fetchImpl: typeof fetch, secrets = SECRETS) {
  const logs: IIntegrationLogEntry[] = [];
  const provider = new EvolutionGoProvider(CONFIG, {
    resolveSecret: async (name) => secrets[name],
    logIntegration: (e) => { logs.push(e); },
    fetchFn: fetchImpl,
  });
  return { provider, logs };
}

describe("EvolutionGoProvider", () => {
  it("sendText posts to /send/text with apikey+instanceId and returns messageId", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://go.test/send/text");
      expect(init?.headers).toMatchObject({ apikey: "global-key", instanceId: "inst-uuid-9" });
      expect(JSON.parse(String(init?.body))).toMatchObject({ number: "5555912345678", text: "Olá" });
      return jsonResponse({ success: true, messageId: "GOOUT1", data: { Info: { ID: "GOOUT1" } } });
    }) as unknown as typeof fetch;
    const { provider, logs } = makeProvider(fetchFn);

    const result = await provider.sendText({ accountId: "acc-go-1", to: "+5555912345678", text: "Olá", traceId: "t1" });
    expect(result).toEqual({ providerMessageId: "GOOUT1", status: "sent" });
    expect(JSON.stringify(logs)).not.toContain("global-key");
  });

  it("sendMedia posts URL + type (no separate upload)", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://go.test/send/media");
      expect(JSON.parse(String(init?.body))).toMatchObject({
        number: "5555912345678", url: "https://storage/x.jpg", type: "image", caption: "foto",
      });
      return jsonResponse({ success: true, messageId: "GOMEDIA1" });
    }) as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn);

    await expect(
      provider.sendMedia({ accountId: "a", to: "+5555912345678", mediaType: "image", mediaIdOrUrl: "not-a-url" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const result = await provider.sendMedia({
      accountId: "a", to: "+5555912345678", mediaType: "image", mediaIdOrUrl: "https://storage/x.jpg", caption: "foto",
    });
    expect(result.providerMessageId).toBe("GOMEDIA1");
  });

  it("sendTemplate / sendInteractive / uploadOutboundMedia throw NOT_SUPPORTED", async () => {
    const { provider } = makeProvider(vi.fn() as unknown as typeof fetch);
    await expect(provider.sendTemplate({ accountId: "a", to: "+55", templateName: "x", languageCode: "pt_BR" })).rejects.toMatchObject({ code: "NOT_SUPPORTED" });
    await expect(provider.sendInteractive({ accountId: "a", to: "+55", bodyText: "x", kind: "buttons", options: [{ id: "1", title: "Sim" }] })).rejects.toMatchObject({ code: "NOT_SUPPORTED" });
    await expect(provider.uploadOutboundMedia(new Uint8Array([1]), "image/png")).rejects.toMatchObject({ code: "NOT_SUPPORTED" });
  });

  it("downloadInboundMedia decodes the media ref, posts /message/downloadimage and decodes base64", async () => {
    const ref = encodeGoMediaRef({ url: "https://m/x.enc", directPath: "/v/t", mediaKey: "AAAA", mimetype: "image/jpeg", fileLength: 3 });
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://go.test/message/downloadimage");
      expect(JSON.parse(String(init?.body))).toMatchObject({ url: "https://m/x.enc", directPath: "/v/t", mimetype: "image/jpeg" });
      return jsonResponse({ success: true, image: btoa("abc") });
    }) as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn);

    const out = await provider.downloadInboundMedia(ref);
    expect(out.mimeType).toBe("image/jpeg");
    expect(out.sizeBytes).toBe(3);
    expect(new TextDecoder().decode(out.data)).toBe("abc");
  });

  it("verifyWebhookSignature compares the payload instanceToken to the Vault token", async () => {
    const { provider } = makeProvider(vi.fn() as unknown as typeof fetch);
    expect(await provider.verifyWebhookSignature("{}", "inst-token")).toBe(true);
    expect(await provider.verifyWebhookSignature("{}", "wrong")).toBe(false);
  });

  it("healthCheck maps Connected:true to healthy", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ data: { Connected: true, LoggedIn: true } })) as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn);
    const h = await provider.healthCheck();
    expect(h.healthy).toBe(true);
  });

  it("capabilities are honest (no templates/interactive/upload)", () => {
    const { provider } = makeProvider(vi.fn() as unknown as typeof fetch);
    expect(provider.providerName).toBe("evolution-go");
    expect(provider.capabilities).toMatchObject({ supportsTemplates: false, supportsInteractive: false, supportsMediaUpload: false });
  });
});
