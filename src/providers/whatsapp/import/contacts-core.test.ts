import { describe, expect, it, vi } from "vitest";
import { processContactsImport, type IContactsImportDb } from "./contacts-core";

function makeDb(overrides: Partial<IContactsImportDb> = {}): IContactsImportDb {
  return {
    findCustomerByPhone: vi.fn(async () => null),
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
    });
    expect(db.createPendingContact).toHaveBeenCalledWith({
      storeId: "store-1",
      phone: "+5511777776666",
      name: undefined,
    });
  });

  it("imported contacts carry no wallet owner — never assigns a seller", async () => {
    const createPendingContact = vi.fn(async () => ({ id: "new" }));
    const db = makeDb({ createPendingContact });
    await processContactsImport({
      storeId: "store-1",
      contacts: [{ phone: "+5554999998888" }],
      db,
    });
    // The import never passes a sellerId — the anchor's seller_id stays null
    // (DB default), so the contact is unowned until a manual conversion.
    expect(createPendingContact).toHaveBeenCalledWith({
      storeId: "store-1",
      phone: "+5554999998888",
      name: undefined,
    });
    expect(createPendingContact.mock.calls[0]?.[0]).not.toHaveProperty("sellerId");
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
