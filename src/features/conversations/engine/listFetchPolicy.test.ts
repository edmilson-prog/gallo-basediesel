import { describe, expect, it } from "vitest";
import {
  canStartLoadMore,
  INITIAL_LOAD_MAX_ATTEMPTS,
  isLoadMoreFailure,
  isRehydrateSuperseded,
  isUserFetchSuperseded,
  nextHasMore,
  placementForIntent,
  resolveListFetchFailure,
  shouldAdoptResultTotal,
  shouldRefreshTotalViaCount,
  shouldRetryListFetch,
  shouldStartRehydrate,
} from "./listFetchPolicy";

describe("placementForIntent", () => {
  it("only load-more appends; initial and refetch replace", () => {
    expect(placementForIntent("initial")).toBe("replace");
    expect(placementForIntent("refetch")).toBe("replace");
    expect(placementForIntent("load-more")).toBe("append");
  });
});

describe("resolveListFetchFailure", () => {
  it("surfaces the error panel only when the initial load fails with nothing on screen", () => {
    expect(resolveListFetchFailure({ intent: "initial", hasItems: false })).toBe("surface");
  });

  it("keeps the stale list when a refetch fails with items on screen", () => {
    // The 2026-07-02 incident: a background refetch failed and hid 30 loaded
    // rows behind the error panel. Anything with rows visible stays silent.
    expect(resolveListFetchFailure({ intent: "refetch", hasItems: true })).toBe("silent");
  });

  it("never surfaces a load-more failure (a manual affordance is shown instead)", () => {
    expect(resolveListFetchFailure({ intent: "load-more", hasItems: false })).toBe("silent");
    expect(resolveListFetchFailure({ intent: "load-more", hasItems: true })).toBe("silent");
  });

  it("does not surface an initial retry once rows are already on screen", () => {
    expect(resolveListFetchFailure({ intent: "initial", hasItems: true })).toBe("silent");
  });
});

describe("shouldRetryListFetch", () => {
  it("retries the first load once (attempt 1 of max 2)", () => {
    expect(shouldRetryListFetch({ intent: "initial", hasItems: false, attempt: 1 })).toBe(true);
  });

  it("retries a user refetch once even with items on screen (the user just acted)", () => {
    expect(shouldRetryListFetch({ intent: "refetch", hasItems: true, attempt: 1 })).toBe(true);
  });

  it("stops after the retry budget", () => {
    expect(
      shouldRetryListFetch({ intent: "initial", hasItems: false, attempt: INITIAL_LOAD_MAX_ATTEMPTS }),
    ).toBe(false);
    expect(
      shouldRetryListFetch({ intent: "refetch", hasItems: true, attempt: INITIAL_LOAD_MAX_ATTEMPTS }),
    ).toBe(false);
  });

  it("never retries a load-more — the next attempt is a manual, user-driven one", () => {
    expect(shouldRetryListFetch({ intent: "load-more", hasItems: true, attempt: 1 })).toBe(false);
    expect(shouldRetryListFetch({ intent: "load-more", hasItems: false, attempt: 1 })).toBe(false);
  });

  it("does not retry an initial fetch once rows exist (that is a re-anchor, not a blank load)", () => {
    expect(shouldRetryListFetch({ intent: "initial", hasItems: true, attempt: 1 })).toBe(false);
  });
});

describe("isLoadMoreFailure", () => {
  it("flags only the load-more intent", () => {
    expect(isLoadMoreFailure("load-more")).toBe(true);
    expect(isLoadMoreFailure("initial")).toBe(false);
    expect(isLoadMoreFailure("refetch")).toBe(false);
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

describe("shouldAdoptResultTotal", () => {
  it("adopts a real total from a search-routed list fetch", () => {
    expect(shouldAdoptResultTotal(42)).toBe(true);
    expect(shouldAdoptResultTotal(0)).toBe(true);
  });

  it("rejects the -1 sentinel of the no-search withTotal:false path", () => {
    expect(shouldAdoptResultTotal(-1)).toBe(false);
  });
});

describe("shouldRefreshTotalViaCount", () => {
  it("refreshes via count RPC only on a page-1 replace without a supplied total", () => {
    expect(
      shouldRefreshTotalViaCount({ resultTotal: -1, placement: "replace", pageToLoad: 1 }),
    ).toBe(true);
  });

  it("never counts when the fetch already supplied the total (search path)", () => {
    expect(
      shouldRefreshTotalViaCount({ resultTotal: 42, placement: "replace", pageToLoad: 1 }),
    ).toBe(false);
  });

  it("never counts on appends or higher pages", () => {
    expect(
      shouldRefreshTotalViaCount({ resultTotal: -1, placement: "append", pageToLoad: 2 }),
    ).toBe(false);
    expect(
      shouldRefreshTotalViaCount({ resultTotal: -1, placement: "replace", pageToLoad: 2 }),
    ).toBe(false);
  });
});

describe("canStartLoadMore", () => {
  it("starts when no user fetch is in flight", () => {
    expect(canStartLoadMore({ userFetchInFlight: false })).toBe(true);
  });

  it("blocks a load-more while any user fetch is in flight (append must not start mid-fetch)", () => {
    expect(canStartLoadMore({ userFetchInFlight: true })).toBe(false);
  });
});

describe("isUserFetchSuperseded", () => {
  const base = { generation: 5, currentGeneration: 5, seqAtStart: 10, currentSeq: 10 };

  it("commits when it is still the newest user fetch", () => {
    expect(isUserFetchSuperseded(base)).toBe(false);
  });

  it("bails when a newer user fetch started (seq bumped) — a refetch superseding a load-more", () => {
    expect(isUserFetchSuperseded({ ...base, currentSeq: 11 })).toBe(true);
  });

  it("bails when the filter/mode changed (generation bumped)", () => {
    expect(isUserFetchSuperseded({ ...base, currentGeneration: 6 })).toBe(true);
  });
});

describe("shouldStartRehydrate", () => {
  it("starts only when the list is fully idle", () => {
    expect(shouldStartRehydrate({ userFetchInFlight: false, rehydrateInFlight: false })).toBe(true);
  });

  it("does not start while a user fetch is in flight (it would clobber pagination)", () => {
    expect(shouldStartRehydrate({ userFetchInFlight: true, rehydrateInFlight: false })).toBe(false);
  });

  it("does not stack a second re-hydration", () => {
    expect(shouldStartRehydrate({ userFetchInFlight: false, rehydrateInFlight: true })).toBe(false);
  });
});

describe("isRehydrateSuperseded", () => {
  const base = {
    generation: 5,
    currentGeneration: 5,
    userFetchInFlight: false,
    userFetchSeqAtStart: 10,
    currentUserFetchSeq: 10,
  };

  it("commits when nothing changed during the run", () => {
    expect(isRehydrateSuperseded(base)).toBe(false);
  });

  it("discards when the filter/mode changed (generation bumped)", () => {
    expect(isRehydrateSuperseded({ ...base, currentGeneration: 6 })).toBe(true);
  });

  it("discards when a user fetch is in flight at commit (ref-timing-immune)", () => {
    expect(isRehydrateSuperseded({ ...base, userFetchInFlight: true })).toBe(true);
  });

  it("discards when a user fetch started-and-settled during the run (seq changed)", () => {
    expect(isRehydrateSuperseded({ ...base, currentUserFetchSeq: 11 })).toBe(true);
  });
});
