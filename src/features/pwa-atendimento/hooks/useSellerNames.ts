import { useEffect, useState } from "react";
import type { ID } from "@/shared/types";
import { useSellersProvider } from "@/providers/data";
import { useCurrentStore } from "@/features/multistore";

/** "Fernanda Roth" → "Fernanda R." — the kit's compact assignee label. */
export function shortSellerName(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (!first) return fullName;
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  if (!last) return first;
  return `${first} ${last.charAt(0).toUpperCase()}.`;
}

/**
 * Assignee names for the list rows, keyed by seller id.
 *
 * Sellers are store-scoped under RLS, so a user who cannot see a colleague
 * simply gets no entry and the row falls back to the generic label — the list
 * never blocks on this lookup.
 */
export function useSellerNames(): Map<ID, string> {
  const provider = useSellersProvider();
  const { currentStoreId } = useCurrentStore();
  const [names, setNames] = useState<Map<ID, string>>(new Map());

  useEffect(() => {
    if (!currentStoreId) {
      setNames(new Map());
      return;
    }
    let cancelled = false;
    void provider
      .list({ storeId: currentStoreId })
      .then((sellers) => {
        if (cancelled) return;
        const map = new Map<ID, string>();
        for (const seller of sellers) map.set(seller.id, shortSellerName(seller.fullName));
        setNames(map);
      })
      .catch(() => {
        if (!cancelled) setNames(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [provider, currentStoreId]);

  return names;
}
