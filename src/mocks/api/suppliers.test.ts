import { beforeEach, describe, expect, it } from "vitest";
import { suppliersApi } from "./suppliers";

const STORE = "00000000-0000-0000-0000-000000000001";

describe("suppliersApi", () => {
  beforeEach(() => {
    suppliersApi.__resetForTests();
  });

  it("lists the seeded suppliers paginated", async () => {
    const result = await suppliersApi.list({ page: 1, pageSize: 5 });
    expect(result.data).toHaveLength(5);
    expect(result.total).toBeGreaterThan(5);
    expect(result.page).toBe(1);
  });

  it("filters by category", async () => {
    const result = await suppliersApi.list({ category: "freight", pageSize: 100 });
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.every((s) => s.category === "freight")).toBe(true);
  });

  it("searches by name, ignoring case and accent", async () => {
    const result = await suppliersApi.list({ search: "retifica", pageSize: 100 });
    expect(result.data.some((s) => s.name.toLowerCase().includes("retífica"))).toBe(true);
  });

  it("creates a supplier that starts active with no history", async () => {
    const created = await suppliersApi.create({
      storeId: STORE,
      name: "Fornecedor Novo",
      category: "parts",
    });
    expect(created.status).toBe("active");
    expect(created.source).toBe("manual");
    expect(created.suppliedItems).toEqual([]);

    const stats = await suppliersApi.stats(created.id);
    expect(stats.linkedParts).toBe(0);
    expect(stats.purchasesLast12Months).toBe(0);
    expect(stats.lastEntries).toEqual([]);
  });

  it("rejects a duplicate document within the same store", async () => {
    await suppliersApi.create({
      storeId: STORE,
      name: "Primeiro",
      document: "33000167000101",
      category: "parts",
    });
    await expect(
      suppliersApi.create({
        storeId: STORE,
        name: "Segundo",
        document: "33000167000101",
        category: "parts",
      }),
    ).rejects.toThrow(/já cadastrado/i);
  });

  it("patches only the given fields", async () => {
    const created = await suppliersApi.create({
      storeId: STORE,
      name: "Editável",
      category: "parts",
    });
    const updated = await suppliersApi.update(created.id, { paymentTerms: "28 dias" });
    expect(updated.paymentTerms).toBe("28 dias");
    expect(updated.name).toBe("Editável");
  });

  it("archives instead of deleting", async () => {
    const created = await suppliersApi.create({
      storeId: STORE,
      name: "Arquivável",
      category: "parts",
    });
    const archived = await suppliersApi.archive(created.id);
    expect(archived.status).toBe("inactive");
    await expect(suppliersApi.get(created.id)).resolves.toBeDefined();
  });
});
