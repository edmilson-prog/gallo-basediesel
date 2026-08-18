import { describe, expect, it } from "vitest";
import type { IQuoteItem } from "@/shared/types";
import { FREE_ITEM_PART_ID } from "@/shared/types";
import { quoteItemToRow, rowToQuoteItem } from "./quotes";

const QUOTE_ID = "8f14e45f-ceea-467a-9d5b-2f1c1d8f3a11";

const catalogItem: IQuoteItem = {
  id: "qi-b9d9da83-71fc-41a2-b794-84f3b07d3616",
  partId: "0d4f6a1e-5f0c-4a3b-9b2e-1c2d3e4f5a6b",
  partSku: "VOL-1234",
  partName: "Filtro de óleo",
  quantity: 2,
  unitPrice: 52.73,
  discount: 0,
  total: 105.46,
};

describe("quoteItemToRow", () => {
  // The id column is `uuid default gen_random_uuid()`; the editor mints its own
  // client-side ids for React keys, which are not uuids and must never be written.
  it("never writes the client-side item id", () => {
    expect(quoteItemToRow(catalogItem, QUOTE_ID)).not.toHaveProperty("id");
  });

  it("maps the camelCase item onto snake_case columns, parented to the quote", () => {
    expect(quoteItemToRow(catalogItem, QUOTE_ID)).toEqual({
      quote_id: QUOTE_ID,
      part_id: "0d4f6a1e-5f0c-4a3b-9b2e-1c2d3e4f5a6b",
      part_sku: "VOL-1234",
      part_name: "Filtro de óleo",
      quantity: 2,
      unit_price: 52.73,
      discount: 0,
      total: 105.46,
    });
  });

  // `part_id` is a uuid FK to parts(id) — the "avulso" sentinel is not a part.
  it("writes NULL as the part of a free (off-catalog) line", () => {
    const row = quoteItemToRow({ ...catalogItem, partId: FREE_ITEM_PART_ID }, QUOTE_ID);
    expect(row.part_id).toBeNull();
  });
});

describe("rowToQuoteItem", () => {
  it("restores the free-item sentinel from a NULL part_id", () => {
    const item = rowToQuoteItem({
      id: "b9d9da83-71fc-41a2-b794-84f3b07d3616",
      quote_id: QUOTE_ID,
      part_id: null,
      part_sku: "—",
      part_name: "Mão de obra",
      quantity: 1,
      unit_price: 80,
      discount: 0,
      total: 80,
    });
    expect(item.partId).toBe(FREE_ITEM_PART_ID);
  });

  it("keeps the real part id of a catalog line", () => {
    const item = rowToQuoteItem({
      id: "b9d9da83-71fc-41a2-b794-84f3b07d3616",
      quote_id: QUOTE_ID,
      part_id: "0d4f6a1e-5f0c-4a3b-9b2e-1c2d3e4f5a6b",
      part_sku: "VOL-1234",
      part_name: "Filtro de óleo",
      quantity: 2,
      unit_price: 52.73,
      discount: 0,
      total: 105.46,
    });
    expect(item.partId).toBe("0d4f6a1e-5f0c-4a3b-9b2e-1c2d3e4f5a6b");
  });
});
