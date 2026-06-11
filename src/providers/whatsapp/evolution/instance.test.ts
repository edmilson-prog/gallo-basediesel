import { describe, expect, it } from "vitest";
import { WhatsAppProviderError } from "../errors";
import type { IEngineDeps } from "../types";
import {
  fetchInstanceProfile,
  getConnectionState,
  getInstanceQr,
  logoutInstance,
  restartInstance,
  setInstanceWebhook,
} from "./instance";

interface IRecordedCall {
  url: string;
  init: RequestInit;
}

/** Engine deps with a stubbed fetch returning a fixed JSON response. */
function makeDeps(
  status: number,
  body: unknown,
): { deps: IEngineDeps; calls: IRecordedCall[] } {
  const calls: IRecordedCall[] = [];
  const deps: IEngineDeps = {
    resolveSecret: async () => undefined,
    fetchFn: (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify(body), { status });
    }) as typeof fetch,
  };
  return { deps, calls };
}

const TARGET = { baseUrl: "https://evo.test", instanceName: "inst1" };

describe("getInstanceQr", () => {
  it("returns the QR from a v2 top-level base64", async () => {
    const { deps, calls } = makeDeps(200, {
      pairingCode: "ABCD-1234",
      code: "2@abc",
      base64: "data:image/png;base64,QR==",
    });
    const result = await getInstanceQr("key", deps, TARGET);
    expect(result).toEqual({
      state: "qr",
      qrBase64: "data:image/png;base64,QR==",
      pairingCode: "ABCD-1234",
    });
    expect(calls[0].url).toBe("https://evo.test/instance/connect/inst1");
    expect(calls[0].init.method).toBe("GET");
  });

  it("returns the QR from a nested qrcode.base64 (v1 compat)", async () => {
    const { deps } = makeDeps(200, { qrcode: { base64: "data:image/png;base64,QR2==" } });
    const result = await getInstanceQr("key", deps, TARGET);
    expect(result.state).toBe("qr");
    expect(result.qrBase64).toBe("data:image/png;base64,QR2==");
  });

  it("returns state open when the instance is already connected", async () => {
    const { deps } = makeDeps(200, { instance: { state: "open" } });
    const result = await getInstanceQr("key", deps, TARGET);
    expect(result).toEqual({ state: "open" });
  });

  it("throws INTEGRATION_ERROR when there is no QR and no open state", async () => {
    const { deps } = makeDeps(200, { something: "else" });
    await expect(getInstanceQr("key", deps, TARGET)).rejects.toMatchObject({
      code: "INTEGRATION_ERROR",
    });
  });

  it("never logs the QR payload (omitted from the integration log)", async () => {
    const entries: unknown[] = [];
    const deps: IEngineDeps = {
      resolveSecret: async () => undefined,
      logIntegration: (entry) => {
        entries.push(entry.responsePayload);
      },
      fetchFn: (async () =>
        new Response(JSON.stringify({ base64: "data:image/png;base64,QR==", code: "2@abc" }), {
          status: 200,
        })) as typeof fetch,
    };
    await getInstanceQr("key", deps, TARGET);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toBe("[omitted]");
  });

  it("maps 401 to UNAUTHORIZED via mapEvolutionError", async () => {
    const { deps } = makeDeps(401, { message: "invalid apikey" });
    await expect(getInstanceQr("key", deps, TARGET)).rejects.toBeInstanceOf(
      WhatsAppProviderError,
    );
    await expect(getInstanceQr("key", deps, TARGET)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("getConnectionState", () => {
  it("parses the nested v2 shape", async () => {
    const { deps, calls } = makeDeps(200, { instance: { state: "connecting" } });
    const result = await getConnectionState("key", deps, TARGET);
    expect(result.state).toBe("connecting");
    expect(calls[0].url).toBe("https://evo.test/instance/connectionState/inst1");
  });

  it("parses the flat shape and falls back to unknown", async () => {
    const flat = makeDeps(200, { state: "open" });
    expect((await getConnectionState("key", flat.deps, TARGET)).state).toBe("open");
    const weird = makeDeps(200, { state: "weird" });
    expect((await getConnectionState("key", weird.deps, TARGET)).state).toBe("unknown");
  });
});

describe("fetchInstanceProfile", () => {
  it("extracts phone and profile name from the v2 array shape", async () => {
    const { deps } = makeDeps(200, [
      { name: "other", ownerJid: "5511888887777@s.whatsapp.net" },
      { name: "inst1", ownerJid: "5555999887766@s.whatsapp.net", profileName: "Gallo Peças" },
    ]);
    const result = await fetchInstanceProfile("key", deps, TARGET);
    expect(result.profileName).toBe("Gallo Peças");
    expect(result.phoneNumber).toBe("+5555999887766");
  });

  it("extracts from the v1 nested shape", async () => {
    const { deps } = makeDeps(200, [
      { instance: { instanceName: "inst1", owner: "5555911112222@s.whatsapp.net", profileName: "Loja" } },
    ]);
    const result = await fetchInstanceProfile("key", deps, TARGET);
    expect(result.phoneNumber).toBe("+5555911112222");
    expect(result.profileName).toBe("Loja");
  });

  it("strips the device suffix from the owner jid", async () => {
    const { deps } = makeDeps(200, [
      { name: "inst1", ownerJid: "5555999887766:12@s.whatsapp.net" },
    ]);
    const result = await fetchInstanceProfile("key", deps, TARGET);
    expect(result.phoneNumber).toBe("+5555999887766");
  });

  it("returns an empty profile when the instance is not in the list", async () => {
    const { deps } = makeDeps(200, [{ name: "other" }]);
    expect(await fetchInstanceProfile("key", deps, TARGET)).toEqual({});
  });
});

describe("logout / restart / webhook", () => {
  it("logoutInstance issues DELETE on the logout path", async () => {
    const { deps, calls } = makeDeps(200, { status: "SUCCESS" });
    await logoutInstance("key", deps, TARGET);
    expect(calls[0].url).toBe("https://evo.test/instance/logout/inst1");
    expect(calls[0].init.method).toBe("DELETE");
  });

  it("restartInstance issues POST on the restart path", async () => {
    const { deps, calls } = makeDeps(200, { status: "SUCCESS" });
    await restartInstance("key", deps, TARGET);
    expect(calls[0].url).toBe("https://evo.test/instance/restart/inst1");
    expect(calls[0].init.method).toBe("POST");
  });

  it("setInstanceWebhook posts the v2 webhook payload", async () => {
    const { deps, calls } = makeDeps(200, {});
    await setInstanceWebhook("key", deps, TARGET, "https://x.supabase.co/functions/v1/whatsapp-webhook/evolution");
    expect(calls[0].url).toBe("https://evo.test/webhook/set/inst1");
    expect(calls[0].init.method).toBe("POST");
    const sent = JSON.parse(String(calls[0].init.body));
    expect(sent.webhook.enabled).toBe(true);
    expect(sent.webhook.url).toContain("/whatsapp-webhook/evolution");
    expect(sent.webhook.events).toEqual([
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE",
      "CONNECTION_UPDATE",
    ]);
  });
});
