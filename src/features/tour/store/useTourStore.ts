import { create } from "zustand";
import type { TourDef } from "../types";
import { isLastStep, nextStep, prevStep } from "../engine/tourNavigation";
import { markSeen } from "../storage/tourStorage";

interface TourRuntimeState {
  activeTour: TourDef | null;
  stepIndex: number;
  userId: string | null;
  start: (def: TourDef, userId: string) => void;
  next: () => void;
  prev: () => void;
  close: () => void;
}

export const useTourStore = create<TourRuntimeState>((set, get) => ({
  activeTour: null,
  stepIndex: 0,
  userId: null,
  start: (def, userId) => set({ activeTour: def, stepIndex: 0, userId }),
  next: () => {
    const { activeTour, stepIndex } = get();
    if (!activeTour) return;
    if (isLastStep(stepIndex, activeTour.steps.length)) {
      get().close();
      return;
    }
    set({ stepIndex: nextStep(stepIndex, activeTour.steps.length) });
  },
  prev: () => {
    const { activeTour, stepIndex } = get();
    if (!activeTour) return;
    set({ stepIndex: prevStep(stepIndex, activeTour.steps.length) });
  },
  close: () => {
    const { activeTour, userId } = get();
    if (activeTour && userId) markSeen(userId, activeTour.key);
    set({ activeTour: null, stepIndex: 0 });
  },
}));
