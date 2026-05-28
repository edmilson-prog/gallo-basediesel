import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ID, Money } from "@/shared/types";

const STORAGE_KEY = "gallo-storefront-cart";

export interface ICartItem {
  partId: ID;
  partName: string;
  partSku: string;
  partOemCode?: string;
  unitPrice: Money;
  quantity: number;
  /** Optional image url (snapshotted from the catalog). */
  imageUrl?: string;
  /** ISO timestamp the item was first added — set on the first insertion only. */
  addedAt?: string;
}

interface ICartState {
  items: ICartItem[];
  /** Adds the item. When the part is already in the cart, quantity is incremented. */
  addItem: (item: ICartItem) => void;
  removeItem: (partId: ID) => void;
  setQuantity: (partId: ID, quantity: number) => void;
  clear: () => void;
}

/**
 * Shopping-cart state for the public storefront (PRD-060 + PRD-064).
 *
 * Persists in `localStorage` under `gallo-storefront-cart` so anonymous
 * shoppers don't lose context on reload. Fase 2 will sync this to the
 * authenticated cart in Supabase.
 */
export const useCartStore = create<ICartState>()(
  persist(
    (set) => ({
      items: [],
      addItem: (item) =>
        set((state) => {
          const idx = state.items.findIndex((i) => i.partId === item.partId);
          if (idx === -1) {
            return {
              items: [
                ...state.items,
                { ...item, addedAt: item.addedAt ?? new Date().toISOString() },
              ],
            };
          }
          const next = [...state.items];
          next[idx] = { ...next[idx], quantity: next[idx].quantity + item.quantity };
          return { items: next };
        }),
      removeItem: (partId) =>
        set((state) => ({ items: state.items.filter((i) => i.partId !== partId) })),
      setQuantity: (partId, quantity) =>
        set((state) => {
          if (quantity <= 0) {
            return { items: state.items.filter((i) => i.partId !== partId) };
          }
          return {
            items: state.items.map((i) => (i.partId === partId ? { ...i, quantity } : i)),
          };
        }),
      clear: () => set({ items: [] }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/** Selector — total quantity of units across the cart. */
export function selectCartCount(state: { items: ICartItem[] }): number {
  let total = 0;
  for (const item of state.items) total += item.quantity;
  return total;
}

/** Selector — sum of `unitPrice * quantity` across the cart. */
export function selectCartSubtotal(state: { items: ICartItem[] }): number {
  let subtotal = 0;
  for (const item of state.items) subtotal += item.unitPrice * item.quantity;
  return subtotal;
}
