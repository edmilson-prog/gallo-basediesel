import { describe, expect, it } from "vitest";
import { WhatsAppProviderError } from "../errors";
import type { IEngineDeps } from "../types";
import {
  createInstance,
  fetchInstanceProfile,
  findChats,
  findContacts,
  findContactsFromChats,
  findMessages,
  getConnectionState,
  getInstanceQr,
  logoutInstance,
  parseWhatsAppNumbers,
  restartInstance,
  setInstanceWebhook,
} from "./instance";

interface IRecordedCall {
  url: string;
  init: RequestInit;
}

/** Engine deps with a stubbed fetch returning a fixed JSON response. */
function makeDeps(status: number, body: unknown): { deps: IEngineDeps; calls: IRecordedCall[] } {
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
    expect(calls[0]!.url).toBe("https://evo.test/instance/connect/inst1");
    expect(calls[0]!.init.method).toBe("GET");
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
    await expect(getInstanceQr("key", deps, TARGET)).rejects.toBeInstanceOf(WhatsAppProviderError);
    await expect(getInstanceQr("key", deps, TARGET)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("createInstance", () => {
  it("posts the create payload with syncFullHistory on a fresh instance", async () => {
    const { deps, calls } = makeDeps(201, { instance: { instanceName: "inst1" } });
    await createInstance("key", deps, TARGET);
    expect(calls[0]!.url).toBe("https://evo.test/instance/create");
    expect(calls[0]!.init.method).toBe("POST");
    const sent = JSON.parse(String(calls[0]!.init.body));
    expect(sent.instanceName).toBe("inst1");
    expect(sent.syncFullHistory).toBe(true);
  });

  it("is idempotent: a 403 'already in use' resolves as success (re-pair flow)", async () => {
    // Evolution returns 403 Forbidden when the instance already exists. The
    // QR flow re-runs create on every pairing, so this MUST be a no-op — the
    // bug was it re-threw as UNAUTHORIZED ("chave de API recusada").
    const { deps } = makeDeps(403, {
      error: "Forbidden",
      status: 403,
      response: { message: ['This name "inst1" is already in use.'] },
    });
    await expect(createInstance("key", deps, TARGET)).resolves.toBeUndefined();
  });

  it("propagates a genuine 401 (bad apikey) instead of swallowing it", async () => {
    const { deps } = makeDeps(401, { message: "invalid apikey" });
    await expect(createInstance("key", deps, TARGET)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("getConnectionState", () => {
  it("parses the nested v2 shape", async () => {
    const { deps, calls } = makeDeps(200, { instance: { state: "connecting" } });
    const result = await getConnectionState("key", deps, TARGET);
    expect(result.state).toBe("connecting");
    expect(calls[0]!.url).toBe("https://evo.test/instance/connectionState/inst1");
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
      {
        instance: {
          instanceName: "inst1",
          owner: "5555911112222@s.whatsapp.net",
          profileName: "Loja",
        },
      },
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
    expect(calls[0]!.url).toBe("https://evo.test/instance/logout/inst1");
    expect(calls[0]!.init.method).toBe("DELETE");
  });

  it("restartInstance issues POST on the restart path", async () => {
    const { deps, calls } = makeDeps(200, { status: "SUCCESS" });
    await restartInstance("key", deps, TARGET);
    expect(calls[0]!.url).toBe("https://evo.test/instance/restart/inst1");
    expect(calls[0]!.init.method).toBe("POST");
  });

  it("setInstanceWebhook posts the v2 webhook payload", async () => {
    const { deps, calls } = makeDeps(200, {});
    await setInstanceWebhook(
      "key",
      deps,
      TARGET,
      "https://x.supabase.co/functions/v1/whatsapp-webhook/evolution",
    );
    expect(calls[0]!.url).toBe("https://evo.test/webhook/set/inst1");
    expect(calls[0]!.init.method).toBe("POST");
    const sent = JSON.parse(String(calls[0]!.init.body));
    expect(sent.webhook.enabled).toBe(true);
    expect(sent.webhook.url).toContain("/whatsapp-webhook/evolution");
    expect(sent.webhook.events).toEqual([
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE",
      "CONNECTION_UPDATE",
    ]);
  });
});

describe("findChats", () => {
  it("parses the flat v2 array and keeps only jid-like entries", async () => {
    const { deps, calls } = makeDeps(200, [
      { remoteJid: "5555988887777@s.whatsapp.net" },
      { remoteJid: "1203630@g.us" },
      { id: "not-a-jid-uuid" },
    ]);
    const chats = await findChats("key", deps, TARGET);
    expect(chats.map((c) => c.remoteJid)).toEqual(["5555988887777@s.whatsapp.net", "1203630@g.us"]);
    expect(calls[0]!.url).toBe("https://evo.test/chat/findChats/inst1");
    expect(calls[0]!.init.method).toBe("POST");
  });

  it("parses nested {chats:[...]} shapes", async () => {
    const { deps } = makeDeps(200, { chats: [{ remoteJid: "5511911112222@s.whatsapp.net" }] });
    const chats = await findChats("key", deps, TARGET);
    expect(chats).toEqual([{ remoteJid: "5511911112222@s.whatsapp.net" }]);
  });

  it("parses nested {records:[...]} shapes", async () => {
    const { deps } = makeDeps(200, { records: [{ remoteJid: "5511922223333@s.whatsapp.net" }] });
    const chats = await findChats("key", deps, TARGET);
    expect(chats).toEqual([{ remoteJid: "5511922223333@s.whatsapp.net" }]);
  });

  it("captures the chat's pushName/name when present", async () => {
    const { deps } = makeDeps(200, [
      { remoteJid: "5555988887777@s.whatsapp.net", pushName: "Cliente A" },
      { id: "5511911112222@s.whatsapp.net", name: "Cliente B" },
      { remoteJid: "5511933334444@s.whatsapp.net" },
    ]);
    const chats = await findChats("key", deps, TARGET);
    expect(chats).toEqual([
      { remoteJid: "5555988887777@s.whatsapp.net", name: "Cliente A" },
      { remoteJid: "5511911112222@s.whatsapp.net", name: "Cliente B" },
      { remoteJid: "5511933334444@s.whatsapp.net", name: undefined },
    ]);
  });

  it("logs a diagnostic entry when the response shape is unrecognised", async () => {
    const errors: (string | undefined)[] = [];
    const deps: IEngineDeps = {
      resolveSecret: async () => undefined,
      logIntegration: (entry) => {
        errors.push(entry.errorMessage);
      },
      fetchFn: (async () =>
        new Response(JSON.stringify({ foo: 1, bar: 2 }), { status: 200 })) as typeof fetch,
    };
    const chats = await findChats("key", deps, TARGET);
    expect(chats).toEqual([]);
    expect(errors.some((m) => m?.includes("unrecognised response shape"))).toBe(true);
    expect(errors.some((m) => m?.includes("foo, bar"))).toBe(true);
  });
});

describe("findMessages", () => {
  it("parses the nested v2 page shape", async () => {
    const { deps, calls } = makeDeps(200, {
      messages: {
        total: 2,
        pages: 1,
        currentPage: 1,
        records: [
          {
            key: { id: "M1", remoteJid: "5555988887777@s.whatsapp.net", fromMe: false },
            message: { conversation: "oi" },
            messageTimestamp: 1765400000,
            status: "READ",
          },
        ],
      },
    });
    const page = await findMessages("key", deps, TARGET, "5555988887777@s.whatsapp.net", 1);
    expect(page.pages).toBe(1);
    expect(page.records[0]).toMatchObject({ key: { id: "M1" } });
    expect(calls[0]!.url).toBe("https://evo.test/chat/findMessages/inst1");
    expect(calls[0]!.init.method).toBe("POST");
  });

  it("accepts a bare array response (older builds)", async () => {
    const { deps } = makeDeps(200, [{ key: { id: "M2" }, message: { conversation: "x" } }]);
    const page = await findMessages("key", deps, TARGET, "jid", 1);
    expect(page.records).toHaveLength(1);
    expect(page.pages).toBeUndefined();
  });
});

describe("findContacts", () => {
  it("pairs individual contacts with their name and drops groups/non-jids", async () => {
    const { deps, calls } = makeDeps(200, [
      { id: "5549999998888@s.whatsapp.net", pushName: "João Silva" },
      { remoteJid: "120363000@g.us", pushName: "Grupo X" },
      { id: "5511888887777@s.whatsapp.net", name: "Maria (agenda)" },
      { id: "not-a-jid" },
    ]);
    const contacts = await findContacts("key", deps, TARGET);
    expect(contacts).toEqual([
      { phone: "+5549999998888", name: "João Silva" },
      { phone: "+5511888887777", name: "Maria (agenda)" },
    ]);
    expect(calls[0]!.url).toBe("https://evo.test/chat/findContacts/inst1");
    expect(calls[0]!.init.method).toBe("POST");
  });

  it("parses nested {contacts:[...]} and {records:[...]} shapes", async () => {
    const nested = makeDeps(200, {
      contacts: [{ id: "5511911112222@s.whatsapp.net", pushName: "Ana" }],
    });
    expect(await findContacts("key", nested.deps, TARGET)).toEqual([
      { phone: "+5511911112222", name: "Ana" },
    ]);
    const records = makeDeps(200, { records: [{ id: "5511922223333@s.whatsapp.net" }] });
    expect(await findContacts("key", records.deps, TARGET)).toEqual([
      { phone: "+5511922223333", name: undefined },
    ]);
  });

  it("strips the device suffix and skips @lid jids", async () => {
    const { deps } = makeDeps(200, [
      { id: "5549999998888:12@s.whatsapp.net", pushName: "Zé" },
      { id: "99999999@lid", pushName: "Oculto" },
    ]);
    expect(await findContacts("key", deps, TARGET)).toEqual([{ phone: "+5549999998888", name: "Zé" }]);
  });

  it("logs a diagnostic entry on an unrecognised response shape", async () => {
    const errors: (string | undefined)[] = [];
    const deps: IEngineDeps = {
      resolveSecret: async () => undefined,
      logIntegration: (entry) => {
        errors.push(entry.errorMessage);
      },
      fetchFn: (async () =>
        new Response(JSON.stringify({ foo: 1 }), { status: 200 })) as typeof fetch,
    };
    expect(await findContacts("key", deps, TARGET)).toEqual([]);
    expect(errors.some((m) => m?.includes("unrecognised response shape"))).toBe(true);
  });
});

describe("findContactsFromChats", () => {
  it("derives named contacts from individual chats, dropping groups", async () => {
    const { deps, calls } = makeDeps(200, [
      { remoteJid: "5549999998888@s.whatsapp.net", pushName: "João Silva" },
      { remoteJid: "120363000@g.us", pushName: "Grupo X" },
      { remoteJid: "5511888887777:9@s.whatsapp.net", name: "Maria" },
      { remoteJid: "5511933334444@s.whatsapp.net" },
    ]);
    const contacts = await findContactsFromChats("key", deps, TARGET);
    expect(contacts).toEqual([
      { phone: "+5549999998888", name: "João Silva" },
      { phone: "+5511888887777", name: "Maria" },
      { phone: "+5511933334444", name: undefined },
    ]);
    expect(calls[0]!.url).toBe("https://evo.test/chat/findChats/inst1");
  });
});

describe("parseWhatsAppNumbers", () => {
  it("maps a flat array of OnWhatsAppDto, reading the jid as canonical", () => {
    const body = [
      { jid: "5554999998888@s.whatsapp.net", exists: true, number: "5554999998888" },
      { jid: "5511000000000@s.whatsapp.net", exists: false, number: "5511000000000" },
    ];
    expect(parseWhatsAppNumbers(body)).toEqual([
      { input: "5554999998888", exists: true, e164: "+5554999998888" },
      { input: "5511000000000", exists: false, e164: undefined },
    ]);
  });
  it("unwraps the nested { onWhatsapp: [...] } shape", () => {
    const body = { onWhatsapp: [{ jid: "5599@s.whatsapp.net", exists: true, number: "5599" }] };
    expect(parseWhatsAppNumbers(body)[0].exists).toBe(true);
  });
  it("treats a missing `exists` as false", () => {
    expect(parseWhatsAppNumbers([{ number: "5599" }])).toEqual([
      { input: "5599", exists: false, e164: undefined },
    ]);
  });
  it("returns [] for an unrecognised shape", () => {
    expect(parseWhatsAppNumbers({ unexpected: true })).toEqual([]);
  });
});
