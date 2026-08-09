import { describe, expect, it } from "vitest";
import { contactPatchToRow } from "./contacts";

describe("contactPatchToRow", () => {
  it("always stamps updated_at", () => {
    expect(contactPatchToRow({})).toEqual({ updated_at: expect.any(String) });
  });

  it("maps camelCase fields to snake_case columns", () => {
    expect(
      contactPatchToRow({ name: "Maria", role: "Compras", city: "Erechim", uf: "RS" }),
    ).toEqual({
      updated_at: expect.any(String),
      name: "Maria",
      role: "Compras",
      city: "Erechim",
      uf: "RS",
    });
  });

  it("never writes phone_digits even if the patch includes it", () => {
    const row = contactPatchToRow({ phone: "5511999998888", phoneDigits: "5511999998888" });
    expect(row).not.toHaveProperty("phone_digits");
    expect(row).toEqual({ updated_at: expect.any(String), phone: "5511999998888" });
  });

  it("clears a nullable field when the patch sets it to null explicitly", () => {
    expect(contactPatchToRow({ role: null, ownerSellerId: null })).toEqual({
      updated_at: expect.any(String),
      role: null,
      owner_seller_id: null,
    });
  });

  it("omits a field entirely when the key is absent", () => {
    expect(contactPatchToRow({ tags: ["Frota"] })).toEqual({
      updated_at: expect.any(String),
      tags: ["Frota"],
    });
  });

  it("never writes id/storeId/createdAt (immutable, not part of the patch shape)", () => {
    const row = contactPatchToRow({ name: "Novo nome" });
    expect(row).not.toHaveProperty("id");
    expect(row).not.toHaveProperty("store_id");
    expect(row).not.toHaveProperty("created_at");
  });
});
