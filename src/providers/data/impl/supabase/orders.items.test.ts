import { describe, expect, it } from "vitest";
import type { IOrderItem } from "@/shared/types";
import { FREE_ITEM_PART_ID } from "@/shared/types";
import { orderItemToRow, rowToOrderItem } from "./orders";

const ORDER_ID = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";

const item: IOrderItem = {
  id: "oi-8f14e45f-ceea-467a-9d5b-2f1c1d8f3a11-1",
  partId: "0d4f6a1e-5f0c-4a3b-9b2e-1c2d3e4f5a6b",
  partSku: "VOL-1234",
  partName: "Filtro de óleo",
  quantity: 2,
  unitPrice: 52.73,
  unitCost: 36.91,
  discount: 0,
  total: 105.46,
  marginValue: 31.64,
};

describe("orderItemToRow", () => {
  // `order_items.id` is a uuid column: ids carried over from a quote conversion
  // ("oi-…") are not uuids and must never reach it.
  it("never writes the client-side item id", () => {
    expect(orderItemToRow(item, ORDER_ID)).not.toHaveProperty("id");
  });

  it("writes NULL as the part of a free (off-catalog) line", () => {
    expect(orderItemToRow({ ...item, partId: FREE_ITEM_PART_ID }, ORDER_ID).part_id).toBeNull();
  });

  // The line replacement done by `update` re-inserts rows that already exist;
  // keeping their uuid preserves the identity derived elsewhere (inventory moves).
  it("preserves an existing uuid when the caller asks to keep it", () => {
    const persisted = { ...item, id: "8f14e45f-ceea-467a-9d5b-2f1c1d8f3a11" };
    expect(orderItemToRow(persisted, ORDER_ID, { preserveId: true }).id).toBe(
      "8f14e45f-ceea-467a-9d5b-2f1c1d8f3a11",
    );
  });

  it("drops a non-uuid id even when the caller asks to keep it", () => {
    expect(orderItemToRow(item, ORDER_ID, { preserveId: true })).not.toHaveProperty("id");
  });
});

describe("rowToOrderItem", () => {
  it("restores the free-item sentinel from a NULL part_id", () => {
    const restored = rowToOrderItem({
      id: "8f14e45f-ceea-467a-9d5b-2f1c1d8f3a11",
      order_id: ORDER_ID,
      part_id: null,
      part_sku: "—",
      part_name: "Mão de obra",
      quantity: 1,
      unit_price: 80,
      unit_cost: 0,
      discount: 0,
      total: 80,
      margin_value: 80,
      applied_to_vehicle_id: null,
      part_category: null,
      part_subcategory: null,
    });
    expect(restored.partId).toBe(FREE_ITEM_PART_ID);
  });
});
