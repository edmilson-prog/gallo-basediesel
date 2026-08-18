import type { RoleName } from "@/shared/types";
import { mapDbRoleToRoleName } from "@/features/auth/roleMap";

/**
 * Effective platform role of a seller, for display (PRD-211).
 *
 * The access snapshot (`seller_access_info`) carries two fields: `role` is the
 * base DB role (`profiles.role`, e.g. "seller_internal") and `roleId` is the
 * custom-role override (`profiles.role_id`, null = runs on the base). The
 * user list badge and the ChangeRoleDialog both need the same resolution:
 * override wins, otherwise the system role id (=== RoleName) from the base.
 */

/** Slice of `ISellerAccessInfo` these helpers need. */
export interface IEffectiveRoleInfo {
  role: string;
  roleId: string | null;
}

/**
 * Readable labels for system role ids when the roles catalog is unavailable
 * (still loading or failed). System ids === RoleName, so only the ones whose
 * display name differs need spelling out — kept complete for exhaustiveness.
 */
const SYSTEM_ROLE_LABEL: Record<RoleName, string> = {
  Owner: "Owner",
  Gestor: "Gestor",
  Vendedor: "Vendedor",
  VendedorExterno: "Vendedor Externo",
  SDR: "SDR",
  Financeiro: "Financeiro",
  Cliente: "Cliente",
};

/**
 * Effective role id: the custom override if pinned, else the system role id
 * (=== RoleName) derived from the base role. Mirrors what `set-seller-role`
 * considers current.
 */
export function resolveEffectiveRoleId(info: IEffectiveRoleInfo | undefined): string {
  return info?.roleId ?? mapDbRoleToRoleName(info?.role ?? "seller_internal");
}

/**
 * Display label for the effective role badge, or null when the seller has no
 * platform access (no profile → no role; the caller falls back to the business
 * type). Prefers the catalog name (covers custom roles and the "Vendedor
 * Externo" spelling); degrades to the base-role label when the catalog misses
 * the id — custom role deleted, or catalog not loaded yet.
 */
export function effectiveRoleLabel(
  info: IEffectiveRoleInfo | undefined,
  roleNameById: ReadonlyMap<string, string>,
): string | null {
  if (!info) return null;
  const fromCatalog = roleNameById.get(resolveEffectiveRoleId(info));
  if (fromCatalog) return fromCatalog;
  return SYSTEM_ROLE_LABEL[mapDbRoleToRoleName(info.role)];
}
