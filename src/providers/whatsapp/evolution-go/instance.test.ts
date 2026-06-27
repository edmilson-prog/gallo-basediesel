import { describe, expect, it, vi } from "vitest";
import {
  createGoInstance,
  connectGoInstance,
  getGoInstanceQr,
  getGoInstanceStatus,
  deleteGoInstance,
  fetchGoOwnNumber,
  fetchGoProfilePictureUrl,
  logoutGoInstance,
  restartGoInstance,
} from "./instance";
import type { IEngineDeps } from "../types";

function deps(fetchImpl: typeof fetch): IEngineDeps {
  return { resolveSecret: async () => undefined, fetchFn: fetchImpl };
}
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("evolution-go instance management", () => {
  it("createGoInstance posts instanceId+name+token (global apikey, no instanceId header) and returns the echoed id+token", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://go.test/instance/create");
      expect(init?.headers).toMatchObject({ apikey: "global-key" });
      expect((init?.headers as Record<string, string>).instanceId).toBeUndefined();
      const sent = JSON.parse(String(init?.body));
      expect(sent).toMatchObject({ name: "comercial-volvo", token: "tok-xyz" });
      // The Go server requires a client-provided uuid id; it is minted when absent.
      expect(typeof sent.instanceId).toBe("string");
      expect(sent.instanceId.length).toBeGreaterThan(0);
      return jsonResponse({ data: { id: "inst-uuid-9", name: "comercial-volvo", token: "tok-xyz", connected: false }, message: "success" });
    }) as unknown as typeof fetch;

    const out = await createGoInstance("global-key", deps(fetchFn), {
      baseUrl: "https://go.test",
      name: "comercial-volvo",
      token: "tok-xyz",
    });
    expect(out).toEqual({ instanceId: "inst-uuid-9", token: "tok-xyz" });
  });

  it("createGoInstance mints a token (server requires it) and falls back to sent values when the response omits them", async () => {
    let sent: { instanceId?: string; token?: string } = {};
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      expect(typeof sent.token).toBe("string");
      expect(String(sent.token).length).toBeGreaterThan(0);
      expect(typeof sent.instanceId).toBe("string");
      expect(String(sent.instanceId).length).toBeGreaterThan(0);
      return jsonResponse({ data: {}, message: "success" });
    }) as unknown as typeof fetch;

    const out = await createGoInstance("global-key", deps(fetchFn), { baseUrl: "https://go.test", name: "x" });
    expect(out).toEqual({ instanceId: sent.instanceId, token: sent.token });
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
      expect(init?.headers).toMatchObject({ apikey: "inst-token" });
      expect((init?.headers as Record<string, string>).instanceId).toBeUndefined();
      return jsonResponse({ data: { Qrcode: "data:image/png;base64,iVBOR", Code: "2@abc" }, message: "success" });
    }) as unknown as typeof fetch;

    const qr = await getGoInstanceQr("inst-token", deps(fetchFn), { baseUrl: "https://go.test", instanceId: "inst-uuid-9" });
    expect(qr).toEqual({ state: "qr", qrBase64: "data:image/png;base64,iVBOR", pairingCode: "2@abc" });
  });

  it("getGoInstanceStatus maps Connected/LoggedIn booleans", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://go.test/instance/status");
      expect(init?.headers).toMatchObject({ apikey: "inst-token" });
      expect((init?.headers as Record<string, string>).instanceId).toBeUndefined();
      return jsonResponse({ data: { Connected: true, LoggedIn: true, Name: "" }, message: "success" });
    }) as unknown as typeof fetch;

    const status = await getGoInstanceStatus("inst-token", deps(fetchFn), { baseUrl: "https://go.test", instanceId: "inst-uuid-9" });
    expect(status).toEqual({ connected: true, loggedIn: true });
  });

  it("getGoInstanceQr returns state=open when the instance reports no QR but logged in", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ data: { Code: "" }, message: "already connected" }, 200)) as unknown as typeof fetch;
    const qr = await getGoInstanceQr("inst-token", deps(fetchFn), { baseUrl: "https://go.test", instanceId: "i" });
    expect(qr.state).toBe("open");
  });

  it("deleteGoInstance targets /instance/delete/{instanceId} with DELETE", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://go.test/instance/delete/inst-uuid-9");
      expect(init?.method).toBe("DELETE");
      expect(init?.headers).toMatchObject({ apikey: "inst-token" });
      expect((init?.headers as Record<string, string>).instanceId).toBeUndefined();
      return jsonResponse({ message: "success" });
    }) as unknown as typeof fetch;
    await deleteGoInstance("inst-token", deps(fetchFn), { baseUrl: "https://go.test", instanceId: "inst-uuid-9" });
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("restartGoInstance targets POST /instance/reconnect (Go has no /instance/restart)", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://go.test/instance/reconnect");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({ apikey: "inst-token" });
      expect((init?.headers as Record<string, string>).instanceId).toBeUndefined();
      return jsonResponse({ message: "success" });
    }) as unknown as typeof fetch;
    await restartGoInstance("inst-token", deps(fetchFn), { baseUrl: "https://go.test", instanceId: "inst-uuid-9" });
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("logoutGoInstance targets DELETE /instance/logout", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://go.test/instance/logout");
      expect(init?.method).toBe("DELETE");
      expect(init?.headers).toMatchObject({ apikey: "inst-token" });
      expect((init?.headers as Record<string, string>).instanceId).toBeUndefined();
      return jsonResponse({ message: "success" });
    }) as unknown as typeof fetch;
    await logoutGoInstance("inst-token", deps(fetchFn), { baseUrl: "https://go.test", instanceId: "inst-uuid-9" });
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("fetchGoProfilePictureUrl posts {number, preview:false} to /user/avatar (instance token) and returns the URL", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://go.test/user/avatar");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({ apikey: "inst-token" });
      expect((init?.headers as Record<string, string>).instanceId).toBeUndefined();
      expect(JSON.parse(String(init?.body))).toEqual({ number: "5554999998888", preview: true });
      return jsonResponse({ data: { URL: "https://cdn.wa/pic.jpg", ID: "1" }, message: "success" });
    }) as unknown as typeof fetch;
    const url = await fetchGoProfilePictureUrl("inst-token", deps(fetchFn), {
      baseUrl: "https://go.test",
      instanceId: "inst-uuid-9",
    }, "5554999998888");
    expect(url).toBe("https://cdn.wa/pic.jpg");
  });

  it("fetchGoProfilePictureUrl tolerates field-casing variants (url / profilePictureURL)", async () => {
    const lower = vi.fn(async () =>
      jsonResponse({ data: { url: "https://cdn.wa/lower.jpg" } }),
    ) as unknown as typeof fetch;
    expect(
      await fetchGoProfilePictureUrl("t", deps(lower), { baseUrl: "https://go.test", instanceId: "i" }, "5511"),
    ).toBe("https://cdn.wa/lower.jpg");

    const camel = vi.fn(async () =>
      jsonResponse({ data: { profilePictureURL: "https://cdn.wa/camel.jpg" } }),
    ) as unknown as typeof fetch;
    expect(
      await fetchGoProfilePictureUrl("t", deps(camel), { baseUrl: "https://go.test", instanceId: "i" }, "5511"),
    ).toBe("https://cdn.wa/camel.jpg");
  });

  it("fetchGoProfilePictureUrl returns null on no photo, an error status, or an empty url (best-effort)", async () => {
    const noField = vi.fn(async () => jsonResponse({ data: {}, message: "ok" })) as unknown as typeof fetch;
    expect(
      await fetchGoProfilePictureUrl("t", deps(noField), { baseUrl: "https://go.test", instanceId: "i" }, "5511"),
    ).toBeNull();

    const errorStatus = vi.fn(async () => jsonResponse({ error: "not found" }, 404)) as unknown as typeof fetch;
    expect(
      await fetchGoProfilePictureUrl("t", deps(errorStatus), { baseUrl: "https://go.test", instanceId: "i" }, "5511"),
    ).toBeNull();

    const emptyUrl = vi.fn(async () => jsonResponse({ data: { URL: "" } })) as unknown as typeof fetch;
    expect(
      await fetchGoProfilePictureUrl("t", deps(emptyUrl), { baseUrl: "https://go.test", instanceId: "i" }, "5511"),
    ).toBeNull();
  });

  it("fetchGoOwnNumber GETs /instance/all (global key) and picks OUR instance's owner jid → E.164", async () => {
    // This Go build does not serve GET /instance/get/{id} (404), so the own
    // number is read from the list endpoint and matched by id — never the first.
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://go.test/instance/all");
      expect(init?.method).toBe("GET");
      expect(init?.headers).toMatchObject({ apikey: "global-key" });
      expect((init?.headers as Record<string, string>).instanceId).toBeUndefined();
      return jsonResponse({
        data: [
          { id: "other-uuid", jid: "5511888887777@s.whatsapp.net", connected: true },
          { id: "inst-uuid-9", jid: "5554999998888:12@s.whatsapp.net", connected: true },
        ],
        message: "success",
      });
    }) as unknown as typeof fetch;
    const out = await fetchGoOwnNumber("global-key", deps(fetchFn), {
      baseUrl: "https://go.test",
      instanceId: "inst-uuid-9",
    });
    expect(out).toEqual({ phoneNumber: "+5554999998888" });
  });

  it("fetchGoOwnNumber parses a jid without a device suffix and tolerates the bare-array / instances shapes", async () => {
    const withoutSuffix = vi.fn(async () =>
      jsonResponse({ data: [{ id: "i", jid: "5554999998888@s.whatsapp.net" }] }),
    ) as unknown as typeof fetch;
    expect(
      await fetchGoOwnNumber("global-key", deps(withoutSuffix), { baseUrl: "https://go.test", instanceId: "i" }),
    ).toEqual({ phoneNumber: "+5554999998888" });

    const bareArray = vi.fn(async () =>
      jsonResponse([{ id: "i", jid: "5511999990000@s.whatsapp.net" }]),
    ) as unknown as typeof fetch;
    expect(
      await fetchGoOwnNumber("global-key", deps(bareArray), { baseUrl: "https://go.test", instanceId: "i" }),
    ).toEqual({ phoneNumber: "+5511999990000" });

    const instancesKey = vi.fn(async () =>
      jsonResponse({ instances: [{ id: "i", jid: "5511777778888@s.whatsapp.net" }] }),
    ) as unknown as typeof fetch;
    expect(
      await fetchGoOwnNumber("global-key", deps(instancesKey), { baseUrl: "https://go.test", instanceId: "i" }),
    ).toEqual({ phoneNumber: "+5511777778888" });
  });

  it("fetchGoOwnNumber returns an empty profile when our instance is absent from the list", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ data: [{ id: "someone-else", jid: "5511888887777@s.whatsapp.net" }] }),
    ) as unknown as typeof fetch;
    expect(
      await fetchGoOwnNumber("global-key", deps(fetchFn), { baseUrl: "https://go.test", instanceId: "inst-uuid-9" }),
    ).toEqual({ phoneNumber: undefined });
  });

  it("fetchGoOwnNumber returns an empty profile when the matched jid is empty (not yet paired)", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ data: [{ id: "i", jid: "", connected: false }] }),
    ) as unknown as typeof fetch;
    expect(
      await fetchGoOwnNumber("global-key", deps(fetchFn), { baseUrl: "https://go.test", instanceId: "i" }),
    ).toEqual({ phoneNumber: undefined });
  });

  it("fetchGoOwnNumber is best-effort: a non-2xx status resolves to an empty profile", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ error: "boom" }, 500),
    ) as unknown as typeof fetch;
    expect(
      await fetchGoOwnNumber("global-key", deps(fetchFn), { baseUrl: "https://go.test", instanceId: "i" }),
    ).toEqual({});
  });
});
