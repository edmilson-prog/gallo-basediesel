import { describe, expect, it } from "vitest";
import type { IContact } from "@/shared/types";
import { applyContactFilters, matchesSearch, type IContactFilterState } from "./contactFilters";

function contact(patch: Partial<IContact> = {}): IContact {
  return {
    id: "ct-1",
    storeId: "st-1",
    name: "Marlene Kuhn",
    role: "Compras",
    phone: "(55) 99712-4488",
    phoneDigits: "55997124488",
    email: "compras@fronteiraoeste.com.br",
    city: "Palmitinho",
    uf: "RS",
    customerId: "cu-1",
    customerName: "Transportes Fronteira Oeste",
    leadId: null,
    ownerSellerId: "sl-1",
    ownerName: "Thiago Oliveira",
    tags: ["Compras", "B2B"],
    source: "dintec",
    optOut: false,
    optOutAt: null,
    optOutBy: null,
    nextContactAt: null,
    nextContactNote: null,
    lastContactAt: "2026-08-05T19:40:00.000Z",
    hasWhatsapp: true,
    ignoredAt: null,
    ignoreReason: null,
    ignoredBy: null,
    division: "parts",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

const EMPTY: IContactFilterState = {
  scope: "todos",
  search: "",
  owners: [],
  tags: [],
  city: null,
  sources: [],
};

describe("matchesSearch", () => {
  it("is case and accent tolerant on the name", () => {
    expect(matchesSearch(contact(), "marlene")).toBe(true);
    expect(matchesSearch(contact({ name: "Cláudio Périco" }), "claudio")).toBe(true);
  });

  it("matches the company, role and city", () => {
    expect(matchesSearch(contact(), "fronteira")).toBe(true);
    expect(matchesSearch(contact(), "compras")).toBe(true);
    expect(matchesSearch(contact(), "palmitinho")).toBe(true);
  });

  it("matches the e-mail", () => {
    expect(matchesSearch(contact(), "fronteiraoeste.com")).toBe(true);
  });

  it("matches the formatted phone", () => {
    expect(matchesSearch(contact(), "99712-4488")).toBe(true);
  });

  it("matches digits typed without formatting", () => {
    expect(matchesSearch(contact(), "5599712")).toBe(true);
    expect(matchesSearch(contact(), "997124488")).toBe(true);
  });

  it("does not match an unrelated term", () => {
    expect(matchesSearch(contact(), "scania")).toBe(false);
  });

  it("treats an empty term as a match", () => {
    expect(matchesSearch(contact(), "   ")).toBe(true);
  });
});

describe("applyContactFilters", () => {
  const rows = [
    contact({ id: "a", ownerSellerId: "sl-1", tags: ["Compras"], source: "dintec" }),
    contact({
      id: "b",
      ownerSellerId: "sl-2",
      tags: ["Frota"],
      source: "whatsapp",
      customerId: null,
      customerName: null,
    }),
    contact({ id: "c", ownerSellerId: null, tags: [], source: "csv", optOut: true }),
  ];

  it("returns everything when nothing is set", () => {
    expect(applyContactFilters(rows, EMPTY).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("filters by scope", () => {
    expect(applyContactFilters(rows, { ...EMPTY, scope: "soltos" }).map((r) => r.id)).toEqual([
      "b",
    ]);
    expect(applyContactFilters(rows, { ...EMPTY, scope: "optout" }).map((r) => r.id)).toEqual([
      "c",
    ]);
  });

  it("filters by owner, including the unassigned bucket", () => {
    expect(applyContactFilters(rows, { ...EMPTY, owners: ["sl-1"] }).map((r) => r.id)).toEqual([
      "a",
    ]);
    expect(applyContactFilters(rows, { ...EMPTY, owners: ["__none__"] }).map((r) => r.id)).toEqual([
      "c",
    ]);
  });

  it("filters by tag and by source", () => {
    expect(applyContactFilters(rows, { ...EMPTY, tags: ["Frota"] }).map((r) => r.id)).toEqual([
      "b",
    ]);
    expect(applyContactFilters(rows, { ...EMPTY, sources: ["csv"] }).map((r) => r.id)).toEqual([
      "c",
    ]);
  });

  it("combines filters with AND", () => {
    const result = applyContactFilters(rows, {
      ...EMPTY,
      scope: "vinculados",
      sources: ["dintec"],
    });
    expect(result.map((r) => r.id)).toEqual(["a"]);
  });
});
