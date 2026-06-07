import { describe, expect, it } from "vitest";
import { createSeededContext } from "../utils";
import {
  generateAssetLibrary,
  generateQuickReplies,
  generateTrackableLinks,
  generateAssetCombos,
} from "../quickSend";

const NOW = new Date("2026-06-06T12:00:00.000Z");
const STORE = "store-matriz";
const OWNER = "seller-joao-gallo";
const SELLERS = ["seller-carlos-santos", "seller-rafael-lima"];

function buildAssets(seed: number) {
  return generateAssetLibrary(createSeededContext(seed), {
    count: 30,
    storeId: STORE,
    createdBy: OWNER,
    now: NOW,
  });
}

describe("generateAssetLibrary", () => {
  it("is deterministic for the same seed", () => {
    expect(buildAssets(42)).toEqual(buildAssets(42));
  });
  it("differs across seeds", () => {
    expect(buildAssets(42)).not.toEqual(buildAssets(7));
  });
  it("honors the requested count", () => {
    expect(buildAssets(42)).toHaveLength(30);
  });
  it("assigns unique ids and obfuscated storageRefs (never a real URL on files)", () => {
    const assets = buildAssets(42);
    expect(new Set(assets.map((a) => a.id)).size).toBe(assets.length);
    for (const a of assets) {
      if (a.kind !== "link") {
        expect(a.storageRef).toMatch(/^ref-/);
        expect(a.storageRef ?? "").not.toContain("http");
      }
    }
  });
  it("marks every tabela_preco as sensitive", () => {
    const tabelas = buildAssets(42).filter((a) => a.category === "tabela_preco");
    expect(tabelas.length).toBeGreaterThan(0);
    for (const t of tabelas) expect(t.sensitivity).toBe("sensitive");
  });
  it("covers all five brands", () => {
    const brands = new Set(buildAssets(42).map((a) => a.brand).filter(Boolean));
    for (const b of ["Volvo", "Scania", "Mercedes-Benz", "Ford Cargo", "Iveco"]) {
      expect(brands.has(b)).toBe(true);
    }
  });
  it("includes at least one of every category", () => {
    const cats = new Set(buildAssets(42).map((a) => a.category));
    for (const c of ["catalogo", "ficha_tecnica", "tabela_preco", "garantia", "video", "link"]) {
      expect(cats.has(c as never)).toBe(true);
    }
  });
  it("has only published or draft statuses with a published majority", () => {
    const assets = buildAssets(42);
    const published = assets.filter((a) => a.status === "published");
    expect(published.length).toBeGreaterThan(assets.length / 2);
  });
});

describe("generateQuickReplies", () => {
  function build(seed: number) {
    return generateQuickReplies(createSeededContext(seed), {
      count: 20,
      storeId: STORE,
      sellerIds: SELLERS,
      now: NOW,
    });
  }
  it("is deterministic for the same seed", () => {
    expect(build(42)).toEqual(build(42));
  });
  it("honors the requested count", () => {
    expect(build(42)).toHaveLength(20);
  });
  it("includes the four shared snippets (garantia/frete/prazo/faturamento)", () => {
    const shortcuts = build(42).filter((r) => r.scope === "shared").map((r) => r.shortcut);
    for (const sc of ["/garantia", "/frete", "/prazo", "/faturamento"]) {
      expect(shortcuts).toContain(sc);
    }
  });
  it("emits some bodies carrying {{...}} placeholders", () => {
    expect(build(42).some((r) => /\{\{[a-z]+\}\}/.test(r.body))).toBe(true);
  });
});

describe("generateTrackableLinks", () => {
  function build(seed: number) {
    const assets = buildAssets(seed).filter((a) => a.category === "link");
    return generateTrackableLinks(createSeededContext(seed), {
      count: 10,
      storeId: STORE,
      assets,
      conversationIds: ["conv-1", "conv-2", "conv-3"],
      leadIdByConversation: { "conv-1": "lead-1", "conv-2": undefined, "conv-3": "lead-3" },
      createdBy: OWNER,
      now: NOW,
    });
  }
  it("is deterministic for the same seed", () => {
    expect(build(42)).toEqual(build(42));
  });
  it("honors the requested count", () => {
    expect(build(42)).toHaveLength(10);
  });
  it("seeds simulated opens (some links already opened)", () => {
    expect(build(42).some((l) => l.opens > 0)).toBe(true);
  });
  it("produces glo.bz short refs", () => {
    for (const l of build(42)) expect(l.shortRef).toMatch(/^glo\.bz\//);
  });
});

describe("generateAssetCombos", () => {
  function build(seed: number) {
    return generateAssetCombos(createSeededContext(seed), {
      count: 5,
      storeId: STORE,
      assets: buildAssets(seed),
      ownerId: OWNER,
      now: NOW,
    });
  }
  it("is deterministic for the same seed", () => {
    expect(build(42)).toEqual(build(42));
  });
  it("honors the requested count and references real asset ids", () => {
    const combos = build(42);
    expect(combos).toHaveLength(5);
    const assetIds = new Set(buildAssets(42).map((a) => a.id));
    for (const c of combos) {
      expect(c.assetIds.length).toBeGreaterThan(0);
      for (const id of c.assetIds) expect(assetIds.has(id)).toBe(true);
    }
  });
});
