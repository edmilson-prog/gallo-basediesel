import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { usePartsProvider } from "@/providers/data/hooks/usePartsProvider";
import { useCartStore } from "@/features/storefront/store/cartStore";
import { STOREFRONT_CART_STRINGS as S } from "../i18n/pt-BR";

const STORE_ID = "store-matriz";
const STALE_MS = 5 * 60 * 1000;

/**
 * Cart hydration / validation guard (PRD-064 RF-038/039/040).
 *
 * Runs once per cart mutation. Compares each cart line against the live
 * catalog and:
 *   - removes items whose part is gone or out of stock,
 *   - clamps quantities greater than `stockAvailable` to the available cap,
 * surfacing a toast for the user in either case.
 *
 * The reconciliation key is a fingerprint of `partId+quantity` so we don't
 * loop forever when our own setQuantity / removeItem triggers a re-run.
 */
export function useCartValidation(): void {
  const items = useCartStore((s) => s.items);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const partsProvider = usePartsProvider();

  const partsQuery = useQuery({
    queryKey: ["storefront-cart", "validation-parts"] as const,
    queryFn: async () => {
      const r = await partsProvider.list({ storeId: STORE_ID, pageSize: 2000 });
      return r.data;
    },
    staleTime: STALE_MS,
    enabled: items.length > 0,
  });

  const fingerprintRef = useRef<string>("");

  useEffect(() => {
    const parts = partsQuery.data;
    if (!parts || items.length === 0) return;

    // Skip when nothing changed since the last reconciliation.
    const fingerprint = items.map((i) => `${i.partId}:${i.quantity}`).join("|");
    if (fingerprint === fingerprintRef.current) return;
    fingerprintRef.current = fingerprint;

    const byId = new Map(parts.map((p) => [p.id, p] as const));
    for (const item of items) {
      const live = byId.get(item.partId);
      if (!live || !live.active || live.stockAvailable <= 0) {
        removeItem(item.partId);
        toast.error(S.cartItemRemovedAuto(item.partName));
        continue;
      }
      if (item.quantity > live.stockAvailable) {
        setQuantity(item.partId, live.stockAvailable);
        toast.warning(S.cartItemStockClamped(item.partName, live.stockAvailable));
      }
    }
  }, [partsQuery.data, items, removeItem, setQuantity]);
}
