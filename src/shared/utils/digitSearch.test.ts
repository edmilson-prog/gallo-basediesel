import { describe, expect, it } from "vitest";
import { buildDigitSearchCandidates, digitsOf } from "./digitSearch";

describe("digitsOf", () => {
  it("strips everything but digits", () => {
    expect(digitsOf("+55 (33) 9 8888-4188")).toBe("5533988884188");
  });
  it("returns empty string when there are no digits", () => {
    expect(digitsOf("Auto Peças")).toBe("");
  });
});

describe("buildDigitSearchCandidates", () => {
  it("returns [] for a term without digits", () => {
    expect(buildDigitSearchCandidates("João")).toEqual([]);
  });
  it("13 digits with DDI and 9th digit → adds the variant without the 9", () => {
    expect(buildDigitSearchCandidates("+55 33 98888-4188")).toEqual([
      "5533988884188",
      "553388884188",
    ]);
  });
  it("12 digits with DDI and no 9th → adds the variant with the 9", () => {
    expect(buildDigitSearchCandidates("553388884188")).toEqual(["553388884188", "5533988884188"]);
  });
  it("11 digits DDD+9+local → adds the variant without the 9", () => {
    expect(buildDigitSearchCandidates("33 98888-4188")).toEqual(["33988884188", "3388884188"]);
  });
  it("10 digits DDD+local → adds the variant with the 9", () => {
    expect(buildDigitSearchCandidates("3388884188")).toEqual(["3388884188", "33988884188"]);
  });
  it("9 digits starting with 9 → adds the variant without the leading 9", () => {
    expect(buildDigitSearchCandidates("98888-4188")).toEqual(["988884188", "88884188"]);
  });
  it("8 digits → no variant (substring already covers both stored shapes)", () => {
    expect(buildDigitSearchCandidates("8888-4188")).toEqual(["88884188"]);
  });
  it("CNPJ (14 digits) → digits only, no phone variant", () => {
    expect(buildDigitSearchCandidates("12.345.678/0001-90")).toEqual(["12345678000190"]);
  });
  it("CPF whose 3rd digit is not 9 → digits only", () => {
    expect(buildDigitSearchCandidates("123.456.789-01")).toEqual(["12345678901"]);
  });
  it("13 digits with DDI but 5th digit ≠ 9 → digits only", () => {
    expect(buildDigitSearchCandidates("5533188884188")).toEqual(["5533188884188"]);
  });
  it("mixed text with digits keeps only the digits", () => {
    expect(buildDigitSearchCandidates("tel 4188")).toEqual(["4188"]);
  });
});
