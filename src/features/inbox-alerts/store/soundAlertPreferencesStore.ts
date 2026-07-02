import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

const STORAGE_KEY = "gallo-sound-alerts-preferences";
const DEFAULT_VOLUME = 0.5;

interface ISoundAlertPreferencesState {
  enabled: boolean;
  volume: number;
  setEnabled: (value: boolean) => void;
  setVolume: (value: number) => void;
}

/**
 * Personal (per-browser) sound-alert preference for the Inbox beeps. A
 * Zustand store — not a plain `localStorage` + `storage`-event hook — so
 * every consumer in the SAME tab (the TopBar toggle and the global monitor)
 * reads the exact same live value the instant it changes. A `storage` event
 * only fires for OTHER tabs, never same-tab siblings, which would leave the
 * monitor's copy stale after toggling the switch in the same tab.
 */
export const useSoundAlertPreferencesStore = create<ISoundAlertPreferencesState>()(
  persist(
    (set) => ({
      enabled: true,
      volume: DEFAULT_VOLUME,
      setEnabled: (value) => set({ enabled: value }),
      setVolume: (value) => set({ volume: Math.min(1, Math.max(0, value)) }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
