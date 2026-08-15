import { describe, expect, it } from "vitest";
import { shouldResetSessionCache } from "./sessionCacheReset";

describe("shouldResetSessionCache — when the query cache must be dropped", () => {
  it("does nothing on the first observation", () => {
    // Boot: there is no previous identity to leave behind, and the cache is empty.
    expect(shouldResetSessionCache(undefined, null)).toBe(false);
    expect(shouldResetSessionCache(undefined, "user-a")).toBe(false);
  });

  it("does nothing while the identity holds", () => {
    // The hourly TOKEN_REFRESHED re-resolves the profile and hands back a NEW
    // object with the same id. Keying on the object would wipe the cache of a
    // working session every hour — key on the id.
    expect(shouldResetSessionCache("user-a", "user-a")).toBe(false);
    expect(shouldResetSessionCache(null, null)).toBe(false);
  });

  it("does nothing when signing in from a signed-out app", () => {
    // Nothing private is cached under an anonymous session (RLS returns
    // nothing), so there is no reason to pay for a full refetch here.
    expect(shouldResetSessionCache(null, "user-a")).toBe(false);
  });

  it("resets on sign-out", () => {
    expect(shouldResetSessionCache("user-a", null)).toBe(true);
  });

  it("resets when another user takes over the tab", () => {
    expect(shouldResetSessionCache("user-a", "user-b")).toBe(true);
  });
});
