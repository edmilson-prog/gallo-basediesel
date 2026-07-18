import { describe, expect, it } from "vitest";
import { WhatsAppProviderError } from "../errors";
import { mapWahaError } from "./errors";

describe("mapWahaError", () => {
  it("maps 401 to UNAUTHORIZED", () => {
    const err = mapWahaError(401, { error: "invalid api key" }, "/api/sessions");
    expect(err).toBeInstanceOf(WhatsAppProviderError);
    expect(err.code).toBe("UNAUTHORIZED");
    expect(err.httpStatus).toBe(401);
  });

  it("maps 404 to NOT_FOUND", () => {
    const err = mapWahaError(404, { message: "session not found" }, "/api/sessions/foo");
    expect(err.code).toBe("NOT_FOUND");
  });

  it("maps 429 to RATE_LIMITED", () => {
    const err = mapWahaError(429, {}, "/api/sendText");
    expect(err.code).toBe("RATE_LIMITED");
  });

  it("falls back to INTEGRATION_ERROR with the raw message for unmapped statuses", () => {
    const err = mapWahaError(500, { message: "boom" }, "/api/sessions");
    expect(err.code).toBe("INTEGRATION_ERROR");
    expect(err.message).toContain("boom");
  });
});
