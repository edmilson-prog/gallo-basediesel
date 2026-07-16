import { describe, expect, it } from "vitest";
import { buildNineDigitCandidate, phoneDigitsMatchBr } from "./phoneBr";

describe("buildNineDigitCandidate", () => {
  it("inserts the 9th digit for a 12-digit 55+DDD+local8 number", () => {
    expect(buildNineDigitCandidate("555481572275")).toBe("5554981572275");
  });
  it("returns null for a number that already has 13 digits", () => {
    expect(buildNineDigitCandidate("5554981572275")).toBeNull();
  });
  it("returns null for input without the 55 DDI", () => {
    expect(buildNineDigitCandidate("548157227")).toBeNull();
  });
});

describe("phoneDigitsMatchBr", () => {
  it("matches identical digit strings", () => {
    expect(phoneDigitsMatchBr("5554981572275", "5554981572275")).toBe(true);
  });
  it("matches a 12-digit and a 13-digit form of the same number", () => {
    expect(phoneDigitsMatchBr("555481572275", "5554981572275")).toBe(true);
  });
  it("matches regardless of argument order", () => {
    expect(phoneDigitsMatchBr("5554981572275", "555481572275")).toBe(true);
  });
  it("does not match unrelated numbers", () => {
    expect(phoneDigitsMatchBr("555481572275", "5511988887777")).toBe(false);
  });
  it("is false for empty input", () => {
    expect(phoneDigitsMatchBr("", "5554981572275")).toBe(false);
  });
});
