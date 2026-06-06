import { describe, expect, it } from "vitest";
import type { IAssetLibraryItem } from "@/shared/types";
import { isSensitiveAsset, canSendSensitiveAsset } from "./assetSensitivity";

function asset(over: Partial<IAssetLibraryItem>): IAssetLibraryItem {
  return {
    id: "a1",
    storeId: "store-matriz",
    division: "parts",
    title: "Catálogo Volvo",
    category: "catalogo",
    kind: "document",
    version: 1,
    status: "published",
    sensitivity: "normal",
    createdBy: "seller-1",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

describe("isSensitiveAsset", () => {
  it("treats tabela_preco as sensitive even when flagged normal", () => {
    expect(isSensitiveAsset(asset({ category: "tabela_preco", sensitivity: "normal" }))).toBe(true);
  });
  it("treats sensitivity:sensitive as sensitive regardless of category", () => {
    expect(isSensitiveAsset(asset({ category: "catalogo", sensitivity: "sensitive" }))).toBe(true);
  });
  it("treats a normal catalogo as not sensitive", () => {
    expect(isSensitiveAsset(asset({ category: "catalogo", sensitivity: "normal" }))).toBe(false);
  });
});

describe("canSendSensitiveAsset", () => {
  it("allows Owner", () => {
    expect(canSendSensitiveAsset({ role: "Owner" })).toBe(true);
  });
  it("allows Gestor", () => {
    expect(canSendSensitiveAsset({ role: "Gestor" })).toBe(true);
  });
  it("blocks Vendedor", () => {
    expect(canSendSensitiveAsset({ role: "Vendedor" })).toBe(false);
  });
  it("blocks SDR", () => {
    expect(canSendSensitiveAsset({ role: "SDR" })).toBe(false);
  });
  it("blocks anonymous (null/undefined)", () => {
    expect(canSendSensitiveAsset(null)).toBe(false);
    expect(canSendSensitiveAsset(undefined)).toBe(false);
  });
});
