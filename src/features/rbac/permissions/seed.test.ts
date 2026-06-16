import { describe, it, expect } from "vitest";
import { PERMISSIONS_MATRIX } from "./matrix";
import { RESOURCES } from "./resources";
import { buildRoleSeed, buildResourceSeed } from "./seed";

describe("RBAC seed parity (PRD-211 RF-003)", () => {
  it("reproduces PERMISSIONS_MATRIX exactly (empty diff)", () => {
    const seed = buildRoleSeed();
    for (const role of Object.keys(PERMISSIONS_MATRIX) as (keyof typeof PERMISSIONS_MATRIX)[]) {
      const seeded = seed.find((r) => r.slug === role);
      expect(seeded, `role ${role} missing from seed`).toBeDefined();
      const norm = (perms: { resource: string; actions: readonly string[]; scope: string }[]) =>
        Object.fromEntries(perms.map((p) => [p.resource, { actions: [...p.actions].sort(), scope: p.scope }]));
      expect(norm(seeded!.permissions)).toEqual(norm(PERMISSIONS_MATRIX[role]));
    }
  });

  it("seeds all resources with label, group and order", () => {
    const resources = buildResourceSeed();
    expect(resources.length).toBe(RESOURCES.length);
    for (const key of RESOURCES) {
      const entry = resources.find((r) => r.key === key);
      expect(entry, `resource ${key} missing`).toBeDefined();
      expect(entry!.label.length).toBeGreaterThan(0);
      expect(entry!.group.length).toBeGreaterThan(0);
    }
  });
});
