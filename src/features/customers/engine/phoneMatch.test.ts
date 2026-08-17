import { describe, expect, it } from "vitest";
import { isSamePhone } from "./phoneMatch";

describe("isSamePhone", () => {
  it("matches the same line stored with and without the country code", () => {
    // The real shape in the base: customers.phone carries +55, an agenda
    // contact imported by another path may not.
    expect(isSamePhone("+554699198739", "4699198739")).toBe(true);
  });

  it("ignores formatting", () => {
    // `+554699198739` is 55 + DDD 46 + the 8-digit line 9919-8739 — the exact
    // shape the base stores for this contact.
    expect(isSamePhone("+55 (46) 9919-8739", "554699198739")).toBe(true);
  });

  it("matches a landline across the country-code boundary", () => {
    expect(isSamePhone("+551120981133", "1120981133")).toBe(true);
  });

  it("separates two different lines in the same DDD", () => {
    expect(isSamePhone("+554699198739", "+554699902144")).toBe(false);
  });

  it("does NOT equate the 8-digit and 9-digit forms of a mobile", () => {
    // Deliberate: silently inserting the 9th digit is how two different people
    // get merged. `46 99919-8739` and `46 9919-8739` share a tail but are not
    // the same line, and this must never guess that they are.
    expect(isSamePhone("46999198739", "4699198739")).toBe(false);
  });

  it("refuses to match when either side is too short to identify a line", () => {
    expect(isSamePhone("8739", "+554699198739")).toBe(false);
    expect(isSamePhone("+554699198739", "")).toBe(false);
  });

  it("treats null and undefined as no match, never as a wildcard", () => {
    expect(isSamePhone(null, "+554699198739")).toBe(false);
    expect(isSamePhone(undefined, undefined)).toBe(false);
    expect(isSamePhone(null, null)).toBe(false);
  });

  it("does not let a longer international number match on its tail alone", () => {
    // 15-digit rows exist in the base. Their last 10 digits must not be taken
    // for a Brazilian line.
    expect(isSamePhone("+111471749021761", "4699198739")).toBe(false);
  });
});
