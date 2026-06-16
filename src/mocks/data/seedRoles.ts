import type { IRole, RoleName } from "@/shared/types";
import { buildRoleSeed } from "@/features/rbac/permissions/seed";

/**
 * Canonical 7 roles of the RBAC layer (PRD-006 / PRD-211).
 *
 * Derived from the single source of truth — the `PERMISSIONS_MATRIX` builder in
 * `@/features/rbac` — so the mock seed can never drift from the matrix the app
 * actually enforces. The empty-diff parity test guards that invariant.
 *
 * `id` mirrors the role `slug` (e.g. "Owner"); timestamps are a fixed instant so
 * deterministic bootstrap snapshots stay stable across reloads.
 */
const NOW = "2026-06-16T00:00:00.000Z";

export const SEED_ROLES: IRole[] = buildRoleSeed().map((r) => ({
  ...r,
  id: r.slug,
  createdAt: NOW,
  updatedAt: NOW,
}));

/** Lookup by role name — keyed by `slug` (which equals `RoleName` for system roles). */
export const SEED_ROLE_BY_NAME = new Map<RoleName, IRole>(
  SEED_ROLES.map((r) => [r.slug as RoleName, r]),
);
