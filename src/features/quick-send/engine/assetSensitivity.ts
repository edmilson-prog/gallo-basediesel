import type { IAssetLibraryItem, RoleName } from "@/shared/types";

/**
 * Asset sensitivity gates (PRD-027 D-12). Mirrors the media
 * `canViewSensitive` role policy: only Owner/Gestor may send sensitive assets.
 * `tabela_preco` is ALWAYS sensitive (single source of truth), independent of
 * the stored `sensitivity` flag, so a mis-seeded item still gates correctly.
 */

const SENSITIVE_ROLES: readonly RoleName[] = ["Owner", "Gestor"];

export function isSensitiveAsset(item: IAssetLibraryItem): boolean {
  return item.category === "tabela_preco" || item.sensitivity === "sensitive";
}

export function canSendSensitiveAsset(
  viewer: { role: RoleName } | null | undefined,
): boolean {
  if (!viewer) return false;
  return SENSITIVE_ROLES.includes(viewer.role);
}
