import { afterEach, describe, expect, it } from "vitest";
import type { IRole } from "@/shared/types";
import { buildRoleSeed } from "@/features/rbac/permissions/seed";
import { hydrateRbac, invalidateRbac } from "@/features/rbac/store/rbacConfig";
import { APP_NAV_GROUPS, isNavItemVisible, type INavItem } from "./navigation";

function seedRoles(): IRole[] {
  return buildRoleSeed().map((r) => ({
    ...r,
    id: r.slug,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }));
}

function navItem(label: string): INavItem {
  const found = APP_NAV_GROUPS.flatMap((g) => g.items).find((i) => i.label === label);
  if (!found) throw new Error(`nav item not found: ${label}`);
  return found;
}

describe("isNavItemVisible — hybrid nav gating", () => {
  afterEach(() => invalidateRbac());

  it("matrix-driven items follow the permission, not a hardcoded role list", () => {
    hydrateRbac(seedRoles());
    // Atendimento is gated by `conversation` view.
    expect(isNavItemVisible(navItem("Atendimento"), { role: "Owner" })).toBe(true);
    expect(isNavItemVisible(navItem("Atendimento"), { role: "Vendedor" })).toBe(true);
    // Gestor gains Atendimento (has conversation view) — the reported gap.
    expect(isNavItemVisible(navItem("Atendimento"), { role: "Gestor" })).toBe(true);
    // Financeiro has no conversation permission → hidden.
    expect(isNavItemVisible(navItem("Atendimento"), { role: "Financeiro" })).toBe(false);
  });

  it("role-gated structural items keep their allowlist", () => {
    hydrateRbac(seedRoles());
    expect(isNavItemVisible(navItem("Início"), { role: "Owner" })).toBe(true);
    expect(isNavItemVisible(navItem("Início"), { role: "Gestor" })).toBe(false);
    // Comissões is kept on roles (Gestor has `approve`, not `view`).
    expect(isNavItemVisible(navItem("Comissões"), { role: "Gestor" })).toBe(true);
    // DRE stays Owner-only despite the matrix granting Gestor view.
    expect(isNavItemVisible(navItem("DRE Gerencial"), { role: "Gestor" })).toBe(false);
  });

  it("custom roles drive matrix-gated items via roleKey", () => {
    const customNoConversation: IRole = {
      id: "role-noconv",
      slug: "role-noconv",
      name: "Vendedor sem inbox",
      isSystem: false,
      isOwnerImmutable: false,
      baseRole: "Vendedor",
      storeId: null,
      permissions: [{ resource: "customer", actions: ["view"], scope: "own" }],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    hydrateRbac([...seedRoles(), customNoConversation]);

    const customUser = { role: "Vendedor" as const, roleKey: "role-noconv" };
    // The custom role drops conversation → Atendimento hidden, even though the
    // base Vendedor would see it.
    expect(isNavItemVisible(navItem("Atendimento"), customUser)).toBe(false);
    expect(isNavItemVisible(navItem("Atendimento"), { role: "Vendedor" })).toBe(true);
    // ...but it keeps customer → Clientes stays visible.
    expect(isNavItemVisible(navItem("Clientes"), customUser)).toBe(true);
  });

  it("returns false for a missing user", () => {
    hydrateRbac(seedRoles());
    expect(isNavItemVisible(navItem("Atendimento"), null)).toBe(false);
    expect(isNavItemVisible(navItem("Início"), null)).toBe(false);
  });
});
