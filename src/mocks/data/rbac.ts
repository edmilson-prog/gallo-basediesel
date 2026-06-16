import type { IDepartment, IRbacResource } from "@/shared/types";
import { buildResourceSeed } from "@/features/rbac/permissions/seed";
import { SEED_STORE_ID } from "./seedStore";
import { SEED_OWNER_ID } from "./seedSellers";

/**
 * RBAC resource catalog (PRD-211).
 *
 * Derived from the single source of truth — the `buildResourceSeed()` builder in
 * `@/features/rbac` — so the mock catalog can never drift from the matrix the app
 * actually enforces (parity guarded by `seed.test.ts`). Mirrors `SEED_ROLES` in
 * `./seedRoles.ts`, which builds roles from the same source.
 */
export const SEED_RBAC_RESOURCES: IRbacResource[] = buildResourceSeed();

/**
 * Fixed instant for deterministic bootstrap snapshots (matches `SEED_ROLES`).
 */
const NOW = "2026-06-16T00:00:00.000Z";

/**
 * Example Departments (PRD-211 — revived `ITeam`).
 *
 * Store-scoped to the headquarters store. A single demo department groups the
 * internal parts team under the Owner so the feature can be demoed; the IDs
 * reference real mock sellers so referential integrity holds.
 *
 * NOTE: the production `departments` table derives membership from
 * `sellers.department_id` (no member column). The `IDepartment` (= `ITeam`)
 * domain type still carries `sellerIds`, so the mock seed populates it directly
 * — the mock store is the source of truth in mock mode. The Supabase provider
 * (Task 6) reconstructs `sellerIds` from the sellers side.
 */
export const SEED_DEPARTMENTS: IDepartment[] = [
  {
    id: "dept-balcao-pecas",
    name: "Balcão de Peças",
    storeId: SEED_STORE_ID,
    managerId: SEED_OWNER_ID,
    sellerIds: [
      "seller-carlos-santos",
      "seller-rafael-lima",
      "seller-ramon-schimidt",
    ],
    createdAt: NOW,
  },
];
