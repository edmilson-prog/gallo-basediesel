import { describe, expect, it } from "vitest";
import {
  encodeProductCard,
  decodeProductCard,
  priceLabel,
  hasImage,
  PRODUCT_CARD_MARKER,
  type IProductCardSnapshot,
} from "./productCardPayload";

function snap(over: Partial<IProductCardSnapshot>): IProductCardSnapshot {
  return {
    id: "part-001",
    name: "Pastilha de Freio FH",
    oem: "20758807",
    equivalence: "Bosch 0986",
    stockLabel: "Em estoque",
    stockSeverity: "ok",
    price: 189.9,
    imageRef: "ref-abc",
    ...over,
  };
}

describe("encode/decode round-trip", () => {
  it("encodes with the [produto] marker", () => {
    expect(encodeProductCard(snap({}))).toMatch(/^\[produto\]\{/);
  });
  it("round-trips a snapshot", () => {
    const s = snap({});
    expect(decodeProductCard(encodeProductCard(s))).toEqual(s);
  });
  it("returns null for non-marker text (degrade)", () => {
    expect(decodeProductCard("apenas um texto")).toBeNull();
  });
  it("returns null for malformed json after the marker (degrade)", () => {
    expect(decodeProductCard("[produto]{not json")).toBeNull();
  });
});

describe("priceLabel", () => {
  it("formats a price in BRL", () => {
    expect(priceLabel(snap({ price: 189.9 }))).toContain("189,90");
  });
  it("returns 'Consultar valor' when no price (never R$ 0,00)", () => {
    expect(priceLabel(snap({ price: undefined }))).toBe("Consultar valor");
  });
});

describe("hasImage", () => {
  it("is true with an imageRef", () => {
    expect(hasImage(snap({ imageRef: "ref-abc" }))).toBe(true);
  });
  it("is false without an imageRef (tile fallback)", () => {
    expect(hasImage(snap({ imageRef: undefined }))).toBe(false);
  });
});

describe("PRODUCT_CARD_MARKER", () => {
  it("is the [produto] prefix", () => {
    expect(PRODUCT_CARD_MARKER).toBe("[produto]");
  });
});
