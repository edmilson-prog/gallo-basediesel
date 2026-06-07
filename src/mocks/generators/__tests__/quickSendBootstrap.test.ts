import { describe, expect, it } from "vitest";
import { bootstrap } from "../bootstrap";

describe("bootstrap — PRD-027 collections", () => {
  it("populates the asset library, snippets, links and combos deterministically", () => {
    const a = bootstrap(42);
    const b = bootstrap(42);
    expect(a.assetLibraryItems).toEqual(b.assetLibraryItems);
    expect(a.quickReplies).toEqual(b.quickReplies);
    expect(a.trackableLinks).toEqual(b.trackableLinks);
    expect(a.assetCombos).toEqual(b.assetCombos);
  });

  it("respects configured volumes (±0 for these fixed-count collections)", () => {
    const d = bootstrap(42);
    expect(d.assetLibraryItems).toHaveLength(30);
    expect(d.quickReplies).toHaveLength(20);
    expect(d.trackableLinks).toHaveLength(10);
    expect(d.assetCombos).toHaveLength(5);
    expect(d.scheduledSends).toHaveLength(0);
  });

  it("binds trackable links to real conversations", () => {
    const d = bootstrap(42);
    const convIds = new Set(d.conversations.map((c) => c.id));
    for (const l of d.trackableLinks) {
      expect(convIds.has(l.conversationId!)).toBe(true);
    }
  });

  it("binds combos to real asset ids", () => {
    const d = bootstrap(42);
    const assetIds = new Set(d.assetLibraryItems.map((a) => a.id));
    for (const c of d.assetCombos) {
      for (const id of c.assetIds) expect(assetIds.has(id)).toBe(true);
    }
  });

  it("marks every tabela_preco asset sensitive in the seeded library", () => {
    const d = bootstrap(42);
    for (const a of d.assetLibraryItems) {
      if (a.category === "tabela_preco") expect(a.sensitivity).toBe("sensitive");
    }
  });
});
