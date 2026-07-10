import { describe, expect, it, vi } from "vitest";
import {
  buildWahaConfig,
  createWahaSession,
  deleteWahaSession,
  getWahaSessionQrPng,
  getWahaSessionStatus,
  logoutWahaSession,
  pingWahaServer,
  restartWahaSession,
  stopWahaSession,
  updateWahaSessionConfig,
} from "./session";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const target = { baseUrl: "https://waha.example.com", sessionName: "loja-abc123" };

describe("WAHA session lifecycle", () => {
  it("createWahaSession POSTs /api/sessions with webhook config", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse(201, { name: "loja-abc123", status: "STARTING" }));
    await createWahaSession("key", fetchFn, {
      baseUrl: target.baseUrl,
      sessionName: target.sessionName,
      webhookUrl: "https://edge.example.com/waha-webhook",
      hmacKey: "secret",
    });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://waha.example.com/api/sessions");
    const body = JSON.parse(init.body);
    expect(body.name).toBe("loja-abc123");
    expect(body.start).toBe(true);
    expect(body.config.webhooks[0].url).toBe("https://edge.example.com/waha-webhook");
    expect(body.config.webhooks[0].hmac.key).toBe("secret");
    expect(body.config.webhooks[0].events).toContain("message");
  });

  it("getWahaSessionStatus GETs /api/sessions/{name} and returns state + me", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        name: "loja-abc123",
        status: "WORKING",
        me: { id: "5511999999999@c.us" },
      }),
    );
    const status = await getWahaSessionStatus("key", fetchFn, target);
    expect(status.state).toBe("WORKING");
    expect(status.phoneNumber).toBe("+5511999999999");
  });

  it("getWahaSessionStatus tolerates a missing me field", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { name: "loja-abc123", status: "STARTING" }));
    const status = await getWahaSessionStatus("key", fetchFn, target);
    expect(status.state).toBe("STARTING");
    expect(status.phoneNumber).toBeUndefined();
  });

  it("getWahaSessionQrPng GETs the binary QR endpoint and base64-encodes it", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        new Response(bytes, { status: 200, headers: { "content-type": "image/png" } }),
      );
    const qr = await getWahaSessionQrPng("key", fetchFn, target);
    expect(fetchFn.mock.calls[0][0]).toBe("https://waha.example.com/api/loja-abc123/auth/qr");
    expect(qr.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("stopWahaSession/logoutWahaSession/restartWahaSession/deleteWahaSession hit the right endpoints", async () => {
    const fetchFn = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(200, {})));
    await stopWahaSession("key", fetchFn, target);
    expect(fetchFn.mock.calls[0][0]).toBe("https://waha.example.com/api/sessions/loja-abc123/stop");

    await logoutWahaSession("key", fetchFn, target);
    expect(fetchFn.mock.calls[1][0]).toBe(
      "https://waha.example.com/api/sessions/loja-abc123/logout",
    );

    await restartWahaSession("key", fetchFn, target);
    expect(fetchFn.mock.calls[2][0]).toBe(
      "https://waha.example.com/api/sessions/loja-abc123/restart",
    );

    await deleteWahaSession("key", fetchFn, target);
    expect(fetchFn.mock.calls[3][0]).toBe("https://waha.example.com/api/sessions/loja-abc123");
    expect(fetchFn.mock.calls[3][1].method).toBe("DELETE");
  });

  it("pingWahaServer GETs /api/sessions and returns the session count", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, [{ name: "a" }, { name: "b" }]));
    const result = await pingWahaServer("key", fetchFn, "https://waha.example.com");
    expect(fetchFn.mock.calls[0][0]).toBe("https://waha.example.com/api/sessions");
    expect(fetchFn.mock.calls[0][1].method).toBe("GET");
    expect(result.sessionCount).toBe(2);
  });

  it("pingWahaServer surfaces a mapped error for an invalid API key", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(401, { message: "Unauthorized" }));
    await expect(pingWahaServer("bad-key", fetchFn, "https://waha.example.com")).rejects.toThrow(
      "Chave da API WAHA inválida ou ausente",
    );
  });
});

describe("WAHA session config", () => {
  it("buildWahaConfig ignores all non-1:1 chat types by default and keeps webhooks", () => {
    const config = buildWahaConfig("https://edge/waha-webhook", "secret");
    expect(config.ignore).toEqual({ status: true, groups: true, channels: true, broadcast: true });
    expect(config.debug).toBeUndefined();
    expect((config.webhooks as Array<{ url: string }>)[0].url).toBe("https://edge/waha-webhook");
  });

  it("buildWahaConfig inverts chatFilters (process=true → ignore=false) and sets debug/proxy", () => {
    const config = buildWahaConfig("https://edge/waha-webhook", "secret", {
      chatFilters: { groups: true, status: false, channels: false, broadcast: false },
      debug: true,
      proxy: { server: "http://proxy:8080" },
    });
    expect(config.ignore).toEqual({ status: true, groups: false, channels: true, broadcast: true });
    expect(config.debug).toBe(true);
    expect(config.proxy).toEqual({ server: "http://proxy:8080" });
  });

  it("createWahaSession sends the built config with settings", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(201, { name: "s", status: "STARTING" }));
    await createWahaSession("key", fetchFn, {
      baseUrl: "https://waha.example.com",
      sessionName: "loja-abc123",
      webhookUrl: "https://edge/waha-webhook",
      hmacKey: "secret",
      settings: { chatFilters: { groups: true, status: true, channels: false, broadcast: false }, debug: false },
    });
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.config.ignore).toEqual({ status: false, groups: false, channels: true, broadcast: true });
  });

  it("updateWahaSessionConfig PUTs the full config to /api/sessions/{name}", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    await updateWahaSessionConfig("key", fetchFn, {
      baseUrl: "https://waha.example.com",
      sessionName: "loja-abc123",
      webhookUrl: "https://edge/waha-webhook",
      hmacKey: "secret",
      settings: { chatFilters: { groups: false, status: false, channels: false, broadcast: false }, debug: true },
    });
    expect(fetchFn.mock.calls[0][0]).toBe("https://waha.example.com/api/sessions/loja-abc123");
    expect(fetchFn.mock.calls[0][1].method).toBe("PUT");
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.config.webhooks[0].hmac.key).toBe("secret");
    expect(body.config.debug).toBe(true);
  });
});
