import { describe, expect, it } from "vitest";
import { buildNineDigitCandidate, phoneDigitsMatchBr, normalizeBrDialDigits } from "./phoneBr";

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

describe("normalizeBrDialDigits", () => {
  it("prefixes 55 on a bare 11-digit BR local number (DINTEC import shape)", () => {
    expect(normalizeBrDialDigits("49988184540")).toBe("5549988184540");
  });

  it("prefixes 55 on a bare 10-digit BR local number (no 9th digit — never inserts it)", () => {
    expect(normalizeBrDialDigits("4988184540")).toBe("554988184540");
  });

  it("keeps 55-prefixed 12-13 digit numbers unchanged", () => {
    expect(normalizeBrDialDigits("5549988184540")).toBe("5549988184540");
    expect(normalizeBrDialDigits("554988184540")).toBe("554988184540");
  });

  it("prefixes 55 when the DDD itself is 55 (Frederico Westphalen region)", () => {
    expect(normalizeBrDialDigits("5537461083")).toBe("555537461083");
  });

  it("trusts an explicit + as E.164 and never prefixes (Chile/Bolivia are also 10-11 digits)", () => {
    expect(normalizeBrDialDigits("+56995070445")).toBe("56995070445");
    expect(normalizeBrDialDigits("+59173626401")).toBe("59173626401");
    expect(normalizeBrDialDigits("+5549988184540")).toBe("5549988184540");
  });

  it("leaves 10-11 digit values with an invalid BR DDD untouched (fail-open)", () => {
    expect(normalizeBrDialDigits("57996445339")).toBe("57996445339");
    expect(normalizeBrDialDigits("5996902510")).toBe("5996902510");
  });

  it("leaves trunk-zero values untouched (fail-open)", () => {
    expect(normalizeBrDialDigits("04998818454")).toBe("04998818454");
  });

  it("strips punctuation before deciding", () => {
    expect(normalizeBrDialDigits("(49) 98818-4540")).toBe("5549988184540");
  });

  it("passes empty/garbage through unchanged", () => {
    expect(normalizeBrDialDigits("")).toBe("");
    expect(normalizeBrDialDigits("+0")).toBe("0");
  });
});
