import { describe, expect, it } from "vitest";
import {
  buildNineDigitCandidate,
  digitsOf,
  formatBrPhoneDisplay,
  looksLikePhone,
  normalizeBrPhone,
  samePhone,
} from "./phoneBR";

describe("normalizeBrPhone", () => {
  it("prefixes 55 to an 11-digit DDD+mobile", () => {
    expect(normalizeBrPhone("(54) 99999-8888")).toEqual({ ok: true, digits: "5554999998888" });
  });
  it("prefixes 55 to a 10-digit DDD+landline", () => {
    expect(normalizeBrPhone("54 3333-8888")).toEqual({ ok: true, digits: "555433338888" });
  });
  it("keeps a number that already has the 55 DDI (13 digits)", () => {
    expect(normalizeBrPhone("5554999998888")).toEqual({ ok: true, digits: "5554999998888" });
  });
  it("keeps a number that already has the 55 DDI (12 digits)", () => {
    expect(normalizeBrPhone("555433338888")).toEqual({ ok: true, digits: "555433338888" });
  });
  it("treats DDD 55 (RS) without DDI correctly", () => {
    expect(normalizeBrPhone("55 9998-8776")).toEqual({ ok: true, digits: "555599988776" });
  });
  it("rejects too-short input", () => {
    expect(normalizeBrPhone("99988")).toEqual({ ok: false, reason: "too_short" });
  });
  it("rejects too-long input", () => {
    expect(normalizeBrPhone("5554999998888123")).toEqual({ ok: false, reason: "too_long" });
  });
});

describe("samePhone", () => {
  it("matches with and without the 55 DDI", () => {
    expect(samePhone("5554999998888", "54999998888")).toBe(true);
  });
  it("matches two bare DDD+number forms", () => {
    expect(samePhone("11988887777", "11988887777")).toBe(true);
  });
  it("does not match different numbers", () => {
    expect(samePhone("5554999998888", "5511988887777")).toBe(false);
  });
  it("is false for empty", () => {
    expect(samePhone("", "5554999998888")).toBe(false);
  });
});

describe("buildNineDigitCandidate", () => {
  it("inserts the 9th digit for a 12-digit 55+DDD+local8 number", () => {
    expect(buildNineDigitCandidate("555481572275")).toBe("5554981572275");
  });
  it("returns null for a number that already has 13 digits", () => {
    expect(buildNineDigitCandidate("5554981572275")).toBeNull();
  });
  it("returns null for input shorter than 12 digits", () => {
    expect(buildNineDigitCandidate("54999988")).toBeNull();
  });
  it("returns null for input without the 55 DDI", () => {
    expect(buildNineDigitCandidate("548157227")).toBeNull();
  });
});

describe("samePhone with 9th-digit ambiguity", () => {
  it("matches a 12-digit and a 13-digit form of the same number", () => {
    expect(samePhone("555481572275", "5554981572275")).toBe(true);
  });
  it("matches regardless of argument order", () => {
    expect(samePhone("5554981572275", "555481572275")).toBe(true);
  });
  it("does not match a 12-digit number against an unrelated 13-digit number", () => {
    expect(samePhone("555481572275", "5511988887777")).toBe(false);
  });
  it("does not match when the inserted digit isn't a 9", () => {
    expect(samePhone("555481572275", "5554881572275")).toBe(false);
  });
});

describe("looksLikePhone", () => {
  it("is true for >=10 digits", () => {
    expect(looksLikePhone("5499998888")).toBe(true);
  });
  it("is false for names", () => {
    expect(looksLikePhone("João Silva")).toBe(false);
  });
});

describe("formatBrPhoneDisplay", () => {
  it("formats a 13-digit mobile", () => {
    expect(formatBrPhoneDisplay("5554999998888")).toBe("(55) 54 99999-8888");
  });
  it("formats a 12-digit landline", () => {
    expect(formatBrPhoneDisplay("555433338888")).toBe("(55) 54 3333-8888");
  });
});

describe("digitsOf", () => {
  it("strips non-digits", () => {
    expect(digitsOf("(54) 99999-8888")).toBe("54999998888");
  });
});
