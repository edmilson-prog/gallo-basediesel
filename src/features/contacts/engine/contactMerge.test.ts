import { describe, expect, it } from "vitest";
import type { IContact } from "@/shared/types";
import { buildMergePatch, mergeIgnoreReason } from "./contactMerge";

function contact(patch: Partial<IContact> = {}): IContact {
  return {
    id: "ct-1",
    storeId: "st-1",
    name: "Gilmar Kroth",
    role: null,
    phone: null,
    phoneDigits: null,
    email: null,
    city: null,
    uf: null,
    customerId: null,
    customerName: null,
    leadId: null,
    ownerSellerId: null,
    ownerName: null,
    tags: [],
    source: "whatsapp",
    optOut: false,
    optOutAt: null,
    optOutBy: null,
    nextContactAt: null,
    nextContactNote: null,
    lastContactAt: null,
    hasWhatsapp: false,
    ignoredAt: null,
    ignoreReason: null,
    ignoredBy: null,
    division: "parts",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

describe("buildMergePatch", () => {
  it("fills only what the primary is missing", () => {
    const patch = buildMergePatch(
      contact({ phone: "(55) 99648-2210" }),
      contact({
        id: "dup",
        phone: "(55) 9648-2210",
        email: "gilmar@kroth.com.br",
        city: "Palmitinho",
      }),
    );

    expect(patch).toEqual({ email: "gilmar@kroth.com.br", city: "Palmitinho" });
    // The primary's own phone survives untouched.
    expect(patch.phone).toBeUndefined();
  });

  it("never overwrites a filled field with the duplicate's value", () => {
    const patch = buildMergePatch(
      contact({ name: "Gilmar Kroth", role: "Proprietário", email: "novo@kroth.com.br" }),
      contact({ id: "dup", name: "Gilmar K.", role: "Sócio", email: "antigo@kroth.com.br" }),
    );

    expect(patch).toEqual({});
  });

  it("treats whitespace as missing", () => {
    const patch = buildMergePatch(
      contact({ role: "   " }),
      contact({ id: "dup", role: "Proprietário" }),
    );

    expect(patch.role).toBe("Proprietário");
  });

  it("adopts the duplicate's customer only when the primary is loose", () => {
    expect(buildMergePatch(contact(), contact({ id: "dup", customerId: "cu-1" })).customerId).toBe(
      "cu-1",
    );

    expect(
      buildMergePatch(contact({ customerId: "cu-9" }), contact({ id: "dup", customerId: "cu-1" }))
        .customerId,
    ).toBeUndefined();
  });

  it("unions the tags", () => {
    const patch = buildMergePatch(
      contact({ tags: ["Frota", "Decisor"] }),
      contact({ id: "dup", tags: ["Decisor", "B2B"] }),
    );

    expect(patch.tags).toEqual(["Frota", "Decisor", "B2B"]);
  });

  it("keeps the more recent last contact", () => {
    expect(
      buildMergePatch(
        contact({ lastContactAt: "2026-01-01T00:00:00.000Z" }),
        contact({ id: "dup", lastContactAt: "2026-08-01T00:00:00.000Z" }),
      ).lastContactAt,
    ).toBe("2026-08-01T00:00:00.000Z");

    expect(
      buildMergePatch(
        contact({ lastContactAt: "2026-08-01T00:00:00.000Z" }),
        contact({ id: "dup", lastContactAt: "2026-01-01T00:00:00.000Z" }),
      ).lastContactAt,
    ).toBeUndefined();
  });

  it("promotes the WhatsApp flag but never clears it", () => {
    expect(
      buildMergePatch(contact({ hasWhatsapp: false }), contact({ id: "dup", hasWhatsapp: true }))
        .hasWhatsapp,
    ).toBe(true);

    expect(
      buildMergePatch(contact({ hasWhatsapp: true }), contact({ id: "dup", hasWhatsapp: false }))
        .hasWhatsapp,
    ).toBeUndefined();
  });

  it("returns an empty patch when the duplicate adds nothing", () => {
    expect(buildMergePatch(contact(), contact({ id: "dup" }))).toEqual({});
  });
});

describe("mergeIgnoreReason", () => {
  it("names the survivor so the decision stays readable", () => {
    expect(mergeIgnoreReason("Gilmar Kroth")).toBe("Mesclado em “Gilmar Kroth”");
  });
});
