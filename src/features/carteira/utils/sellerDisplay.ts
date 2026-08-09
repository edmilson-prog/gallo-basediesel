import type { ISeller } from "@/shared/types";

const ROLE_LABEL: Record<ISeller["type"], string> = {
  internal: "Vendedor interno",
  external: "Vendedor externo",
  representative: "Representante",
};

/** Two-letter monogram for the avatar fallback: first + last name initial. */
export function sellerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0] ?? "?";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  return ((first[0] ?? "?") + (last[0] ?? "?")).toUpperCase();
}

/**
 * First + last name. Full legal names ("Fernando Mello Muniz Gallo") overflow
 * every column on this board; the middle names carry no signal here.
 */
export function sellerShortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return name.trim();
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

/** Just the first name — for inline prose where the column is already labelled. */
export function sellerFirstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function sellerRoleLabel(seller: ISeller): string {
  return ROLE_LABEL[seller.type];
}
