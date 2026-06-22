import { describe, expect, it } from "vitest";
import { WhatsAppProviderError } from "../errors";
import { mapEvolutionError } from "./errors";

describe("mapEvolutionError", () => {
  it("maps a 403 'already in use' as a non-auth error keeping the original message", () => {
    // Evolution returns 403 Forbidden for a name conflict on /instance/create —
    // NOT an auth failure. The original text must survive so the idempotent
    // createInstance guard can recognise it (regression: it used to be masked
    // as UNAUTHORIZED with "API key inválida").
    const body = {
      error: "Forbidden",
      status: 403,
      response: { message: ['This name "comercial-lucas-utn" is already in use.'] },
    };
    const err = mapEvolutionError(403, body, "/instance/create");
    expect(err).toBeInstanceOf(WhatsAppProviderError);
    expect(err.code).not.toBe("UNAUTHORIZED");
    expect(err.message.toLowerCase()).toContain("already in use");
  });

  it("still maps a genuine 401 (bad apikey) to UNAUTHORIZED", () => {
    const err = mapEvolutionError(401, { message: "invalid apikey" }, "/instance/connect/x");
    expect(err.code).toBe("UNAUTHORIZED");
  });

  it("still maps a genuine 403 (no conflict message) to UNAUTHORIZED", () => {
    const err = mapEvolutionError(403, { message: "Forbidden" }, "/message/sendText/x");
    expect(err.code).toBe("UNAUTHORIZED");
  });
});
