import { describe, expect, it } from "vitest";
import type { DintecBatchContext, DintecImportSource } from "../types";
import { MockDintecProvider } from "./MockDintecProvider";

const SOURCE: DintecImportSource = { kind: "inline", csvText: "" };

function contextFor(entityKind: DintecBatchContext["entityKind"]): DintecBatchContext {
  return {
    batchId: "batch-1",
    entityKind,
    storeId: "store-1",
    uploadedBy: "seller-1",
    uploadedAt: "2026-06-10T12:00:00.000Z",
  };
}

describe("MockDintecProvider (RF-020..023)", () => {
  const provider = new MockDintecProvider();

  it("loadBatch returns 3 customers with the canonical layout (RF-021)", async () => {
    const batch = await provider.loadBatch(SOURCE, contextFor("customer"));
    expect(batch.totalRows).toBe(3);
    expect(batch.rows.map((row) => row.dintecId)).toEqual(["C001", "C002", "C003"]);
    for (const row of batch.rows) {
      expect(row.entityKind).toBe("customer");
      expect(row.rowNumber).toBeGreaterThan(0);
      expect(row.rawRecord.codigo).toBe(row.dintecId);
      expect(row.rawRecord.razao_social).toBeTruthy();
      expect(["F", "J"]).toContain(row.rawRecord.tipo_pessoa);
    }
  });

  it("loadBatch returns 5 parts P001..P005 (RF-021)", async () => {
    const batch = await provider.loadBatch(SOURCE, contextFor("part"));
    expect(batch.totalRows).toBe(5);
    expect(batch.rows.map((row) => row.dintecId)).toEqual(["P001", "P002", "P003", "P004", "P005"]);
    for (const row of batch.rows) {
      // Values are ALWAYS strings (RF-004) — Brazilian decimal comma intact.
      expect(typeof row.rawRecord.preco_venda).toBe("string");
      expect(row.rawRecord.preco_venda).toMatch(/^\d+,\d{2}$/);
    }
  });

  it("loadBatch returns 2 orders and 4 order items (RF-021)", async () => {
    const orders = await provider.loadBatch(SOURCE, contextFor("order"));
    expect(orders.totalRows).toBe(2);

    const items = await provider.loadBatch(SOURCE, contextFor("order_item"));
    expect(items.totalRows).toBe(4);
    for (const row of items.rows) {
      expect(row.rawRecord.numero_pedido).toBeTruthy();
      expect(row.rawRecord.codigo_peca).toBeTruthy();
    }
  });

  it("reserved kinds (price/stock) return empty batches", async () => {
    const price = await provider.loadBatch(SOURCE, contextFor("price"));
    const stock = await provider.loadBatch(SOURCE, contextFor("stock"));
    expect(price.totalRows).toBe(0);
    expect(stock.totalRows).toBe(0);
  });

  it("echoes the batch context into the returned batch", async () => {
    const context = contextFor("customer");
    const batch = await provider.loadBatch(SOURCE, context);
    expect(batch.batchId).toBe(context.batchId);
    expect(batch.storeId).toBe(context.storeId);
    expect(batch.uploadedBy).toBe(context.uploadedBy);
    expect(batch.uploadedAt).toBe(context.uploadedAt);
    expect(batch.source).toBe(SOURCE);
  });

  it("is deterministic — same call, same dataset", async () => {
    const first = await provider.loadBatch(SOURCE, contextFor("customer"));
    const second = await provider.loadBatch(SOURCE, contextFor("customer"));
    expect(second.rows).toEqual(first.rows);
  });

  it("returns independent rawRecord copies (no shared mutable state)", async () => {
    const first = await provider.loadBatch(SOURCE, contextFor("customer"));
    const firstRow = first.rows[0];
    expect(firstRow).toBeDefined();
    if (firstRow) firstRow.rawRecord.razao_social = "MUTATED";
    const second = await provider.loadBatch(SOURCE, contextFor("customer"));
    expect(second.rows[0]?.rawRecord.razao_social).not.toBe("MUTATED");
  });

  it("validateStructure is always valid (RF-022)", async () => {
    const batch = await provider.loadBatch(SOURCE, contextFor("customer"));
    const result = await provider.validateStructure(batch);
    expect(result).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it("healthCheck is always healthy (RF-023)", async () => {
    const health = await provider.healthCheck();
    expect(health.status).toBe("healthy");
  });
});
