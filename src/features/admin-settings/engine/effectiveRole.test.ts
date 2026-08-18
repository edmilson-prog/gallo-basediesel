import { describe, expect, it } from "vitest";
import { effectiveRoleLabel, resolveEffectiveRoleId } from "./effectiveRole";

const catalog = new Map<string, string>([
  ["Owner", "Owner"],
  ["Gestor", "Gestor"],
  ["Vendedor", "Vendedor"],
  ["VendedorExterno", "Vendedor Externo"],
  ["SDR", "SDR"],
  ["Financeiro", "Financeiro"],
  ["role-ce1033c7-12a9-439d-bf09-26ac62631c3e", "TestePapel"],
]);

describe("resolveEffectiveRoleId", () => {
  it("returns the custom role id when an override is pinned", () => {
    expect(
      resolveEffectiveRoleId({
        role: "seller_internal",
        roleId: "role-ce1033c7-12a9-439d-bf09-26ac62631c3e",
      }),
    ).toBe("role-ce1033c7-12a9-439d-bf09-26ac62631c3e");
  });

  it("maps the base DB role to the system role id when there is no override", () => {
    expect(resolveEffectiveRoleId({ role: "manager", roleId: null })).toBe("Gestor");
    expect(resolveEffectiveRoleId({ role: "seller_external", roleId: null })).toBe(
      "VendedorExterno",
    );
  });

  it("defaults to Vendedor when access info is absent", () => {
    expect(resolveEffectiveRoleId(undefined)).toBe("Vendedor");
  });
});

describe("effectiveRoleLabel", () => {
  it("returns null without access info — the caller falls back to the seller type", () => {
    expect(effectiveRoleLabel(undefined, catalog)).toBeNull();
  });

  it("shows the custom role name when the override is pinned", () => {
    expect(
      effectiveRoleLabel(
        { role: "seller_internal", roleId: "role-ce1033c7-12a9-439d-bf09-26ac62631c3e" },
        catalog,
      ),
    ).toBe("TestePapel");
  });

  it("shows the catalog display name for system roles", () => {
    expect(effectiveRoleLabel({ role: "seller_external", roleId: null }, catalog)).toBe(
      "Vendedor Externo",
    );
    expect(effectiveRoleLabel({ role: "financeiro", roleId: null }, catalog)).toBe("Financeiro");
  });

  it("falls back to a readable system label while the catalog has not loaded", () => {
    const empty = new Map<string, string>();
    expect(effectiveRoleLabel({ role: "seller_external", roleId: null }, empty)).toBe(
      "Vendedor Externo",
    );
    expect(effectiveRoleLabel({ role: "manager", roleId: null }, empty)).toBe("Gestor");
  });

  it("falls back to the base role label when the pinned role is missing from the catalog", () => {
    // e.g. the custom role was deleted after the access snapshot was taken —
    // profiles.role (the base) is the floor, so label it by the base.
    expect(
      effectiveRoleLabel(
        { role: "sdr", roleId: "role-00000000-dead-beef-0000-000000000000" },
        catalog,
      ),
    ).toBe("SDR");
  });
});
