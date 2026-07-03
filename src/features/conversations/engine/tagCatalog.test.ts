import { describe, expect, it } from "vitest";
import type { IConversationTag } from "@/shared/types";
import {
  TAG_PALETTE,
  TAG_LABEL_MAX,
  tagColorHex,
  normalizeTagLabel,
  validateTagLabel,
  resolveConversationTags,
  splitVisibleTags,
} from "./tagCatalog";

function tag(id: string, label: string, overrides: Partial<IConversationTag> = {}): IConversationTag {
  return {
    id,
    storeId: "00000000-0000-0000-0000-000000000001",
    label,
    color: "teal",
    archived: false,
    createdAt: "2026-07-01T12:00:00.000Z",
    updatedAt: "2026-07-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("TAG_PALETTE", () => {
  it("has 8-10 entries with unique ids and valid hex", () => {
    expect(TAG_PALETTE.length).toBeGreaterThanOrEqual(8);
    expect(TAG_PALETTE.length).toBeLessThanOrEqual(10);
    const ids = new Set(TAG_PALETTE.map((p) => p.id));
    expect(ids.size).toBe(TAG_PALETTE.length);
    for (const entry of TAG_PALETTE) {
      expect(entry.hex).toMatch(/^#[0-9a-f]{6}$/i);
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });

  it("resolves a known color id, passes through valid 6-digit hex, and falls back otherwise", () => {
    expect(tagColorHex("teal")).toBe(TAG_PALETTE.find((p) => p.id === "teal")!.hex);
    expect(tagColorHex("#ff5733")).toBe("#ff5733");
    expect(tagColorHex("#FF5733")).toBe("#FF5733");
    // 3-digit shorthand is not what <input type="color"> emits → treated as unknown.
    expect(tagColorHex("#fff")).toBe(TAG_PALETTE[TAG_PALETTE.length - 1]!.hex);
    expect(tagColorHex("nope")).toBe(TAG_PALETTE[TAG_PALETTE.length - 1]!.hex);
  });
});

describe("normalizeTagLabel / validateTagLabel", () => {
  it("trims, collapses internal whitespace, and uppercases (pt-BR)", () => {
    expect(normalizeTagLabel("  Aguardando   peça  ")).toBe("AGUARDANDO PEÇA");
    expect(normalizeTagLabel("garantia")).toBe("GARANTIA");
  });

  it("rejects empty labels", () => {
    expect(validateTagLabel("   ", [])).toEqual({ ok: false, error: "empty" });
  });

  it("rejects labels over TAG_LABEL_MAX chars", () => {
    expect(validateTagLabel("x".repeat(TAG_LABEL_MAX + 1), [])).toEqual({
      ok: false,
      error: "too_long",
    });
  });

  it("rejects duplicates case-insensitively (pt-BR)", () => {
    expect(validateTagLabel("garantia", ["Garantia"])).toEqual({ ok: false, error: "duplicate" });
  });

  it("accepts a valid label and returns it normalized (uppercased)", () => {
    expect(validateTagLabel(" Pós-venda ", ["Garantia"])).toEqual({ ok: true, label: "PÓS-VENDA" });
  });
});

describe("resolveConversationTags", () => {
  const catalog = [tag("a", "Garantia"), tag("b", "Revenda"), tag("c", "Pós-venda", { archived: true })];

  it("maps ids to catalog entries preserving the ids order", () => {
    const result = resolveConversationTags(["b", "a"], catalog);
    expect(result.map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("silently drops orphan ids", () => {
    expect(resolveConversationTags(["a", "gone"], catalog).map((t) => t.id)).toEqual(["a"]);
  });

  it("keeps archived tags (history must keep rendering)", () => {
    expect(resolveConversationTags(["c"], catalog)).toHaveLength(1);
  });
});

describe("splitVisibleTags", () => {
  it("returns all when under the cap and zero overflow", () => {
    const r = splitVisibleTags([1, 2], 3);
    expect(r.visible).toEqual([1, 2]);
    expect(r.overflowCount).toBe(0);
  });

  it("caps visible items and counts the rest", () => {
    const r = splitVisibleTags([1, 2, 3, 4, 5], 2);
    expect(r.visible).toEqual([1, 2]);
    expect(r.overflowCount).toBe(3);
    expect(r.overflow).toEqual([3, 4, 5]);
  });
});
