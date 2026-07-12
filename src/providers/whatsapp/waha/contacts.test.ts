import { describe, expect, it, vi } from "vitest";
import { getWahaContactName, resolveWahaLid } from "./contacts";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const target = { baseUrl: "https://waha.example.com", sessionName: "loja-abc123" };

describe("resolveWahaLid", () => {
  it("GETs /api/{session}/lids/{digits} and converts pn to E.164", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { lid: "67186324430852@lid", pn: "5548999887766@c.us" }),
      );
    const result = await resolveWahaLid("key", fetchFn, { ...target, lid: "67186324430852@lid" });
    expect(fetchFn.mock.calls[0][0]).toBe(
      "https://waha.example.com/api/loja-abc123/lids/67186324430852",
    );
    expect(fetchFn.mock.calls[0][1].method).toBe("GET");
    expect(result.phone).toBe("+5548999887766");
  });

  it("accepts bare digits as the lid input", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { lid: "111@lid", pn: "5511988887777@c.us" }));
    const result = await resolveWahaLid("key", fetchFn, { ...target, lid: "111" });
    expect(fetchFn.mock.calls[0][0]).toBe("https://waha.example.com/api/loja-abc123/lids/111");
    expect(result.phone).toBe("+5511988887777");
  });

  it("returns undefined phone on 404 (unknown lid)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(404, { message: "Not found" }));
    const result = await resolveWahaLid("key", fetchFn, { ...target, lid: "999@lid" });
    expect(result.phone).toBeUndefined();
  });

  it("returns undefined phone when pn is missing/empty", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { lid: "999@lid", pn: "" }));
    const result = await resolveWahaLid("key", fetchFn, { ...target, lid: "999@lid" });
    expect(result.phone).toBeUndefined();
  });

  it("returns undefined phone for an empty-digit lid without calling the server", async () => {
    const fetchFn = vi.fn();
    const result = await resolveWahaLid("key", fetchFn, { ...target, lid: "@lid" });
    expect(result.phone).toBeUndefined();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("propagates auth errors (401)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(401, { message: "Unauthorized" }));
    await expect(resolveWahaLid("bad", fetchFn, { ...target, lid: "1@lid" })).rejects.toThrow(
      "Chave da API WAHA inválida ou ausente",
    );
  });
});

describe("getWahaContactName", () => {
  it("GETs /api/contacts with encoded contactId + session and returns pushname", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { id: "1@lid", pushname: "Zé Peças", name: null }));
    const name = await getWahaContactName("key", fetchFn, { ...target, contactId: "1@lid" });
    expect(fetchFn.mock.calls[0][0]).toBe(
      "https://waha.example.com/api/contacts?contactId=1%40lid&session=loja-abc123",
    );
    expect(name).toBe("Zé Peças");
  });

  it("falls back pushname → name → shortName and trims", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { pushname: "  ", name: " Maria Diesel ", shortName: "M" }),
      );
    const name = await getWahaContactName("key", fetchFn, { ...target, contactId: "2@c.us" });
    expect(name).toBe("Maria Diesel");
  });

  it("returns undefined when no name fields are present", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "3@c.us" }));
    const name = await getWahaContactName("key", fetchFn, { ...target, contactId: "3@c.us" });
    expect(name).toBeUndefined();
  });

  it("returns undefined on ANY error (never throws)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(401, { message: "Unauthorized" }));
    const name = await getWahaContactName("bad", fetchFn, { ...target, contactId: "4@c.us" });
    expect(name).toBeUndefined();
  });
});
