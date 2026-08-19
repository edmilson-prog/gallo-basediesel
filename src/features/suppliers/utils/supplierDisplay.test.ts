import { describe, expect, it } from "vitest";
import { asKnownCategory, CATEGORY_LABEL, initials } from "./supplierDisplay";

describe("asKnownCategory", () => {
  it("passes through each of the four known categories unchanged", () => {
    expect(asKnownCategory("parts")).toBe("parts");
    expect(asKnownCategory("services")).toBe("services");
    expect(asKnownCategory("freight")).toBe("freight");
    expect(asKnownCategory("financial")).toBe("financial");
  });

  it("narrows an unknown category to parts", () => {
    expect(asKnownCategory("logistics")).toBe("parts");
  });

  it("narrows an absent category to parts — an XML-imported supplier leaves it blank on purpose", () => {
    expect(asKnownCategory(undefined)).toBe("parts");
  });

  it("narrows an empty string the same as absent", () => {
    expect(asKnownCategory("")).toBe("parts");
  });
});

describe("CATEGORY_LABEL", () => {
  it("labels every known category in Portuguese", () => {
    for (const category of ["parts", "services", "freight", "financial"] as const) {
      expect(CATEGORY_LABEL[category]).toBeTruthy();
    }
  });
});

describe("initials", () => {
  it("takes the first letter of the first two words, uppercased", () => {
    expect(initials("Robert Bosch")).toBe("RB");
  });

  it("handles a single-word name", () => {
    expect(initials("DINTEC")).toBe("D");
  });
});
