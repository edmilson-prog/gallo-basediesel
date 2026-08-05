import { describe, expect, it } from "vitest";
import {
  TOTP_CODE_LENGTH,
  isCompleteTotpCode,
  normalizeTotpCode,
  pickVerifiedTotpFactor,
  resolveMfaGate,
} from "./mfaGate";

describe("resolveMfaGate", () => {
  it("reports no enrollment when the account never set up a factor", () => {
    expect(resolveMfaGate({ currentLevel: "aal1", nextLevel: "aal1" })).toBe("not_enrolled");
  });

  it("requires a challenge when a verified factor exists but was not used", () => {
    expect(resolveMfaGate({ currentLevel: "aal1", nextLevel: "aal2" })).toBe("challenge_required");
  });

  it("is satisfied once the session reached aal2", () => {
    expect(resolveMfaGate({ currentLevel: "aal2", nextLevel: "aal2" })).toBe("satisfied");
  });

  it("treats an unknown/absent assurance level as no enrollment", () => {
    // Fail OPEN: a transient read must never lock everyone out of the app.
    expect(resolveMfaGate(null)).toBe("not_enrolled");
    expect(resolveMfaGate({ currentLevel: null, nextLevel: null })).toBe("not_enrolled");
  });

  it("does not demand a challenge when the current level is already higher", () => {
    expect(resolveMfaGate({ currentLevel: "aal2", nextLevel: "aal1" })).toBe("satisfied");
  });
});

describe("pickVerifiedTotpFactor", () => {
  const verified = { id: "f1", factor_type: "totp", status: "verified" };
  const unverified = { id: "f2", factor_type: "totp", status: "unverified" };
  const phone = { id: "f3", factor_type: "phone", status: "verified" };

  it("returns the verified TOTP factor", () => {
    expect(pickVerifiedTotpFactor([unverified, verified])).toBe(verified);
  });

  it("ignores unverified factors", () => {
    expect(pickVerifiedTotpFactor([unverified])).toBeNull();
  });

  it("ignores non-TOTP factors", () => {
    expect(pickVerifiedTotpFactor([phone])).toBeNull();
  });

  it("handles an empty or missing list", () => {
    expect(pickVerifiedTotpFactor([])).toBeNull();
    expect(pickVerifiedTotpFactor(undefined)).toBeNull();
  });
});

describe("normalizeTotpCode", () => {
  it("keeps only digits", () => {
    expect(normalizeTotpCode(" 123 456 ")).toBe("123456");
    expect(normalizeTotpCode("12-34-56")).toBe("123456");
  });

  it("truncates to the code length", () => {
    expect(normalizeTotpCode("1234567890")).toBe("123456");
  });

  it("drops letters entirely", () => {
    expect(normalizeTotpCode("abc")).toBe("");
  });
});

describe("isCompleteTotpCode", () => {
  it("accepts exactly six digits", () => {
    expect(isCompleteTotpCode("123456")).toBe(true);
    expect(TOTP_CODE_LENGTH).toBe(6);
  });

  it("rejects anything shorter or malformed", () => {
    expect(isCompleteTotpCode("12345")).toBe(false);
    expect(isCompleteTotpCode("")).toBe(false);
    expect(isCompleteTotpCode("12345a")).toBe(false);
  });
});
