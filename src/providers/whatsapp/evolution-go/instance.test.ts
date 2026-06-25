import { describe, expect, it, vi } from "vitest";
import {
  createGoInstance,
  connectGoInstance,
  getGoInstanceQr,
  getGoInstanceStatus,
  deleteGoInstance,
  logoutGoInstance,
  restartGoInstance,
} from "./instance";
import type { IEngineDeps } from "../types";
import { WhatsAppProviderError } from "../errors";

function deps(fetchImpl: typeof fetch): IEngineDeps {
  return { resolveSecret: async () => undefined, fetchFn: fetchImpl };
}
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("evolution-go instance management", () => {
  it("createGoInstance posts name+token (global apikey, no instanceId header) and returns id+token", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://go.test/instance/create");
      expect(init?.headers).toMatchObject({ apikey: "global-key" });
      expect((init?.headers as Record<string, string>).instanceId).toBeUndefined();
      expect(JSON.parse(String(init?.body))).toMatchObject({ name: "comercial-volvo", token: "tok-xyz" });
      return jsonResponse({ data: { id: "inst-uuid-9", name: "comercial-volvo", token: "tok-xyz", connected: false }, message: "success" });
    }) as unknown as typeof fetch;

    const out = await createGoInstance("global-key", deps(fetchFn), {
      baseUrl: "https://go.test",
      name: "comercial-volvo",
      token: "tok-xyz",
    });
    expect(out).toEqual({ instanceId: "inst-uuid-9", token: "tok-xyz" });
  });

  it("connectGoInstance posts webhookUrl + subscribe, authed by the instance token (no instanceId header)", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://go.test/instance/connect");
      expect(init?.headers).toMatchObject({ apikey: "inst-token-1" });
      expect((init?.headers as Record<string, string>).instanceId).toBeUndefined();
      expect(JSON.parse(String(init?.body))).toMatchObject({
        immediate: true,
        webhookUrl: "https://app/functions/v1/whatsapp-webhook/evolution-go",
        subscribe: ["MESSAGE", "READ_RECEIPT"],
      });
      return jsonResponse({ data: { eventString: "MESSAGE,READ_RECEIPT", webhookUrl: "x" }, message: "success" });
    }) as unknown as typeof fetch;

    await connectGoInstance(
      "inst-token-1",
      deps(fetchFn),
      { baseUrl: "https://go.test", instanceId: "inst-uuid-9" },
      "https://app/functions/v1/whatsapp-webhook/evolution-go",
      ["MESSAGE", "READ_RECEIPT"],
    );
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("getGoInstanceQr returns qr base64 + code", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://go.test/instance/qr");
      expect(init?.method).toBe("GET");
      return jsonResponse({ data: { Qrcode: "data:image/png;base64,iVBOR", Code: "2@abc" }, message: "success" });
    }) as unknown as typeof fetch;

    const qr = await getGoInstanceQr("global-key", deps(fetchFn), { baseUrl: "https://go.test", instanceId: "inst-uuid-9" });
    expect(qr).toEqual({ state: "qr", qrBase64: "data:image/png;base64,iVBOR", pairingCode: "2@abc" });
  });

  it("getGoInstanceStatus maps Connected/LoggedIn booleans", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ data: { Connected: true, LoggedIn: true, Name: "" }, message: "success" }),
    ) as unknown as typeof fetch;

    const status = await getGoInstanceStatus("global-key", deps(fetchFn), { baseUrl: "https://go.test", instanceId: "inst-uuid-9" });
    expect(status).toEqual({ connected: true, loggedIn: true });
  });

  it("getGoInstanceQr returns state=open when the instance reports no QR but logged in", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ data: { Code: "" }, message: "already connected" }, 200)) as unknown as typeof fetch;
    const qr = await getGoInstanceQr("global-key", deps(fetchFn), { baseUrl: "https://go.test", instanceId: "i" });
    expect(qr.state).toBe("open");
  });

  it("deleteGoInstance targets /instance/delete/{instanceId} with DELETE", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://go.test/instance/delete/inst-uuid-9");
      expect(init?.method).toBe("DELETE");
      return jsonResponse({ message: "success" });
    }) as unknown as typeof fetch;
    await deleteGoInstance("global-key", deps(fetchFn), { baseUrl: "https://go.test", instanceId: "inst-uuid-9" });
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("restartGoInstance targets POST /instance/reconnect (Go has no /instance/restart)", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://go.test/instance/reconnect");
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>).instanceId).toBeUndefined();
      return jsonResponse({ message: "success" });
    }) as unknown as typeof fetch;
    await restartGoInstance("global-key", deps(fetchFn), { baseUrl: "https://go.test", instanceId: "inst-uuid-9" });
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("logoutGoInstance targets DELETE /instance/logout", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://go.test/instance/logout");
      expect(init?.method).toBe("DELETE");
      return jsonResponse({ message: "success" });
    }) as unknown as typeof fetch;
    await logoutGoInstance("global-key", deps(fetchFn), { baseUrl: "https://go.test", instanceId: "inst-uuid-9" });
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("createGoInstance throws when the response has no id", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ data: {}, message: "success" })) as unknown as typeof fetch;
    await expect(
      createGoInstance("global-key", deps(fetchFn), { baseUrl: "https://go.test", name: "x" }),
    ).rejects.toBeInstanceOf(WhatsAppProviderError);
  });
});
