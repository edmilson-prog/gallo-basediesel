import { describe, it, expect } from "vitest";
import { generateGoServerKeyRef } from "./goServerKeyRef";

describe("generateGoServerKeyRef", () => {
  it("builds an env-style ref from the name + suffix", () => {
    expect(generateGoServerKeyRef("AILA Go Principal", [], "x7q")).toBe(
      "WA_GO_SERVER_AILA_GO_PRINCIPAL_X7Q",
    );
  });

  it("strips accents and non-alphanumerics", () => {
    expect(generateGoServerKeyRef("São Paulo — Go", [], "ab")).toBe(
      "WA_GO_SERVER_SAO_PAULO_GO_AB",
    );
  });

  it("falls back to SERVIDOR when the name has no usable chars", () => {
    expect(generateGoServerKeyRef("!!!", [], "z")).toBe("WA_GO_SERVER_SERVIDOR_Z");
  });

  it("disambiguates against existing refs", () => {
    const taken = "WA_GO_SERVER_GO_AB";
    expect(generateGoServerKeyRef("Go", [taken], "ab")).toBe("WA_GO_SERVER_GO_AB_1");
  });

  it("always matches the secret-name pattern", () => {
    const ref = generateGoServerKeyRef("Qualquer Coisa", [], "9z");
    expect(ref).toMatch(/^[A-Z][A-Z0-9_]{2,64}$/);
  });
});
