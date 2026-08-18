import { describe, expect, it, vi } from "vitest";
import { processContactsImport, type IContactsImportDb } from "./contacts-core";

function makeDb(overrides: Partial<IContactsImportDb> = {}): IContactsImportDb {
  return {
    findCustomerByPhone: vi.fn(async () => null),
    findLeadByPhone: vi.fn(async () => null),
    enrichCustomerName: vi.fn(async () => {}),
    enrichLeadName: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("processContactsImport", () => {
  it("enriches a matching customer's placeholder name and skips an unknown number", async () => {
    const db = makeDb({
      findCustomerByPhone: vi.fn(async (_store: string, digits: string) =>
        digits === "5511888887777" ? { id: "cust-1", name: "+55 11 88888-7777" } : null,
      ),
    });
    const stats = await processContactsImport({
      storeId: "store-1",
      contacts: [
        { phone: "+5511888887777", name: "Joao" }, // matches, phone-like name → enrich
        { phone: "+5511777776666", name: "Maria" }, // no match → skipped, no record created
      ],
      db,
    });
    expect(stats).toEqual({
      contactsFound: 2,
      customersEnriched: 1,
      leadsEnriched: 0,
      alreadyComplete: 0,
      skippedUnknown: 1,
      failed: 0,
    });
    expect(db.enrichCustomerName).toHaveBeenCalledOnce();
    expect(db.enrichCustomerName).toHaveBeenCalledWith("cust-1", "Joao");
  });

  it("enriches a matching lead only when no customer matches", async () => {
    const db = makeDb({
      findLeadByPhone: vi.fn(async () => ({ id: "lead-1", name: "+5554999998888" })),
    });
    const stats = await processContactsImport({
      storeId: "store-1",
      contacts: [{ phone: "+5554999998888", name: "Maria" }],
      db,
    });
    expect(stats.leadsEnriched).toBe(1);
    expect(db.enrichLeadName).toHaveBeenCalledOnce();
    expect(db.enrichLeadName).toHaveBeenCalledWith("lead-1", "Maria");
  });

  it("never creates a record — counts alreadyComplete when a match has nothing to improve", async () => {
    const db = makeDb({
      findCustomerByPhone: vi.fn(async () => ({ id: "cust-1", name: "Zé da Peça" })),
    });
    const stats = await processContactsImport({
      storeId: "store-1",
      contacts: [{ phone: "+5511888887777", name: "Joao" }, { phone: "+5511777776666" }], // no name
      db,
    });
    // Both matched the same fake customer: an already-real name is never
    // overwritten, and no candidate name means nothing to compare.
    expect(stats.customersEnriched).toBe(0);
    expect(stats.alreadyComplete).toBe(2);
    expect(db.enrichCustomerName).not.toHaveBeenCalled();
  });

  it("never swaps a placeholder for another placeholder — a phone-like candidate name is not usable", async () => {
    const db = makeDb({
      findCustomerByPhone: vi.fn(async () => ({ id: "cust-1", name: "+5511888887777" })),
    });
    const stats = await processContactsImport({
      storeId: "store-1",
      contacts: [{ phone: "+5511888887777", name: "+55 (11) 88888-7777" }], // candidate is phone-like too
      db,
    });
    expect(stats.customersEnriched).toBe(0);
    expect(stats.alreadyComplete).toBe(1);
    expect(db.enrichCustomerName).not.toHaveBeenCalled();
  });

  it("counts a failed contact and keeps going (never aborts the run)", async () => {
    const db = makeDb({
      findCustomerByPhone: vi.fn(async (_store: string, digits: string) =>
        digits === "5554999998888" ? { id: "cust-1", name: "+5554999998888" } : null,
      ),
      enrichCustomerName: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    const warn = vi.fn();
    const stats = await processContactsImport({
      storeId: "store-1",
      contacts: [{ phone: "+5554999998888", name: "Maria" }, { phone: "+5511888887777" }],
      db,
      warn,
    });
    expect(stats.failed).toBe(1);
    expect(stats.skippedUnknown).toBe(1); // the second contact matched nothing
    expect(warn).toHaveBeenCalledOnce();
  });
});
