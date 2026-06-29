import { beforeAll } from "vitest";
import { DEFAULT_SEED } from "./config";
import { resetMockStore } from "./store/mockStore";

// Reset the in-memory mock dataset to a fresh deterministic seed at the start of
// each test file. The mock store is a module-level Zustand singleton; without
// this, one file's mutations leak into another file's assertions depending on
// vitest's file scheduling (a pre-existing isolation gap). Per-file (not
// per-test) keeps cost bounded and preserves existing intra-file accumulation.
beforeAll(() => {
  resetMockStore(DEFAULT_SEED);
});
