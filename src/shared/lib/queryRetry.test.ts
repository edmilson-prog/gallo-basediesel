import { describe, it, expect } from "vitest";
import { isServerOverloadError, shouldRetryQuery, QUERY_MAX_RETRIES } from "./queryRetry";

describe("isServerOverloadError", () => {
  it("detects the Postgres statement timeout PostgREST turns into a 500", () => {
    // Verbatim message of the 2026-08-11 Inbox incident, as the provider
    // re-throws it: `[supabase] conversations.list failed: ${error.message}`.
    expect(
      isServerOverloadError(
        new Error(
          "[supabase] conversations.list failed: canceling statement due to statement timeout",
        ),
      ),
    ).toBe(true);
  });

  it("detects it by SQLSTATE too, for callers that keep the code", () => {
    expect(isServerOverloadError(new Error("query failed (57014)"))).toBe(true);
    expect(isServerOverloadError({ code: "57014" })).toBe(true);
  });

  it("detects connection-slot exhaustion", () => {
    expect(
      isServerOverloadError(
        new Error("remaining connection slots are reserved for roles with the SUPERUSER attribute"),
      ),
    ).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isServerOverloadError(new Error("Canceling Statement Due To Statement Timeout"))).toBe(
      true,
    );
  });

  it("does NOT flag ordinary failures — those still deserve a retry", () => {
    expect(isServerOverloadError(new Error("Failed to fetch"))).toBe(false);
    expect(isServerOverloadError(new Error("NetworkError when attempting to fetch resource"))).toBe(
      false,
    );
    expect(isServerOverloadError(new Error("[supabase] customers.get failed: not found"))).toBe(
      false,
    );
  });

  it("never throws on odd inputs", () => {
    expect(isServerOverloadError(null)).toBe(false);
    expect(isServerOverloadError(undefined)).toBe(false);
    expect(isServerOverloadError("timeout")).toBe(false);
    expect(isServerOverloadError({})).toBe(false);
  });
});

describe("shouldRetryQuery", () => {
  it("never retries an overloaded server — a repeat costs another 8s connection", () => {
    const overload = new Error("canceling statement due to statement timeout");
    expect(shouldRetryQuery(0, overload)).toBe(false);
  });

  it("retries an ordinary failure, but far less than the library default of 3", () => {
    const blip = new Error("Failed to fetch");
    expect(shouldRetryQuery(0, blip)).toBe(true);
    expect(shouldRetryQuery(QUERY_MAX_RETRIES, blip)).toBe(false);
  });

  it("caps retries at QUERY_MAX_RETRIES", () => {
    const blip = new Error("Failed to fetch");
    for (let i = 0; i < QUERY_MAX_RETRIES; i += 1) {
      expect(shouldRetryQuery(i, blip)).toBe(true);
    }
    expect(shouldRetryQuery(QUERY_MAX_RETRIES, blip)).toBe(false);
    expect(shouldRetryQuery(QUERY_MAX_RETRIES + 5, blip)).toBe(false);
  });

  it("keeps the cap below the TanStack default (3) — that is the whole point", () => {
    expect(QUERY_MAX_RETRIES).toBeLessThan(3);
  });
});
