import { describe, it, expect } from "vitest";
import { dintecDialPhone, normalizePhoneKey } from "./phoneKey";

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

describe("dintecDialPhone — mandatory dial format for DINTEC loads", () => {
  it("prefixes +55 on a bare 11-digit mobile with valid DDD", () => {
    expect(dintecDialPhone("54999887766")).toBe("+5554999887766");
  });

  it("prefixes +55 on a bare 10-digit landline with valid DDD", () => {
    expect(dintecDialPhone("5437441234")).toBe("+555437441234");
  });

  it("normalizes formatted ERP input (parentheses, dash, spaces)", () => {
    expect(dintecDialPhone("(54) 99988-7766")).toBe("+5554999887766");
  });

  it("adds only the + when the ERP value already carries the 55 DDI", () => {
    expect(dintecDialPhone("5554981169884")).toBe("+5554981169884");
    expect(dintecDialPhone("555498152275")).toBe("+555498152275");
  });

  it("trusts an explicit + prefix (international numbers untouched)", () => {
    expect(dintecDialPhone("+56995070445")).toBe("+56995070445");
    expect(dintecDialPhone("+59173626401")).toBe("+59173626401");
  });

  it("never inserts the 9th digit (PR #302 — only WhatsApp confirms it)", () => {
    // 10-digit value with a mobile-looking core stays exactly as given, +55'd.
    expect(dintecDialPhone("5496978025")).toBe("+555496978025");
  });

  it("returns invalid-DDD values verbatim for assisted triage (never wrong-country '+')", () => {
    expect(dintecDialPhone("57996445339")).toBe("57996445339");
    expect(dintecDialPhone("59996557765")).toBe("59996557765");
  });

  it("returns trunk-zero values verbatim", () => {
    expect(dintecDialPhone("05499887766")).toBe("05499887766");
  });

  it("returns empty for blank/null/digitless input", () => {
    expect(dintecDialPhone("")).toBe("");
    expect(dintecDialPhone(null)).toBe("");
    expect(dintecDialPhone(undefined)).toBe("");
    expect(dintecDialPhone("--")).toBe("");
  });
});
