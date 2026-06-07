import type { ID } from "@/shared/types";

/**
 * Product card payload codec (PRD-027 RF-015, D-7). The card is persisted as an
 * IMessage whose `text` is `[produto]<json>` (mirrors the `[template]` marker);
 * the IMessage schema does NOT change. `decode` round-trips and returns null on
 * any parse failure so MessageBubble can degrade to a plain TextBubble.
 */

export const PRODUCT_CARD_MARKER = "[produto]";

export interface IProductCardSnapshot {
  id: ID;
  name: string;
  oem?: string;
  equivalence?: string;
  stockLabel: string;
  stockSeverity: "ok" | "warning" | "critical";
  price?: number;
  imageRef?: string;
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function encodeProductCard(s: IProductCardSnapshot): string {
  return `${PRODUCT_CARD_MARKER}${JSON.stringify(s)}`;
}

export function decodeProductCard(text: string): IProductCardSnapshot | null {
  if (!text.startsWith(PRODUCT_CARD_MARKER)) return null;
  const json = text.slice(PRODUCT_CARD_MARKER.length);
  try {
    const parsed = JSON.parse(json) as IProductCardSnapshot;
    if (!parsed || typeof parsed.id !== "string" || typeof parsed.name !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Price text — never "R$ 0,00"; missing price degrades to a consult label. */
export function priceLabel(s: IProductCardSnapshot): string {
  if (s.price === undefined || s.price === null) return "Consultar valor";
  return BRL.format(s.price);
}

export function hasImage(s: IProductCardSnapshot): boolean {
  return typeof s.imageRef === "string" && s.imageRef.length > 0;
}
