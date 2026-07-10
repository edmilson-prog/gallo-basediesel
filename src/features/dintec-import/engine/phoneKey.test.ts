import { describe, it, expect } from "vitest";
import { normalizePhoneKey } from "./phoneKey";

describe("normalizePhoneKey", () => {
  it("strips +55 country code and returns ddd+8-digit key", () => {
    expect(normalizePhoneKey("+5517982016888")).toBe("1782016888");
  });

  it("normalizes a bare 11-digit mobile without country code", () => {
    expect(normalizePhoneKey("47992379318")).toBe("4792379318");
  });

  it("normalizes a 10-digit landline without country code", () => {
    expect(normalizePhoneKey("5130373000")).toBe("5130373000");
  });

  it("normalizes formatted input with parentheses and dash", () => {
    expect(normalizePhoneKey("(51) 99680-572")).toBe("5199680572");
  });

  it("does not special-case all-zero digits — DINTEC blanks those upstream, not this function", () => {
    expect(normalizePhoneKey("0000000000")).toBe("0000000000");
  });

  it("returns null for empty, null or undefined input", () => {
    expect(normalizePhoneKey("")).toBe(null);
    expect(normalizePhoneKey(null)).toBe(null);
    expect(normalizePhoneKey(undefined)).toBe(null);
  });

  it("returns null for a string with too few digits to contain a DDD+number", () => {
    expect(normalizePhoneKey("123")).toBe(null);
  });
});
