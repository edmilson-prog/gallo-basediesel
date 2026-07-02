import { describe, expect, it } from "vitest";
import {
  INITIAL_LOAD_MAX_ATTEMPTS,
  nextHasMore,
  resolveListFetchFailure,
  shouldRetryListFetch,
} from "./listFetchPolicy";

describe("resolveListFetchFailure", () => {
  it("surfaces the error panel only when a replace fails with nothing on screen", () => {
    expect(resolveListFetchFailure({ fetchMode: "replace", hasItems: false })).toBe("surface");
  });

  it("keeps the stale list when a background replace fails with items on screen", () => {
    // The 2026-07-02 incident: a realtime-tick refetch failed and hid 30 loaded
    // rows behind the error panel. Background failures must stay silent.
    expect(resolveListFetchFailure({ fetchMode: "replace", hasItems: true })).toBe("silent");
  });

  it("never surfaces append (infinite-scroll / re-hydration) failures", () => {
    expect(resolveListFetchFailure({ fetchMode: "append", hasItems: false })).toBe("silent");
    expect(resolveListFetchFailure({ fetchMode: "append", hasItems: true })).toBe("silent");
  });
});

describe("shouldRetryListFetch", () => {
  it("retries the first load once (attempt 1 of max 2)", () => {
    expect(shouldRetryListFetch({ fetchMode: "replace", hasItems: false, attempt: 1 })).toBe(true);
  });

  it("stops after the retry budget", () => {
    expect(
      shouldRetryListFetch({
        fetchMode: "replace",
        hasItems: false,
        attempt: INITIAL_LOAD_MAX_ATTEMPTS,
      }),
    ).toBe(false);
  });

  it("does not retry background refetches — the next realtime tick is the retry", () => {
    expect(shouldRetryListFetch({ fetchMode: "replace", hasItems: true, attempt: 1 })).toBe(false);
  });

  it("does not retry appends", () => {
    expect(shouldRetryListFetch({ fetchMode: "append", hasItems: false, attempt: 1 })).toBe(false);
  });
});

describe("nextHasMore", () => {
  it("a full page means there may be more", () => {
    expect(nextHasMore(30, 30)).toBe(true);
  });

  it("a short page means the end was reached", () => {
    expect(nextHasMore(12, 30)).toBe(false);
    expect(nextHasMore(0, 30)).toBe(false);
  });
});
