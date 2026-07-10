import { describe, expect, it, vi } from "vitest";
import { wahaRequest } from "./client";
import { WhatsAppProviderError } from "../errors";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("wahaRequest", () => {
  it("sends X-Api-Key and JSON body, returns parsed JSON on 2xx", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    const result = await wahaRequest("my-key", fetchFn, {
      baseUrl: "https://waha.example.com",
      path: "/api/sessions",
      json: { name: "s1" },
    });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://waha.example.com/api/sessions");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Api-Key"]).toBe("my-key");
    expect(JSON.parse(init.body)).toEqual({ name: "s1" });
  });

  it("defaults to GET when no json body and method omitted is still POST unless specified", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    await wahaRequest("k", fetchFn, {
      baseUrl: "https://waha.example.com",
      path: "/api/sessions/s1",
      method: "GET",
    });
    expect(fetchFn.mock.calls[0][1].method).toBe("GET");
  });

  it("returns raw bytes when expectBinary is set", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        new Response(bytes, { status: 200, headers: { "content-type": "image/png" } }),
      );
    const result = await wahaRequest("k", fetchFn, {
      baseUrl: "https://waha.example.com",
      path: "/api/s1/auth/qr",
      method: "GET",
      expectBinary: true,
    });
    expect(result.bytes).toEqual(bytes);
    expect(result.contentType).toBe("image/png");
  });

  it("throws WhatsAppProviderError on non-2xx", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(401, { error: "bad key" }));
    await expect(
      wahaRequest("bad", fetchFn, { baseUrl: "https://waha.example.com", path: "/api/sessions" }),
    ).rejects.toBeInstanceOf(WhatsAppProviderError);
  });
});
