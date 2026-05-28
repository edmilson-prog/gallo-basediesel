import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ID } from "@/shared/types";

const STORAGE_KEY = "gallo-pwa-seller-auth";

export interface IPwaSession {
  sellerId: ID;
  sellerName: string;
  storeId: ID;
  loggedInAt: string;
}

interface IPwaAuthState {
  session: IPwaSession | null;
  setSession: (session: IPwaSession) => void;
  clearSession: () => void;
}

/**
 * Mock auth for the external-seller PWA (PRD-070 RF-005). Independent from the
 * staff `AuthProvider` so the PWA can be installed and used standalone. Fase 2
 * replaces this with Supabase Auth scoped to `ISeller.type === 'external'`.
 */
export const usePwaAuthStore = create<IPwaAuthState>()(
  persist(
    (set) => ({
      session: null,
      setSession: (session) => set({ session }),
      clearSession: () => set({ session: null }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/** Synchronous read of the PWA session for route guards (`beforeLoad`). */
export function readPwaSessionSync(): IPwaSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { session?: IPwaSession } };
    return parsed.state?.session ?? null;
  } catch {
    return null;
  }
}
