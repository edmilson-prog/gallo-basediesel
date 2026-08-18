import { describe, expect, it } from "vitest";
import type { IPart } from "@/shared/types";
import { buildFreeItem, buildItemFromPart } from "./quoteItemOps";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const part = {
  id: "0d4f6a1e-5f0c-4a3b-9b2e-1c2d3e4f5a6b",
  sku: "VOL-1234",
  name: "Filtro de óleo",
  unitPrice: 105.46,
} as IPart;

describe("quote item ids", () => {
  // `quote_items.id` is a uuid column — a prefixed id ("qi-…") makes the insert
  // fail with `invalid input syntax for type uuid`.
  it("buildItemFromPart mints a canonical uuid", () => {
    expect(buildItemFromPart(part).id).toMatch(UUID_RE);
  });

  it("buildFreeItem mints a canonical uuid", () => {
    expect(buildFreeItem({ name: "Mão de obra", unitPrice: 80 }).id).toMatch(UUID_RE);
  });
});
