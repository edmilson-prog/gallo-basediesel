import { beforeAll } from "vitest";
import { DEFAULT_SEED } from "./config";
import { resetMockStore } from "./store/mockStore";

/**
 * Opt-in mock-store isolation. Call once at module scope in any test file that
 * reads or mutates the in-memory mock dataset (a mock provider or the mock API).
 * It resets the module-level Zustand singleton to a fresh deterministic seed
 * before the file's tests run, so mutations from a previously-scheduled file in
 * the same worker can't leak in. Per-file (not per-test) keeps the cost bounded
 * and preserves the intra-file accumulation some suites rely on.
 *
 * Why opt-in instead of a global `setupFiles`: importing the mock store triggers
 * the dataset bootstrap. Registering the reset globally forced every pure-logic
 * test — which never touches the mock layer — to pay that bootstrap too
 * (~250 ms → ~1.6 s per file). Only the handful of files that actually touch the
 * store call this.
 */
export function resetMockStorePerFile(): void {
  beforeAll(() => {
    resetMockStore(DEFAULT_SEED);
  });
}
