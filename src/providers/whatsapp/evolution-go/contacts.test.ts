import { describe, expect, it, vi } from "vitest";
import { fetchGoContacts } from "./contacts";
import type { IEngineDeps } from "../types";

function deps(fetchImpl: typeof fetch): IEngineDeps {
  return { resolveSecret: async () => undefined, fetchFn: fetchImpl };
}
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("evolution-go contacts", () => {
  it("GETs /user/contacts with the instance token and maps individual contacts to {phone,name}", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://go.test/user/contacts");
      expect(init?.method).toBe("GET");
      expect(init?.headers).toMatchObject({ apikey: "inst-token" });
      expect((init?.headers as Record<string, string>).instanceId).toBeUndefined();
      return jsonResponse({
        data: [
          { Jid: "5554999998888@s.whatsapp.net", Found: true, FullName: "Maria Volvo", PushName: "Mary" },
          { Jid: "5511888887777@s.whatsapp.net", Found: true, PushName: "Joao" },
        ],
        message: "success",
      });
    }) as unknown as typeof fetch;

    const out = await fetchGoContacts("inst-token", deps(fetchFn), {
      baseUrl: "https://go.test",
      instanceId: "i",
    });
    expect(out).toEqual([
      { phone: "+5554999998888", name: "Maria Volvo" }, // FullName wins over PushName
      { phone: "+5511888887777", name: "Joao" },
    ]);
  });

  it("skips groups/broadcasts/newsletters/@lid and dedups by phone; strips the device suffix", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({
        data: [
          { Jid: "120363@g.us", FullName: "Grupo" },
          { Jid: "5511@broadcast", FullName: "Lista" },
          { Jid: "5511@newsletter", FullName: "Canal" },
          { Jid: "99999@lid", FullName: "Privado" },
          { Jid: "5554999998888:3@s.whatsapp.net", PushName: "Dispositivo" },
          { Jid: "5554999998888@s.whatsapp.net", PushName: "Duplicado" }, // same phone → deduped
        ],
      }),
    ) as unknown as typeof fetch;

    const out = await fetchGoContacts("t", deps(fetchFn), { baseUrl: "https://go.test", instanceId: "i" });
    expect(out).toEqual([{ phone: "+5554999998888", name: "Dispositivo" }]);
  });

  it("returns name=undefined when no usable name, and tolerates the map shape + lowercase keys", async () => {
    const arrayNoName = vi.fn(async () =>
      jsonResponse({ data: [{ Jid: "5511999990000@s.whatsapp.net", FullName: "   " }] }),
    ) as unknown as typeof fetch;
    expect(
      await fetchGoContacts("t", deps(arrayNoName), { baseUrl: "https://go.test", instanceId: "i" }),
    ).toEqual([{ phone: "+5511999990000", name: undefined }]);

    // whatsmeow's native type is a map (jid → ContactInfo); some builds serialize
    // it as an object instead of an array. Tolerate it, with lowercase field casing.
    const mapShape = vi.fn(async () =>
      jsonResponse({ data: { "5511777778888@s.whatsapp.net": { found: true, pushName: "Ana" } } }),
    ) as unknown as typeof fetch;
    expect(
      await fetchGoContacts("t", deps(mapShape), { baseUrl: "https://go.test", instanceId: "i" }),
    ).toEqual([{ phone: "+5511777778888", name: "Ana" }]);
  });

  it("is best-effort: a non-2xx status or an empty body resolves to []", async () => {
    const err = vi.fn(async () => jsonResponse({ error: "boom" }, 500)) as unknown as typeof fetch;
    expect(await fetchGoContacts("t", deps(err), { baseUrl: "https://go.test", instanceId: "i" })).toEqual([]);

    const empty = vi.fn(async () => jsonResponse({ message: "success" })) as unknown as typeof fetch;
    expect(await fetchGoContacts("t", deps(empty), { baseUrl: "https://go.test", instanceId: "i" })).toEqual([]);
  });
});
