import { describe, expect, it, vi } from "vitest";
import { hmacSha256Hex } from "../crypto";
import { WhatsAppProviderError } from "../errors";
import type { IIntegrationLogEntry } from "../types";
import { MetaCloudProvider } from "./MetaCloudProvider";
import { META_GRAPH_BASE_URL } from "./constants";
import { mapMetaError } from "./errors";
import { parseMetaInbound } from "./parser";
import { verifyMetaWebhookSignature } from "./signature";

const CONFIG = {
  accountId: "acc-meta-1",
  phoneNumberId: "1234567890",
  businessAccountId: "9876543210",
  credentialsRef: "WHATSAPP_META_TEST",
};

const SECRETS: Record<string, string> = {
  WHATSAPP_META_TEST_ACCESS_TOKEN: "test-access-token",
  WHATSAPP_META_TEST_APP_SECRET: "test-app-secret",
  WHATSAPP_META_TEST_VERIFY_TOKEN: "test-verify-token",
};

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function makeProvider(fetchImpl: typeof fetch, overrides?: Partial<Record<string, string>>) {
  const logs: IIntegrationLogEntry[] = [];
  const secrets = { ...SECRETS, ...overrides };
  const provider = new MetaCloudProvider(CONFIG, {
    resolveSecret: async (name) => secrets[name],
    logIntegration: (entry) => {
      logs.push(entry);
    },
    fetchFn: fetchImpl,
  });
  return { provider, logs };
}

// ===== Sending ==============================================================

describe("MetaCloudProvider sending (RF-020..070)", () => {
  it("sendText posts the Cloud API payload and returns the wamid", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe(`${META_GRAPH_BASE_URL}/1234567890/messages`);
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer test-access-token",
        "X-Trace-Id": "trace-1",
      });
      expect(JSON.parse(String(init?.body))).toMatchObject({
        messaging_product: "whatsapp",
        to: "5555912345678",
        type: "text",
        text: { body: "Olá" },
      });
      return jsonResponse({ messages: [{ id: "wamid.123" }] });
    }) as unknown as typeof fetch;
    const { provider, logs } = makeProvider(fetchFn);

    const result = await provider.sendText({
      accountId: CONFIG.accountId,
      to: "+5555912345678",
      text: "Olá",
      traceId: "trace-1",
    });

    expect(result).toEqual({ providerMessageId: "wamid.123", status: "sent" });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      integrationName: "whatsapp_meta",
      endpoint: "/1234567890/messages",
      httpStatus: 200,
      traceId: "trace-1",
    });
    expect(logs[0]?.latencyMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(logs[0])).not.toContain("test-access-token");
  });

  it("sendText validates E.164 and text length without calling the network", async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn);

    await expect(
      provider.sendText({ accountId: "a", to: "55912345678", text: "x" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      provider.sendText({ accountId: "a", to: "+5555912345678", text: "x".repeat(5000) }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("sendTemplate builds language + body parameters", async () => {
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        type: "template",
        template: {
          name: "boas_vindas",
          language: { code: "pt_BR" },
          components: [{ type: "body", parameters: [{ type: "text", text: "Edmilson" }] }],
        },
      });
      return jsonResponse({ messages: [{ id: "wamid.tpl" }] });
    }) as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn);

    const result = await provider.sendTemplate({
      accountId: "a",
      to: "+5555912345678",
      templateName: "boas_vindas",
      languageCode: "pt_BR",
      bodyParameters: ["Edmilson"],
    });
    expect(result.providerMessageId).toBe("wamid.tpl");
  });

  it("sendInteractive enforces the 3-button cap (RF-070)", async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn);
    const options = [1, 2, 3, 4].map((n) => ({ id: String(n), title: `Op ${n}` }));

    await expect(
      provider.sendInteractive({
        accountId: "a",
        to: "+5555912345678",
        bodyText: "Escolha:",
        kind: "buttons",
        options,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("maps the 24h-window error 131047 to TEMPLATE_REQUIRED (RF-110)", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ error: { message: "Re-engagement", code: 131047 } }, 400),
    ) as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn);

    await expect(
      provider.sendText({ accountId: "a", to: "+5555912345678", text: "oi" }),
    ).rejects.toMatchObject({
      code: "TEMPLATE_REQUIRED",
      httpStatus: 422,
      message: "Fora da janela de 24h, use template",
    });
  });

  it("maps network failure to INTEGRATION_ERROR and still logs (RNF-004)", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    const { provider, logs } = makeProvider(fetchFn);

    await expect(
      provider.sendText({ accountId: "a", to: "+5555912345678", text: "oi" }),
    ).rejects.toMatchObject({ code: "INTEGRATION_ERROR", httpStatus: 502 });
    expect(logs[0]?.errorMessage).toContain("ECONNRESET");
  });

  it("throws UNAUTHORIZED naming the secret when the access token is missing", async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn, {
      WHATSAPP_META_TEST_ACCESS_TOKEN: "",
    });

    await expect(
      provider.sendText({ accountId: "a", to: "+5555912345678", text: "oi" }),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: expect.stringContaining("WHATSAPP_META_TEST_ACCESS_TOKEN"),
    });
  });
});

// ===== Error mapping ========================================================

describe("mapMetaError (RF-110)", () => {
  const cases: Array<[number, number, string]> = [
    [400, 131026, "VALIDATION_ERROR"],
    [400, 131047, "TEMPLATE_REQUIRED"],
    [400, 132000, "TEMPLATE_NOT_FOUND"],
    [401, 190, "UNAUTHORIZED"],
    [400, 4, "RATE_LIMITED"],
    [400, 80007, "RATE_LIMITED"],
    [400, 100, "VALIDATION_ERROR"],
    [500, 999999, "INTEGRATION_ERROR"],
  ];
  it.each(cases)("HTTP %i + code %i → %s", (httpStatus, code, expected) => {
    const error = mapMetaError(httpStatus, { error: { code, message: "x" } }, "/p/messages");
    expect(error).toBeInstanceOf(WhatsAppProviderError);
    expect(error.code).toBe(expected);
  });

  it("HTTP 429 without body code is RATE_LIMITED with retryAfter detail", () => {
    const error = mapMetaError(429, null, "/p/messages", "30");
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.details?.retryAfter).toBe("30");
  });
});

// ===== Signature ============================================================

describe("verifyMetaWebhookSignature (RF-080 / RNF-002)", () => {
  const body = '{"entry":[]}';
  const secret = "app-secret";

  it("accepts a correctly signed body and rejects a flipped byte", async () => {
    const signature = `sha256=${await hmacSha256Hex(secret, body)}`;
    expect(await verifyMetaWebhookSignature(body, signature, secret)).toBe(true);
    expect(await verifyMetaWebhookSignature('{"entry":[1]}', signature, secret)).toBe(false);
  });

  it("rejects malformed signatures without throwing", async () => {
    expect(await verifyMetaWebhookSignature(body, "", secret)).toBe(false);
    expect(await verifyMetaWebhookSignature(body, "md5=abc", secret)).toBe(false);
    expect(await verifyMetaWebhookSignature(body, "sha256=short", secret)).toBe(false);
  });

  it("provider.verifyWebhookSignature returns false when the app secret is missing", async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn, { WHATSAPP_META_TEST_APP_SECRET: "" });
    expect(await provider.verifyWebhookSignature(body, "sha256=abc")).toBe(false);
  });
});

// ===== Parser ===============================================================

function metaEnvelope(value: unknown) {
  return { object: "whatsapp_business_account", entry: [{ changes: [{ value }] }] };
}

const METADATA = { display_phone_number: "5555911111111", phone_number_id: "1234567890" };

describe("parseMetaInbound (RF-090)", () => {
  const fetchFn = vi.fn() as unknown as typeof fetch;
  const { provider } = makeProvider(fetchFn);

  it("normalizes a text message", () => {
    const parsed = provider.parseInboundMessage(
      metaEnvelope({
        metadata: METADATA,
        messages: [
          {
            id: "wamid.in1",
            from: "5555988887777",
            timestamp: "1765400000",
            type: "text",
            text: { body: "preciso de um filtro" },
          },
        ],
      }),
    );
    expect(parsed).toMatchObject({
      type: "message",
      providerMessageId: "wamid.in1",
      fromPhone: "+5555988887777",
      toAccountPhone: "+5555911111111",
      accountId: "acc-meta-1",
      contentType: "text",
      text: "preciso de um filtro",
    });
  });

  it("normalizes an image with caption and mediaId", () => {
    const parsed = parseMetaInbound(
      metaEnvelope({
        metadata: METADATA,
        messages: [
          {
            id: "wamid.img",
            from: "5555988887777",
            type: "image",
            image: { id: "media-1", caption: "foto da peça" },
          },
        ],
      }),
      "acc-meta-1",
    );
    expect(parsed).toMatchObject({
      type: "message",
      contentType: "image",
      mediaId: "media-1",
      mediaCaption: "foto da peça",
    });
  });

  it("inbound document exposes the original filename as mediaFilename", () => {
    const parsed = parseMetaInbound(
      {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { display_phone_number: "5555911111111" },
                  messages: [
                    {
                      id: "wamid.doc",
                      from: "5555988887777",
                      timestamp: "1750000000",
                      type: "document",
                      document: { id: "med-1", caption: "segue", filename: "Orcamento-123.pdf" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      "acc-1",
    );
    expect(parsed).toMatchObject({
      type: "message",
      contentType: "document",
      mediaFilename: "Orcamento-123.pdf",
    });
  });

  it("normalizes button and list replies to text", () => {
    const button = parseMetaInbound(
      metaEnvelope({
        metadata: METADATA,
        messages: [
          {
            id: "wamid.btn",
            from: "5555988887777",
            type: "interactive",
            interactive: { type: "button_reply", button_reply: { id: "1", title: "Sim" } },
          },
        ],
      }),
      "acc",
    );
    expect(button).toMatchObject({ type: "message", contentType: "text", text: "Sim" });

    const list = parseMetaInbound(
      metaEnvelope({
        metadata: METADATA,
        messages: [
          {
            id: "wamid.lst",
            from: "5555988887777",
            type: "interactive",
            interactive: { type: "list_reply", list_reply: { id: "2", title: "Filtro de óleo" } },
          },
        ],
      }),
      "acc",
    );
    expect(list).toMatchObject({ contentType: "text", text: "Filtro de óleo" });
  });

  it("normalizes statuses including failure reason", () => {
    const read = parseMetaInbound(
      metaEnvelope({
        metadata: METADATA,
        statuses: [{ id: "wamid.out1", status: "read", timestamp: "1765400100" }],
      }),
      "acc",
    );
    expect(read).toMatchObject({ type: "status", providerMessageId: "wamid.out1", status: "read" });

    const failed = parseMetaInbound(
      metaEnvelope({
        metadata: METADATA,
        statuses: [
          {
            id: "wamid.out2",
            status: "failed",
            errors: [{ code: 131026, title: "Unsupported", message: "Número não é WhatsApp" }],
          },
        ],
      }),
      "acc",
    );
    expect(failed).toMatchObject({
      type: "status",
      status: "failed",
      failureReason: "Número não é WhatsApp",
    });
  });

  it("keeps unsupported kinds as contentType unknown and throws on garbage", () => {
    const unknown = parseMetaInbound(
      metaEnvelope({
        metadata: METADATA,
        messages: [{ id: "wamid.x", from: "5555988887777", type: "reaction" }],
      }),
      "acc",
    );
    expect(unknown).toMatchObject({ type: "message", contentType: "unknown" });

    expect(() => parseMetaInbound({ foo: "bar" }, "acc")).toThrow(/irreconhecível/);
  });

  it("normalizes a shared location into the canonical location text", () => {
    const parsed = parseMetaInbound(
      metaEnvelope({
        metadata: METADATA,
        messages: [
          {
            id: "wamid.loc",
            from: "5555988887777",
            type: "location",
            location: { latitude: -27.39, longitude: -53.4, name: "Oficina Central" },
          },
        ],
      }),
      "acc",
    ) as { contentType: string; text: string };
    expect(parsed.contentType).toBe("location");
    expect(parsed.text).toBe("Oficina Central\n-27.39,-53.4");
  });

  it("uses the location address as the label when no name was attached", () => {
    const parsed = parseMetaInbound(
      metaEnvelope({
        metadata: METADATA,
        messages: [
          {
            id: "wamid.loc2",
            from: "5555988887777",
            type: "location",
            location: { latitude: -27.39, longitude: -53.4, address: "Av. Brasil, 1000 - Centro" },
          },
        ],
      }),
      "acc",
    ) as { text: string };
    expect(parsed.text).toBe("Av. Brasil, 1000 - Centro\n-27.39,-53.4");
  });

  it("normalizes a shared contact, cleaning the formatted phone to E.164", () => {
    const parsed = parseMetaInbound(
      metaEnvelope({
        metadata: METADATA,
        messages: [
          {
            id: "wamid.contact",
            from: "5555988887777",
            type: "contacts",
            // Meta returns the phone as the sender saved it — with separators.
            contacts: [
              { name: { formatted_name: "Fornecedor X" }, phones: [{ phone: "+55 54 99888-7777", wa_id: "5554998887777" }] },
            ],
          },
        ],
      }),
      "acc",
    ) as { contentType: string; text: string };
    expect(parsed.contentType).toBe("contact");
    expect(parsed.text).toBe("Fornecedor X\n+5554998887777");
  });

  it("falls back to wa_id when the contact phone is an empty string", () => {
    const parsed = parseMetaInbound(
      metaEnvelope({
        metadata: METADATA,
        messages: [
          {
            id: "wamid.contact2",
            from: "5555988887777",
            type: "contacts",
            contacts: [{ name: { formatted_name: "Sem número salvo" }, phones: [{ phone: "", wa_id: "5511999990000" }] }],
          },
        ],
      }),
      "acc",
    ) as { contentType: string; text: string };
    expect(parsed.text).toBe("Sem número salvo\n+5511999990000");
  });
});

// ===== Media + health =======================================================

describe("MetaCloudProvider media and health (RF-040/050/100)", () => {
  it("uploadOutboundMedia validates size/mime and returns the media id", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe(`${META_GRAPH_BASE_URL}/1234567890/media`);
      expect(init?.body).toBeInstanceOf(FormData);
      return jsonResponse({ id: "media-99" });
    }) as unknown as typeof fetch;
    const { provider } = makeProvider(fetchFn);

    await expect(
      provider.uploadOutboundMedia(new Uint8Array([1]), "application/x-msdownload"),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const result = await provider.uploadOutboundMedia(new Uint8Array([1, 2, 3]), "image/png");
    expect(result.mediaId).toBe("media-99");
  });

  it("downloadInboundMedia does the 2-step lookup + binary fetch (RF-050)", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url) === `${META_GRAPH_BASE_URL}/media-1`) {
        return jsonResponse({
          url: "https://lookaside.example/media-1.bin",
          mime_type: "image/jpeg",
          file_size: 3,
        });
      }
      expect(String(url)).toBe("https://lookaside.example/media-1.bin");
      return new Response(new Uint8Array([7, 8, 9]), { status: 200 });
    }) as unknown as typeof fetch;
    const { provider, logs } = makeProvider(fetchFn);

    const result = await provider.downloadInboundMedia("media-1");
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.sizeBytes).toBe(3);
    expect(Array.from(result.data)).toEqual([7, 8, 9]);
    // Both steps logged; the temporary URL is not used as the endpoint label.
    expect(logs).toHaveLength(2);
    expect(logs[1]?.endpoint).toBe("(media url)");
  });

  it("healthCheck is healthy on 200 and degraded-not-throwing on failure (RF-100)", async () => {
    const okFetch = vi.fn(async () =>
      jsonResponse({ display_phone_number: "5555911111111", quality_rating: "GREEN" }),
    ) as unknown as typeof fetch;
    const healthy = await makeProvider(okFetch).provider.healthCheck();
    expect(healthy.healthy).toBe(true);
    expect(healthy.detail).toContain("GREEN");

    const downFetch = vi.fn(async () =>
      jsonResponse({ error: { code: 190, message: "bad token" } }, 401),
    ) as unknown as typeof fetch;
    const down = await makeProvider(downFetch).provider.healthCheck();
    expect(down.healthy).toBe(false);
    expect(down.detail).toContain("token");
  });
});
