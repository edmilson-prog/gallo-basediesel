import { describe, expect, it } from "vitest";
import type { IAssetLibraryItem } from "@/shared/types";
import { filterAssets } from "./assetFiltering";

function asset(over: Partial<IAssetLibraryItem>): IAssetLibraryItem {
  return {
    id: "a1",
    storeId: "store-matriz",
    division: "parts",
    title: "Catálogo Freios Volvo",
    category: "catalogo",
    brand: "Volvo",
    productLine: "Freios",
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

const items: IAssetLibraryItem[] = [
  asset({ id: "a1", title: "Catálogo Freios Volvo", brand: "Volvo", category: "catalogo", productLine: "Freios" }),
  asset({ id: "a2", title: "Tabela de Preços Scania", brand: "Scania", category: "tabela_preco", productLine: "Motor" }),
  asset({ id: "a3", title: "Ficha Técnica Embreagem", brand: "Volvo", category: "ficha_tecnica", productLine: "Embreagem" }),
];

describe("filterAssets", () => {
  it("returns all when filter is empty", () => {
    expect(filterAssets(items, {})).toHaveLength(3);
  });
  it("filters by category", () => {
    const r = filterAssets(items, { category: "tabela_preco" });
    expect(r.map((a) => a.id)).toEqual(["a2"]);
  });
  it("filters by brand", () => {
    const r = filterAssets(items, { brand: "Volvo" });
    expect(r.map((a) => a.id)).toEqual(["a1", "a3"]);
  });
  it("filters by productLine", () => {
    const r = filterAssets(items, { productLine: "Freios" });
    expect(r.map((a) => a.id)).toEqual(["a1"]);
  });
  it("does case-insensitive title match on query", () => {
    const r = filterAssets(items, { query: "freios" });
    expect(r.map((a) => a.id)).toEqual(["a1"]);
  });
  it("applies a composite filter (brand + query)", () => {
    const r = filterAssets(items, { brand: "Volvo", query: "ficha" });
    expect(r.map((a) => a.id)).toEqual(["a3"]);
  });
  it("returns empty when nothing matches", () => {
    expect(filterAssets(items, { query: "zzz" })).toEqual([]);
  });
});
