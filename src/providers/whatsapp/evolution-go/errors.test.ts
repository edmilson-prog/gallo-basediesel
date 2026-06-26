import { describe, expect, it } from "vitest";
import { mapEvolutionGoError } from "./errors";

describe("mapEvolutionGoError", () => {
  it.each([
    [401, { message: "Invalid or missing API key" }, "UNAUTHORIZED"],
    [403, { message: "forbidden" }, "UNAUTHORIZED"],
    [404, { message: "Instance not found" }, "NOT_FOUND"],
    [429, { message: "rate limit" }, "RATE_LIMITED"],
    [500, { message: "boom" }, "INTEGRATION_ERROR"],
  ])("HTTP %i → %s", (status, body, expected) => {
    expect(mapEvolutionGoError(status, body, "/send/text").code).toBe(expected);
  });

  it("maps a not-logged-in/closed session to PROVIDER_DISCONNECTED", () => {
    const err = mapEvolutionGoError(400, { message: "instance not connected" }, "/send/text");
    expect(err.code).toBe("PROVIDER_DISCONNECTED");
    expect(err.httpStatus).toBe(503);
  });

  it("never leaks the body verbatim into details without the endpoint", () => {
    const err = mapEvolutionGoError(500, { message: "x" }, "/send/text");
    expect(err.details).toMatchObject({ endpoint: "/send/text" });
  });

  it("maps a 403 'already in use' name conflict to INTEGRATION_ERROR with the message intact", () => {
    const err = mapEvolutionGoError(403, { message: "instance already in use" }, "/instance/create");
    expect(err.code).toBe("INTEGRATION_ERROR");
    expect(err.message).toBe("instance already in use");
    expect(err.details).toMatchObject({ endpoint: "/instance/create" });
  });
});
