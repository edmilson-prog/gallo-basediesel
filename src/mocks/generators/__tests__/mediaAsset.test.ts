import { describe, expect, it } from "vitest";
import { createSeededContext } from "../utils";
import { generateMediaAssets } from "../mediaAsset";

function build(seed: number) {
  const ctx = createSeededContext(seed);
  return generateMediaAssets(ctx, {
    count: 90,
    conversationIds: ["conv-1", "conv-2", "conv-3"],
    customerIdByConversation: { "conv-1": "cust-1", "conv-2": "cust-2", "conv-3": "cust-3" },
    storeId: "store-matriz",
    now: new Date("2026-06-05T12:00:00.000Z"),
  });
}

describe("generateMediaAssets", () => {
  it("is deterministic for the same seed", () => {
    expect(build(42)).toEqual(build(42));
  });
  it("differs across seeds", () => {
    expect(build(42)).not.toEqual(build(7));
  });
  it("honors the requested count", () => {
    expect(build(42)).toHaveLength(90);
  });
  it("covers sensitive assets (nota_fiscal/comprovante)", () => {
    const sensitive = build(42).filter((a) => a.sensitivity === "sensitive");
    expect(sensitive.length).toBeGreaterThan(0);
    for (const a of sensitive) {
      expect(["nota_fiscal", "comprovante"]).toContain(a.classification);
    }
  });
  it("covers some non-persisted (in-flight) assets", () => {
    expect(build(42).some((a) => a.persisted === false)).toBe(true);
  });
  it("yields varied classifications (classifyMedia applied at creation)", () => {
    const kinds = new Set(build(42).map((a) => a.classification));
    // The realistic fileNames/markers + mockMarker path exercise classifyMedia
    // across multiple classes — expect at least 4 distinct values present.
    expect(kinds.size).toBeGreaterThanOrEqual(4);
    for (const a of build(42)) {
      expect(a.classification).toBeDefined();
    }
  });
  it("covers some assets with a near-future sourceExpiresAt", () => {
    const withExpiry = build(42).filter((a) => a.sourceExpiresAt);
    expect(withExpiry.length).toBeGreaterThan(0);
  });
  it("assigns a unique id and obfuscated storageRef to every asset", () => {
    const assets = build(42);
    const ids = new Set(assets.map((a) => a.id));
    expect(ids.size).toBe(assets.length);
    for (const a of assets) {
      expect(a.storageRef).toMatch(/^ref-/);
      expect(a.storageRef).not.toContain("http");
    }
  });
});
