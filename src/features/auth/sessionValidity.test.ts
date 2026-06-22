import { describe, expect, it } from "vitest";
import { isInvalidSessionError } from "./sessionValidity";

describe("isInvalidSessionError", () => {
  it("returns false when there is no error (valid session)", () => {
    expect(isInvalidSessionError(null)).toBe(false);
    expect(isInvalidSessionError(undefined)).toBe(false);
  });

  it("treats a 401 / 403 as a dead session", () => {
    expect(isInvalidSessionError({ name: "AuthApiError", status: 401 })).toBe(true);
    expect(isInvalidSessionError({ name: "AuthApiError", status: 403 })).toBe(true);
  });

  it("treats the dead-session error codes as a dead session", () => {
    expect(isInvalidSessionError({ code: "session_not_found" })).toBe(true);
    expect(isInvalidSessionError({ code: "session_expired" })).toBe(true);
    expect(isInvalidSessionError({ code: "refresh_token_not_found" })).toBe(true);
  });

  it("does NOT log out on a transient network error (must keep the user in)", () => {
    expect(isInvalidSessionError({ name: "AuthRetryableFetchError", status: 0 })).toBe(false);
    expect(isInvalidSessionError({ name: "AuthRetryableFetchError" })).toBe(false);
  });

  it("does NOT log out on a 5xx server error (transient)", () => {
    expect(isInvalidSessionError({ name: "AuthApiError", status: 500 })).toBe(false);
    expect(isInvalidSessionError({ name: "AuthApiError", status: 503 })).toBe(false);
  });

  it("is conservative: an unknown error without status or code keeps the user in", () => {
    expect(isInvalidSessionError({ name: "AuthUnknownError" })).toBe(false);
    expect(isInvalidSessionError({})).toBe(false);
  });

  it("never lets a retryable error win even if it carries a 401-ish status", () => {
    // Network failures sometimes surface with odd statuses; the retryable name
    // is the authoritative signal that this is transient, not an auth rejection.
    expect(isInvalidSessionError({ name: "AuthRetryableFetchError", status: 401 })).toBe(false);
  });
});
