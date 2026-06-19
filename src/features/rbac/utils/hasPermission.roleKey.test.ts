import { afterEach, describe, expect, it } from "vitest";
import type { IRole } from "@/shared/types";
import { buildRoleSeed } from "../permissions/seed";
import { getRbacSnapshot, hydrateRbac, invalidateRbac } from "../store/rbacConfig";
import { hasPermission } from "./hasPermission";

/** Materialize the seed rows into full `IRole`s (id/slug/timestamps). */
function seedRoles(): IRole[] {
  return buildRoleSeed().map((r) => ({
    ...r,
    id: r.slug,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }));
}

/**
 * A custom role with `base_role = Vendedor` but a permission the base Vendedor
 * does NOT hold (commission / approve / store — that's a Gestor-grade grant). It
 * lets us prove `roleKey` resolves the bespoke set, distinct from the base.
 */
const CUSTOM_ROLE: IRole = {
  id: "role-custom-1",
  slug: "role-custom-1",
  name: "Vendedor Plus",
  isSystem: false,
  isOwnerImmutable: false,
  baseRole: "Vendedor",
  storeId: null,
  permissions: [{ resource: "commission", actions: ["view", "approve"], scope: "store" }],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("hasPermission — custom role assignment (roleKey)", () => {
  afterEach(() => invalidateRbac());

  it("resolves a custom role's bespoke permissions by roleKey", () => {
    hydrateRbac([...seedRoles(), CUSTOM_ROLE]);
    // Custom 'Vendedor Plus' grants commission/approve/store...
    expect(
      hasPermission({ role: "Vendedor", roleKey: "role-custom-1" }, "commission", "approve", "store"),
    ).toBe(true);
    // ...which the plain base Vendedor (no roleKey) does NOT hold.
    expect(hasPermission({ role: "Vendedor" }, "commission", "approve", "store")).toBe(false);
  });

  it("falls back to the base role when roleKey is missing from the cache", () => {
    hydrateRbac([...seedRoles(), CUSTOM_ROLE]);
    // Unknown/deleted custom slug → never worse than the base Vendedor, which
    // does hold customer/edit/own...
    expect(
      hasPermission({ role: "Vendedor", roleKey: "role-deleted" }, "customer", "edit", "own"),
    ).toBe(true);
    // ...but does not gain the custom-only grant.
    expect(
      hasPermission({ role: "Vendedor", roleKey: "role-deleted" }, "commission", "approve", "store"),
    ).toBe(false);
  });

  it("keeps base-role users byte-identical to the legacy path", () => {
    hydrateRbac(seedRoles());
    expect(hasPermission({ role: "Owner" }, "customer", "delete", "all")).toBe(true);
    expect(hasPermission({ role: "Vendedor" }, "customer", "edit", "own")).toBe(true);
    expect(hasPermission({ role: "Cliente" }, "customer", "view")).toBe(false);
  });

  it("before hydration, a custom roleKey degrades to the base static matrix", () => {
    // No hydrateRbac() → getRbacSnapshot() serves the static fallback, which has
    // no custom slug. The base-role fallback must still answer.
    expect(getRbacSnapshot().hydrated).toBe(false);
    expect(
      hasPermission({ role: "Vendedor", roleKey: "role-custom-1" }, "customer", "edit", "own"),
    ).toBe(true);
    expect(
      hasPermission({ role: "Vendedor", roleKey: "role-custom-1" }, "commission", "approve", "store"),
    ).toBe(false);
  });
});
