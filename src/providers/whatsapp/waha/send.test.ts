import { describe, expect, it, vi } from "vitest";
import { sendWahaMedia, sendWahaText } from "./send";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const target = { baseUrl: "https://waha.example.com", sessionName: "loja-abc123" };

describe("sendWahaText", () => {
  it("POSTs /api/sendText with session, chatId, text", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "true_123@c.us_ABC" }));
    const result = await sendWahaText("key", fetchFn, target, {
      toPhone: "+5511988887777",
      text: "Olá!",
    });
    expect(result.providerMessageId).toBe("true_123@c.us_ABC");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://waha.example.com/api/sendText");
    const body = JSON.parse(init.body);
    expect(body).toEqual({ session: "loja-abc123", chatId: "5511988887777@c.us", text: "Olá!" });
  });

  it("throws when the response has no id", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    await expect(
      sendWahaText("key", fetchFn, target, { toPhone: "+5511988887777", text: "oi" }),
    ).rejects.toThrow();
  });
});

describe("sendWahaMedia", () => {
  it("POSTs /api/sendImage for image mediaType", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "true_456@c.us_DEF" }));
    const result = await sendWahaMedia("key", fetchFn, target, {
      toPhone: "+5511988887777",
      mediaType: "image",
      mediaUrl: "https://storage.example.com/signed.jpg",
      caption: "Peça em anexo",
      filename: "peca.jpg",
    });
    expect(result.providerMessageId).toBe("true_456@c.us_DEF");
    expect(fetchFn.mock.calls[0][0]).toBe("https://waha.example.com/api/sendImage");
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.file).toEqual({
      mimetype: undefined,
      url: "https://storage.example.com/signed.jpg",
      filename: "peca.jpg",
    });
    expect(body.caption).toBe("Peça em anexo");
  });

  it("POSTs /api/sendFile for document mediaType", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "true_789@c.us_GHI" }));
    await sendWahaMedia("key", fetchFn, target, {
      toPhone: "+5511988887777",
      mediaType: "document",
      mediaUrl: "https://storage.example.com/orcamento.pdf",
      filename: "orcamento.pdf",
    });
    expect(fetchFn.mock.calls[0][0]).toBe("https://waha.example.com/api/sendFile");
  });
});
