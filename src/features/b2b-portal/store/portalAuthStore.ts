import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ID, PortalUserRole } from "@/shared/types";

const STORAGE_KEY = "gallo-portal-b2b-auth";

export interface IPortalSession {
  portalUserId: ID;
  customerId: ID;
  userName: string;
  role: PortalUserRole;
  storeId: ID;
  loggedInAt: string;
}

interface IPortalAuthState {
  session: IPortalSession | null;
  setSession: (session: IPortalSession) => void;
  clearSession: () => void;
}

/**
 * Mock auth for the B2B corporate portal (PRD-071 RF-007/008). Independent
 * from staff and storefront auth. Fase 2 replaces it with Supabase Auth +
 * custom claims carrying the portal role.
 */
export const usePortalAuthStore = create<IPortalAuthState>()(
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

/** Synchronous session read for route guards (`beforeLoad`). */
export function readPortalSessionSync(): IPortalSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { session?: IPortalSession } };
    return parsed.state?.session ?? null;
  } catch {
    return null;
  }
}
