import { describe, expect, it } from "vitest";
import type { IConversationTag } from "@/shared/types";
import { hasTag, matchCatalogTag, removeTag, toggleTag } from "./leadTagCatalog";

function tag(label: string, color = "teal", archived = false): IConversationTag {
  return {
    id: `id-${label}`,
    storeId: "store-1",
    label,
    color,
    archived,
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
  };
}

const catalog: IConversationTag[] = [tag("TRANSPORTADORA", "orange"), tag("CATALIZADOR", "violet")];

describe("matchCatalogTag", () => {
  it("matches a label case-insensitively", () => {
    expect(matchCatalogTag("transportadora", catalog)?.id).toBe("id-TRANSPORTADORA");
    expect(matchCatalogTag("  Catalizador ", catalog)?.color).toBe("violet");
  });
  it("returns undefined for a legacy label absent from the catalog", () => {
    expect(matchCatalogTag("Volvo", catalog)).toBeUndefined();
    expect(matchCatalogTag("   ", catalog)).toBeUndefined();
  });
});

describe("hasTag", () => {
  it("detects membership case-insensitively", () => {
    expect(hasTag(["TRANSPORTADORA"], "transportadora")).toBe(true);
    expect(hasTag(["TRANSPORTADORA"], "CATALIZADOR")).toBe(false);
  });
});

describe("toggleTag / removeTag", () => {
  it("appends the exact label when absent", () => {
    expect(toggleTag([], "CATALIZADOR")).toEqual(["CATALIZADOR"]);
  });
  it("removes case-insensitively when present, without duplicating", () => {
    expect(toggleTag(["TRANSPORTADORA"], "transportadora")).toEqual([]);
    expect(removeTag(["TRANSPORTADORA", "CATALIZADOR"], "catalizador")).toEqual(["TRANSPORTADORA"]);
  });
  it("preserves other tags when toggling", () => {
    expect(toggleTag(["TRANSPORTADORA"], "CATALIZADOR")).toEqual(["TRANSPORTADORA", "CATALIZADOR"]);
  });
});
