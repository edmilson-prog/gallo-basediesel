import { create } from "zustand";
import { bootstrap, type IBootstrappedDataset } from "../generators/bootstrap";
import { DEFAULT_SEED, LOCALSTORAGE_SEED_KEY } from "../config";

/**
 * Internal in-memory store backing the whole mock API surface.
 *
 * ⚠️ This module is **internal** to `src/mocks/`. Features and components MUST
 * NOT import it directly — only via the API entry-points in `src/mocks/api/*`.
 * The ESLint rule in `eslint.config.js` enforces this boundary.
 */
export interface IMockStoreState extends IBootstrappedDataset {
  /** Replace the entire dataset (used by reset). */
  hydrate: (next: IBootstrappedDataset) => void;
  /** Mutate the dataset with a partial patch. */
  patch: (next: Partial<IBootstrappedDataset>) => void;
}

function persistSeed(seed: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCALSTORAGE_SEED_KEY, String(seed));
  } catch {
    // localStorage unavailable; not fatal.
  }
}

function readPersistedSeed(): number {
  if (typeof window === "undefined") return DEFAULT_SEED;
  try {
    const raw = window.localStorage.getItem(LOCALSTORAGE_SEED_KEY);
    if (raw === null) return DEFAULT_SEED;
    const n = Number(raw);
    return Number.isFinite(n) ? n : DEFAULT_SEED;
  } catch {
    return DEFAULT_SEED;
  }
}

const initialSeed = readPersistedSeed();
const initialDataset = bootstrap(initialSeed);
persistSeed(initialSeed);

export const useMockStore = create<IMockStoreState>((set) => ({
  ...initialDataset,
  hydrate: (next) => {
    persistSeed(next.seed);
    set(() => ({ ...next }));
  },
  patch: (next) => set((state) => ({ ...state, ...next })),
}));

/** Imperative accessor for code that lives outside React (APIs, generators). */
export function getMockState(): IMockStoreState {
  return useMockStore.getState();
}

/** Rebuild the dataset for a new seed and swap it atomically. */
export function resetMockStore(seed: number): IBootstrappedDataset {
  const next = bootstrap(seed);
  useMockStore.getState().hydrate(next);
  return next;
}
