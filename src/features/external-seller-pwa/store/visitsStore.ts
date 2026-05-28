import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ID, IVisit } from "@/shared/types";

const STORAGE_KEY = "gallo-pwa-visits";

interface IVisitsState {
  /** Visits created by the user during the session (persisted locally). */
  created: IVisit[];
  addVisit: (input: Omit<IVisit, "id" | "createdAt" | "status">) => IVisit;
  updateStatus: (id: ID, status: IVisit["status"]) => void;
}

function newId(): ID {
  return `visit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Local store of user-created field visits for the PWA (PRD-070). Seeded mock
 * visits are derived from the seller's portfolio by `usePwaVisits` and merged
 * with these. Fase 2 persists visits through a real provider.
 */
export const usePwaVisitsStore = create<IVisitsState>()(
  persist(
    (set, get) => ({
      created: [],
      addVisit: (input) => {
        const visit: IVisit = {
          ...input,
          id: newId(),
          status: "agendada",
          createdAt: new Date().toISOString(),
        };
        set({ created: [visit, ...get().created] });
        return visit;
      },
      updateStatus: (id, status) =>
        set({ created: get().created.map((v) => (v.id === id ? { ...v, status } : v)) }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
