import { describe, expect, it } from "vitest";
import { WhatsAppProviderError } from "../errors";
import { mapOpenWaError } from "./errors";

describe("mapOpenWaError", () => {
  it("maps 401/403 to UNAUTHORIZED", () => {
    const err401 = mapOpenWaError(401, { message: "invalid token" }, "/instance/x/send-text");
    expect(err401).toBeInstanceOf(WhatsAppProviderError);
    expect(err401.code).toBe("UNAUTHORIZED");

    const err403 = mapOpenWaError(403, { error: "Forbidden" }, "/instance/x/send-text");
    expect(err403.code).toBe("UNAUTHORIZED");
  });

  it("maps a 404 mentioning session/instance to NOT_FOUND", () => {
    const err = mapOpenWaError(404, { message: "session not found" }, "/instance/x/status");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.httpStatus).toBe(404);
  });

  it("does not map a generic 404 (no session/instance wording) to NOT_FOUND", () => {
    const err = mapOpenWaError(404, { message: "route missing" }, "/instance/x/unknown");
    expect(err.code).not.toBe("NOT_FOUND");
  });

  it("maps disconnected/logged-out wording to PROVIDER_DISCONNECTED 503", () => {
    const err = mapOpenWaError(400, { message: "Session is disconnected" }, "/instance/x/send-text");
    expect(err.code).toBe("PROVIDER_DISCONNECTED");
    expect(err.httpStatus).toBe(503);
  });

  it("falls back to a generic INTEGRATION_ERROR 502 for unmapped statuses", () => {
    const err = mapOpenWaError(500, { message: "boom" }, "/instance/x/send-text");
    expect(err.code).toBe("INTEGRATION_ERROR");
    expect(err.httpStatus).toBe(502);
    expect(err.message).toContain("boom");
  });

  it("keeps details without leaking secrets — endpoint and message only", () => {
    const err = mapOpenWaError(500, { message: "boom" }, "/instance/x/send-text");
    expect(JSON.stringify(err.details)).not.toMatch(/apikey|bearer/i);
  });
});
