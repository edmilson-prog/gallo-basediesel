import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ID, ISO8601 } from "@/shared/types";

const STORAGE_KEY = "gallo-insight-dismissals";

export interface IInsightDismissal {
  insightId: string;
  dismissedBy: ID;
  dismissedAt: ISO8601;
  reason?: string;
  /** ISO8601 — beyond this point, the engine may surface the insight again. */
  validUntil?: ISO8601;
  /** Snapshot of the insight at dismissal so the "Dispensados" tab keeps history. */
  snapshot: {
    type: string;
    title: string;
    description: string;
    storeId: ID;
    detectedAt: ISO8601;
  };
}

interface IDismissalsState {
  byId: Record<string, IInsightDismissal>;
  dismiss: (entry: IInsightDismissal) => void;
  undo: (insightId: string) => void;
  clear: () => void;
}

/**
 * Persistent storage for dismissals of insights — single source of truth on
 * the Fase 1 MVP. Stored in `localStorage` under `gallo-insight-dismissals`.
 *
 * Insight ids are stable (`ins-<type>-<key>`) so recreating an active insight
 * with the same id keeps the dismissal effective until `validUntil` passes.
 */
export const useDismissalsStore = create<IDismissalsState>()(
  persist(
    (set) => ({
      byId: {},
      dismiss: (entry) =>
        set((state) => ({
          byId: { ...state.byId, [entry.insightId]: entry },
        })),
      undo: (insightId) =>
        set((state) => {
          if (!state.byId[insightId]) return state;
          const next = { ...state.byId };
          delete next[insightId];
          return { byId: next };
        }),
      clear: () => set({ byId: {} }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/** Returns true when `insightId` is dismissed AND its `validUntil` is still in the future. */
export function isStillDismissed(
  insightId: string,
  validUntil: ISO8601 | undefined,
  dismissals: Record<string, IInsightDismissal>,
  now: Date,
): boolean {
  const entry = dismissals[insightId];
  if (!entry) return false;
  const limit = entry.validUntil ?? validUntil;
  if (!limit) return true;
  return new Date(limit).getTime() > now.getTime();
}
