import { describe, expect, it, vi } from "vitest";
import { processContactsImport, type IContactsImportDb } from "./contacts-core";

function makeDb(overrides: Partial<IContactsImportDb> = {}): IContactsImportDb {
  return {
    findCustomerByPhone: vi.fn(async () => null),
    resolveDefaultSellerId: vi.fn(async () => "seller-1"),
    createPendingContact: vi.fn(async () => ({ id: "new" })),
    ...overrides,
  };
}

describe("processContactsImport", () => {
  it("creates a customer for each new contact and counts existing ones", async () => {
    const db = makeDb({
      findCustomerByPhone: vi.fn(async (_store: string, digits: string) =>
        digits === "5511888887777" ? { id: "existing" } : null,
      ),
    });
    const stats = await processContactsImport({
      storeId: "store-1",
      contacts: [
        { phone: "+5554999998888", name: "Maria" },
        { phone: "+5511888887777", name: "Joao" }, // already exists
        { phone: "+5511777776666" }, // no name
      ],
      db,
    });
    expect(stats).toEqual({ contactsFound: 3, customersCreated: 2, customersExisting: 1, failed: 0 });
    expect(db.createPendingContact).toHaveBeenCalledTimes(2);
    expect(db.createPendingContact).toHaveBeenCalledWith({
      storeId: "store-1",
      phone: "+5554999998888",
      name: "Maria",
      sellerId: "seller-1",
    });
    expect(db.createPendingContact).toHaveBeenCalledWith({
      storeId: "store-1",
      phone: "+5511777776666",
      name: undefined,
      sellerId: "seller-1",
    });
  });

  it("resolves the default seller lazily — never when all contacts already exist", async () => {
    const resolveDefaultSellerId = vi.fn(async () => "seller-1");
    const db = makeDb({
      findCustomerByPhone: vi.fn(async () => ({ id: "existing" })),
      resolveDefaultSellerId,
    });
    const stats = await processContactsImport({
      storeId: "store-1",
      contacts: [{ phone: "+5554999998888" }, { phone: "+5511888887777" }],
      db,
    });
    expect(stats).toMatchObject({ contactsFound: 2, customersCreated: 0, customersExisting: 2 });
    expect(resolveDefaultSellerId).not.toHaveBeenCalled();
  });

  it("resolves the default seller only once across many creates", async () => {
    const resolveDefaultSellerId = vi.fn(async () => "seller-1");
    const db = makeDb({ resolveDefaultSellerId });
    await processContactsImport({
      storeId: "store-1",
      contacts: [{ phone: "+5554999998888" }, { phone: "+5511888887777" }],
      db,
    });
    expect(resolveDefaultSellerId).toHaveBeenCalledTimes(1);
  });

  it("counts a failed contact and keeps going (never aborts the run)", async () => {
    const db = makeDb({
      createPendingContact: vi.fn(async (input: { phone: string }) => {
        if (input.phone === "+5554999998888") throw new Error("db down");
        return { id: "new" };
      }),
    });
    const warn = vi.fn();
    const stats = await processContactsImport({
      storeId: "store-1",
      contacts: [{ phone: "+5554999998888" }, { phone: "+5511888887777" }],
      db,
      warn,
    });
    expect(stats).toEqual({ contactsFound: 2, customersCreated: 1, customersExisting: 0, failed: 1 });
    expect(warn).toHaveBeenCalledOnce();
  });
});
