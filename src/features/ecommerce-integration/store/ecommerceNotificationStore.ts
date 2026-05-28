import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ID } from "@/shared/types";

const STORAGE_KEY = "gallo-ecommerce-notifications";
const MAX_ENTRIES = 50;

/**
 * A seller-facing notification raised when a new e-commerce order arrives
 * (PRD-067 RF-008). On the MVP this is the "central de notificações" — a
 * persisted, single-browser stand-in for the per-seller push channel that
 * Fase 2 (PRD-100) will replace.
 */
export interface IEcommerceNotification {
  id: ID;
  /** Seller the notification is addressed to; null = pending manager distribution. */
  sellerId: ID | null;
  orderId: ID;
  conversationId?: ID;
  orderNumber: string;
  customerName: string;
  total: number;
  /** `pending_distribution` when no seller was assigned (manager mode). */
  kind: "new_order" | "pending_distribution";
  createdAt: string;
  /** Whether the addressee has already seen a toast for this entry. */
  seen: boolean;
}

interface IEcommerceNotificationState {
  notifications: IEcommerceNotification[];
  push: (input: Omit<IEcommerceNotification, "id" | "createdAt" | "seen">) => IEcommerceNotification;
  markSeen: (id: ID) => void;
  markAllSeenForSeller: (sellerId: ID) => void;
  clearForSeller: (sellerId: ID) => void;
}

function newId(): ID {
  return `ecn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useEcommerceNotificationStore = create<IEcommerceNotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],

      push: (input) => {
        const entry: IEcommerceNotification = {
          ...input,
          id: newId(),
          createdAt: new Date().toISOString(),
          seen: false,
        };
        set({ notifications: [entry, ...get().notifications].slice(0, MAX_ENTRIES) });
        return entry;
      },

      markSeen: (id) =>
        set({
          notifications: get().notifications.map((n) => (n.id === id ? { ...n, seen: true } : n)),
        }),

      markAllSeenForSeller: (sellerId) =>
        set({
          notifications: get().notifications.map((n) =>
            n.sellerId === sellerId ? { ...n, seen: true } : n,
          ),
        }),

      clearForSeller: (sellerId) =>
        set({
          notifications: get().notifications.filter((n) => n.sellerId !== sellerId),
        }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/** Count of unseen notifications addressed to a seller (drives the sidebar badge). */
export function selectUnseenCountForSeller(sellerId: ID | null) {
  return (state: IEcommerceNotificationState): number =>
    state.notifications.filter((n) => n.sellerId === sellerId && !n.seen).length;
}
