import { describe, expect, it, vi } from "vitest";
import {
  createOpenWaSession,
  startOpenWaSession,
  getOpenWaQr,
  getOpenWaStatus,
  stopOpenWaSession,
  deleteOpenWaSession,
  restartOpenWaSession,
  registerOpenWaWebhook,
  resolveOpenWaContact,
} from "./instance";
import type { IEngineDeps } from "../types";

function deps(fetchImpl: typeof fetch): IEngineDeps {
  return { resolveSecret: async () => undefined, fetchFn: fetchImpl };
}
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const TARGET = { baseUrl: "https://openwa.test", sessionId: "sess-1" };

describe("openwa session management", () => {
  it("createOpenWaSession posts { name } with the global key and returns the server-generated id", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://openwa.test/api/sessions");
      expect(init?.headers).toMatchObject({ "x-api-key": "global-key" });
      expect(JSON.parse(String(init?.body))).toEqual({ name: "comercial-volvo" });
      return jsonResponse({ id: "sess-new-1", name: "comercial-volvo", status: "created" });
    }) as unknown as typeof fetch;

    const out = await createOpenWaSession(
      "global-key",
      deps(fetchFn),
      { baseUrl: "https://openwa.test" },
      "comercial-volvo",
    );
    expect(out).toEqual({ sessionId: "sess-new-1" });
  });

  it("startOpenWaSession posts to /sessions/{id}/start and returns the status", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toBe("https://openwa.test/api/sessions/sess-1/start");
      return jsonResponse({ id: "sess-1", status: "qr_ready" });
    }) as unknown as typeof fetch;

    const out = await startOpenWaSession("global-key", deps(fetchFn), TARGET);
    expect(out).toEqual({ status: "qr_ready" });
  });

  it("getOpenWaQr returns state=qr with the data URI when qrCode is present", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://openwa.test/api/sessions/sess-1/qr");
      expect(init?.method).toBe("GET");
      return jsonResponse({ qrCode: "data:image/png;base64,AAAA" });
    }) as unknown as typeof fetch;

    const out = await getOpenWaQr("global-key", deps(fetchFn), TARGET);
    expect(out).toEqual({ state: "qr", qrBase64: "data:image/png;base64,AAAA" });
  });

  it("getOpenWaQr returns state=open when no qrCode is present (already paired)", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({})) as unknown as typeof fetch;
    const out = await getOpenWaQr("global-key", deps(fetchFn), TARGET);
    expect(out).toEqual({ state: "open" });
  });

  it("getOpenWaStatus maps status=ready (confirmed live) + normalizes the phone to E.164", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://openwa.test/api/sessions/sess-1");
      expect(init?.method).toBe("GET");
      return jsonResponse({ status: "ready", phone: "555481572275" });
    }) as unknown as typeof fetch;

    const out = await getOpenWaStatus("global-key", deps(fetchFn), TARGET);
    expect(out).toEqual({ status: "ready", connected: true, phoneNumber: "+555481572275" });
  });

  it("getOpenWaStatus also accepts status=connected as a defensive fallback", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ status: "connected" })) as unknown as typeof fetch;
    const out = await getOpenWaStatus("global-key", deps(fetchFn), TARGET);
    expect(out.connected).toBe(true);
  });

  it("getOpenWaStatus reports connected=false for any non-connected status", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ status: "qr_ready" })) as unknown as typeof fetch;
    const out = await getOpenWaStatus("global-key", deps(fetchFn), TARGET);
    expect(out.connected).toBe(false);
  });

  it("stopOpenWaSession posts to /sessions/{id}/stop", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toBe("https://openwa.test/api/sessions/sess-1/stop");
      return jsonResponse({});
    }) as unknown as typeof fetch;
    await stopOpenWaSession("global-key", deps(fetchFn), TARGET);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("deleteOpenWaSession issues a DELETE to /sessions/{id}", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://openwa.test/api/sessions/sess-1");
      expect(init?.method).toBe("DELETE");
      return jsonResponse({});
    }) as unknown as typeof fetch;
    await deleteOpenWaSession("global-key", deps(fetchFn), TARGET);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("restartOpenWaSession stops then starts, tolerating a failed stop", async () => {
    const calls: string[] = [];
    const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
      const path = String(url);
      calls.push(path);
      if (path.endsWith("/stop")) return jsonResponse({ message: "already stopped" }, 409);
      return jsonResponse({ status: "qr_ready" });
    }) as unknown as typeof fetch;

    await restartOpenWaSession("global-key", deps(fetchFn), TARGET);
    expect(calls).toEqual([
      "https://openwa.test/api/sessions/sess-1/stop",
      "https://openwa.test/api/sessions/sess-1/start",
    ]);
  });

  it("resolveOpenWaContact resolves an @lid to the canonical @c.us jid (confirmed live shape)", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe(
        "https://openwa.test/api/sessions/sess-1/contacts/213202294059192%40lid",
      );
      expect(init?.method).toBe("GET");
      return jsonResponse({
        id: "555481169884@c.us",
        name: "AILA Sistemas Inteligentes",
        pushName: "AILA - Sistemas Inteligentes",
        // Echoes the queried lid digits — must NOT be used as the phone.
        number: "213202294059192",
        isMyContact: true,
        isBlocked: false,
      });
    }) as unknown as typeof fetch;

    const out = await resolveOpenWaContact(
      "global-key",
      deps(fetchFn),
      TARGET,
      "213202294059192@lid",
    );
    expect(out).toEqual({
      jid: "555481169884@c.us",
      name: "AILA Sistemas Inteligentes",
      pushName: "AILA - Sistemas Inteligentes",
    });
  });

  it("resolveOpenWaContact returns an empty result for an unknown contact body", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({})) as unknown as typeof fetch;
    const out = await resolveOpenWaContact("global-key", deps(fetchFn), TARGET, "9@lid");
    expect(out.jid).toBeUndefined();
  });

  it("registerOpenWaWebhook posts url + the confirmed event set", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://openwa.test/api/sessions/sess-1/webhooks");
      const body = JSON.parse(String(init?.body));
      expect(body.url).toBe("https://edge.test/whatsapp-webhook/openwa");
      expect(body.events).toEqual([
        "message.received",
        "message.ack",
        "message.sent",
        "session.status",
        "session.qr",
      ]);
      return jsonResponse({ id: "wh-1" });
    }) as unknown as typeof fetch;

    await registerOpenWaWebhook(
      "global-key",
      deps(fetchFn),
      TARGET,
      "https://edge.test/whatsapp-webhook/openwa",
    );
    expect(fetchFn).toHaveBeenCalledOnce();
  });
});
