import { afterEach, describe, expect, it } from "vitest";
import type { IRole } from "@/shared/types";
import { buildRoleSeed } from "../permissions/seed";
import { hasPermission } from "../utils/hasPermission";
import { getRbacSnapshot, hydrateRbac, invalidateRbac } from "./rbacConfig";

/** Materialize the seed rows into full `IRole`s (id/timestamps assigned here). */
function seedRoles(): IRole[] {
  return buildRoleSeed().map((r) => ({
    ...r,
    id: r.slug,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }));
}

describe("rbacConfig — in-memory RBAC cache (PRD-211 Task 8)", () => {
  // The cache is a module-level singleton; reset after every test.
  afterEach(() => {
    invalidateRbac();
  });

  describe("before hydration (static fallback)", () => {
    it("reports hydrated=false and mirrors the static matrix", () => {
      const snap = getRbacSnapshot();
      expect(snap.hydrated).toBe(false);
      // Owner has `customer` with scope `all`.
      expect(snap.byRole.Owner?.customer).toBeDefined();
      expect(snap.byRole.Owner?.customer?.scope).toBe("all");
      expect(snap.byRole.Owner?.customer?.actions.has("delete")).toBe(true);
    });

    it("omits resources a restricted role does not hold", () => {
      const snap = getRbacSnapshot();
      // Cliente has no access to the `commission` resource.
      expect(snap.byRole.Cliente?.commission).toBeUndefined();
      // ...and `customer` is not granted to Cliente at all.
      expect(snap.byRole.Cliente?.customer).toBeUndefined();
    });

    it("hasPermission matches the static matrix before hydration", () => {
      expect(hasPermission({ role: "Owner" }, "customer", "delete", "all")).toBe(true);
      expect(hasPermission({ role: "Vendedor" }, "customer", "edit", "own")).toBe(true);
      // Vendedor's customer scope is `own`, so `store` is not satisfied.
      expect(hasPermission({ role: "Vendedor" }, "customer", "edit", "store")).toBe(false);
      // Cliente cannot view customers.
      expect(hasPermission({ role: "Cliente" }, "customer", "view")).toBe(false);
    });
  });

  describe("after hydrateRbac()", () => {
    it("serves the hydrated matrix and flips hydrated=true", () => {
      hydrateRbac(seedRoles());
      const snap = getRbacSnapshot();
      expect(snap.hydrated).toBe(true);
      expect(snap.byRole.Owner?.customer?.scope).toBe("all");
      expect(snap.byRole.Gestor?.customer?.scope).toBe("store");
    });

    it("keeps hasPermission results consistent with the seed", () => {
      hydrateRbac(seedRoles());
      expect(hasPermission({ role: "Owner" }, "role", "edit", "all")).toBe(true);
      expect(hasPermission({ role: "Gestor" }, "commission", "approve", "store")).toBe(true);
      expect(hasPermission({ role: "SDR" }, "lead", "create", "own")).toBe(true);
      expect(hasPermission({ role: "SDR" }, "lead", "delete")).toBe(false);
    });

    it("indexes permissions by role slug", () => {
      const roles = seedRoles();
      hydrateRbac(roles);
      const snap = getRbacSnapshot();
      for (const role of roles) {
        expect(snap.byRole[role.slug]).toBeDefined();
      }
    });
  });

  describe("invalidateRbac()", () => {
    it("returns to the static fallback", () => {
      hydrateRbac(seedRoles());
      expect(getRbacSnapshot().hydrated).toBe(true);

      invalidateRbac();
      const snap = getRbacSnapshot();
      expect(snap.hydrated).toBe(false);
      // Fallback still answers correctly.
      expect(snap.byRole.Owner?.customer?.scope).toBe("all");
      expect(hasPermission({ role: "Owner" }, "customer", "delete", "all")).toBe(true);
    });
  });
});
