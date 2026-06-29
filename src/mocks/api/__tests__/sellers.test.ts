import { describe, expect, it } from "vitest";
import { sellersApi } from "../sellers";
import { resetMockStorePerFile } from "@/mocks/test-setup";

resetMockStorePerFile();

const STORE = "00000000-0000-0000-0000-000000000001";

describe("sellersApi.create", () => {
  it("creates a seller with defaults (offline, parts, active, no deletedAt)", async () => {
    const created = await sellersApi.create({
      storeId: STORE,
      fullName: "Teste da Silva",
      email: "Teste.Silva@Example.com",
      type: "internal",
    });
    expect(created.id).toBeTruthy();
    expect(created.email).toBe("teste.silva@example.com"); // normalized
    expect(created.availability).toBe("offline");
    expect(created.divisions).toEqual(["parts"]);
    expect(created.active).toBe(true);
    expect(created.deletedAt).toBeUndefined();
    // shows up in the store list
    const listed = await sellersApi.list({ storeId: STORE });
    expect(listed.some((s) => s.id === created.id)).toBe(true);
  });

  it("rejects empty fullName", async () => {
    await expect(
      sellersApi.create({ storeId: STORE, fullName: "  ", email: "a@b.com", type: "internal" }),
    ).rejects.toThrow();
  });
});

describe("sellersApi.remove (soft delete)", () => {
  it("hides the seller from list() but get() still resolves", async () => {
    const created = await sellersApi.create({
      storeId: STORE,
      fullName: "Para Excluir",
      email: "excluir@example.com",
      type: "external",
      region: "Norte RS",
    });
    await sellersApi.remove(created.id);

    const listed = await sellersApi.list({ storeId: STORE });
    expect(listed.some((s) => s.id === created.id)).toBe(false);

    const fetched = await sellersApi.get(created.id);
    expect(fetched.deletedAt).toBeTruthy();
    expect(fetched.active).toBe(false);
  });

  it("throws for unknown id", async () => {
    await expect(sellersApi.remove("seller-nao-existe")).rejects.toThrow();
  });
});
