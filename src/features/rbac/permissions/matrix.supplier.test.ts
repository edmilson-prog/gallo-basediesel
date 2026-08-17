import { describe, expect, it } from "vitest";
import { PERMISSIONS_MATRIX } from "./matrix";
import { RESOURCES } from "./resources";

/**
 * The `supplier` resource has two halves: this matrix (UX discipline and the
 * seed's source) and the database rows the running app actually reads. This
 * test guards the code half; the DB half lives in
 * supabase/migrations/20260817120000_create_suppliers_table.sql.
 */
describe("supplier RBAC resource", () => {
  it("is declared in the canonical resource list", () => {
    expect(RESOURCES).toContain("supplier");
  });

  it.each(["Owner", "Gestor", "Financeiro"] as const)("grants view to %s", (role) => {
    const entry = PERMISSIONS_MATRIX[role].find((p) => p.resource === "supplier");
    expect(entry).toBeDefined();
    expect(entry?.actions).toContain("view");
  });

  it.each(["Vendedor", "VendedorExterno", "SDR"] as const)("does not grant %s", (role) => {
    expect(PERMISSIONS_MATRIX[role].find((p) => p.resource === "supplier")).toBeUndefined();
  });

  it("keeps delete with the Owner only", () => {
    expect(PERMISSIONS_MATRIX.Owner.find((p) => p.resource === "supplier")?.actions).toContain(
      "delete",
    );
    expect(PERMISSIONS_MATRIX.Gestor.find((p) => p.resource === "supplier")?.actions).not.toContain(
      "delete",
    );
  });
});
