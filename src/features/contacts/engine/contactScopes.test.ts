import { describe, expect, it } from "vitest";
import type { IContact } from "@/shared/types";
import { countScopes, matchesScope } from "./contactScopes";

function contact(patch: Partial<IContact> = {}): IContact {
  return {
    id: "ct-1",
    storeId: "st-1",
    name: "Adair Antonello",
    role: null,
    phone: "(55) 99164-0300",
    phoneDigits: "55991640300",
    email: null,
    city: null,
    uf: null,
    customerId: null,
    customerName: null,
    leadId: null,
    ownerSellerId: null,
    ownerName: null,
    tags: [],
    source: "manual",
    optOut: false,
    optOutAt: null,
    optOutBy: null,
    nextContactAt: null,
    nextContactNote: null,
    lastContactAt: null,
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

describe("matchesScope", () => {
  it("todos matches everything", () => {
    expect(matchesScope(contact(), "todos")).toBe(true);
    expect(matchesScope(contact({ optOut: true }), "todos")).toBe(true);
  });

  it("vinculados requires a customer", () => {
    expect(matchesScope(contact({ customerId: "cu-1" }), "vinculados")).toBe(true);
    expect(matchesScope(contact({ customerId: null }), "vinculados")).toBe(false);
  });

  it("soltos requires no customer", () => {
    expect(matchesScope(contact({ customerId: null }), "soltos")).toBe(true);
    expect(matchesScope(contact({ customerId: "cu-1" }), "soltos")).toBe(false);
  });

  it("optout keys off the flag, independent of the link", () => {
    expect(matchesScope(contact({ optOut: true, customerId: "cu-1" }), "optout")).toBe(true);
    expect(matchesScope(contact({ optOut: false }), "optout")).toBe(false);
  });

  it("ignorados returns only triaged-away contacts", () => {
    const ignored = contact({ ignoredAt: "2026-08-14T10:00:00.000Z", ignoreReason: "Fornecedor" });
    expect(matchesScope(ignored, "ignorados")).toBe(true);
    expect(matchesScope(contact(), "ignorados")).toBe(false);
  });

  it("keeps an ignored contact out of every other scope", () => {
    // The regression this guards: `todos` used to fall through a `default`
    // that returned true, so a triaged-away contact would come straight back
    // into the Agenda.
    const ignored = contact({
      ignoredAt: "2026-08-14T10:00:00.000Z",
      customerId: "cu-1",
      optOut: true,
    });
    expect(matchesScope(ignored, "todos")).toBe(false);
    expect(matchesScope(ignored, "vinculados")).toBe(false);
    expect(matchesScope(ignored, "optout")).toBe(false);
    expect(matchesScope(contact({ ignoredAt: "2026-08-14T10:00:00.000Z" }), "soltos")).toBe(false);
  });
});

describe("countScopes", () => {
  it("counts each scope, and opt-out overlaps the others", () => {
    const rows = [
      contact({ id: "a", customerId: "cu-1" }),
      contact({ id: "b", customerId: "cu-2", optOut: true }),
      contact({ id: "c", customerId: null }),
      contact({ id: "d", customerId: null, optOut: true }),
    ];

    expect(countScopes(rows)).toEqual({
      todos: 4,
      vinculados: 2,
      soltos: 2,
      // opt-out is transversal: one linked + one loose
      optout: 2,
    });
  });

  it("leaves ignored contacts out of every count", () => {
    const rows = [
      contact({ id: "a", customerId: "cu-1" }),
      contact({ id: "b", customerId: null, ignoredAt: "2026-08-14T10:00:00.000Z" }),
      contact({ id: "c", customerId: "cu-2", optOut: true, ignoredAt: "2026-08-14T10:00:00.000Z" }),
    ];

    expect(countScopes(rows)).toEqual({ todos: 1, vinculados: 1, soltos: 0, optout: 0 });
  });

  it("returns zeros for an empty list", () => {
    expect(countScopes([])).toEqual({ todos: 0, vinculados: 0, soltos: 0, optout: 0 });
  });
});
