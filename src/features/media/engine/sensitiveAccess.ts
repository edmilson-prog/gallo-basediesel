import type { RoleName } from "@/shared/types";
import type { IMediaAsset } from "@/shared/types";
import { expiryUrgency } from "./sourceExpiry";

export interface IMediaViewer {
  role: RoleName;
}

/** Primary status chip per tile (D-13). One chip wins; the rest go to tooltip. */
export type MediaStatusChip = "failure" | "sensitive" | "expiring" | "none";

/** Roles allowed to view/download sensitive media (D-6). */
const SENSITIVE_ROLES: readonly RoleName[] = ["Owner", "Gestor"];

/**
 * D-6: only Owner/Gestor see sensitive bytes; everyone else is gated.
 * CANONICAL SIGNATURE: exactly ONE argument (`viewer`), role-based — Owner/Gestor
 * ⇒ true; Vendedor/SDR/VendedorExterno (and anonymous) ⇒ false. (The design spec's
 * earlier `canViewSensitive(user, asset)` two-arg sketch is superseded: sensitivity
 * gating is purely role-based, so the asset arg is unnecessary.) Plan B imports
 * `canViewSensitive(viewer)` exactly as defined here.
 */
export function canViewSensitive(viewer: IMediaViewer | null | undefined): boolean {
  if (!viewer) return false;
  return SENSITIVE_ROLES.includes(viewer.role);
}

/**
 * Strict single-chip priority for a tile (D-13):
 *   failure (not persisted) > sensitive-lock (sensitive & viewer cannot view)
 *   > expiring (source URL approaching expiry) > none.
 */
export function statusChipPriority(
  asset: IMediaAsset,
  viewer: IMediaViewer | null | undefined,
  now: Date = new Date(),
): MediaStatusChip {
  if (asset.persisted === false) return "failure";
  if (asset.sensitivity === "sensitive" && !canViewSensitive(viewer)) return "sensitive";
  if (expiryUrgency(asset.sourceExpiresAt, now) !== "none") return "expiring";
  return "none";
}
