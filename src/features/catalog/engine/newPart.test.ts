import { describe, expect, it } from "vitest";
import {
  canSubmitCode,
  derivePartCodeState,
  isSaleReady,
  missingRequirements,
  resolveStandardPrice,
  type INewPartCodeInput,
} from "./newPart";

const codeInput = (patch: Partial<INewPartCodeInput> = {}): INewPartCodeInput => ({
  code: "",
  pending: false,
  status: "idle",
  duplicateFound: false,
  ...patch,
});

describe("derivePartCodeState", () => {
  it("is idle before anything is typed", () => {
    expect(derivePartCodeState(codeInput())).toBe("idle");
  });

  it("is typing while the code is too short to look up", () => {
    expect(derivePartCodeState(codeInput({ code: "C2" }))).toBe("typing");
  });

  it("treats surrounding whitespace as not typed", () => {
    expect(derivePartCodeState(codeInput({ code: "   " }))).toBe("idle");
  });

  it("is loading while the debounce has not caught up with what is typed", () => {
    expect(
      derivePartCodeState(
        codeInput({ code: "C20500", pending: true, status: "success", duplicateFound: true }),
      ),
    ).toBe("loading");
  });

  it("is loading while the lookup is in flight", () => {
    expect(derivePartCodeState(codeInput({ code: "C20500", status: "loading" }))).toBe("loading");
  });

  it("is duplicate once a settled lookup found the code", () => {
    expect(
      derivePartCodeState(codeInput({ code: "C20500", status: "success", duplicateFound: true })),
    ).toBe("duplicate");
  });

  it("is free once a settled lookup found nothing", () => {
    expect(derivePartCodeState(codeInput({ code: "C20500", status: "success" }))).toBe("free");
  });

  it("is error when the lookup could not be reached", () => {
    expect(derivePartCodeState(codeInput({ code: "C20500", status: "error" }))).toBe("error");
  });
});

describe("canSubmitCode", () => {
  it("allows a code the catalog does not know", () => {
    expect(canSubmitCode("free")).toBe(true);
  });

  it("fails open when the lookup itself failed", () => {
    expect(canSubmitCode("error")).toBe(true);
  });

  it("blocks a duplicate", () => {
    expect(canSubmitCode("duplicate")).toBe(false);
  });

  it("blocks while the answer is still in flight", () => {
    expect(canSubmitCode("loading")).toBe(false);
  });

  it("blocks an empty or half-typed code", () => {
    expect(canSubmitCode("idle")).toBe(false);
    expect(canSubmitCode("typing")).toBe(false);
  });
});

describe("resolveStandardPrice", () => {
  it("prices from cost and markup when there is a cost", () => {
    expect(resolveStandardPrice({ unitCost: 98.4, markupPercent: 1.2, directPrice: 5 })).toBe(
      216.48,
    );
  });

  it("uses the price typed directly when there is no cost", () => {
    expect(resolveStandardPrice({ unitCost: 0, markupPercent: 1.2, directPrice: 189.9 })).toBe(
      189.9,
    );
  });

  it("is zero when neither a cost nor a direct price was given", () => {
    expect(resolveStandardPrice({ unitCost: 0, markupPercent: 1.2, directPrice: 0 })).toBe(0);
  });
});

const readyPart = {
  code: "C20500",
  name: "Filtro de ar MANN C20500",
  brand: "MANN",
  category: "filtro" as const,
  unitCost: 98.4,
  markupPercent: 1.2,
  directPrice: 0,
  applicationCount: 0,
};

describe("isSaleReady", () => {
  it("is ready with category, manufacturer, cost and a code", () => {
    expect(isSaleReady(readyPart)).toBe(true);
  });

  it("accepts an application in place of a code", () => {
    expect(isSaleReady({ ...readyPart, code: "", applicationCount: 1 })).toBe(true);
  });

  it("is not ready without a category", () => {
    expect(isSaleReady({ ...readyPart, category: undefined })).toBe(false);
  });

  it("is not ready without a manufacturer", () => {
    expect(isSaleReady({ ...readyPart, brand: "  " })).toBe(false);
  });

  it("is not ready without a cost — the margin would be unknown", () => {
    expect(isSaleReady({ ...readyPart, unitCost: 0, directPrice: 189.9 })).toBe(false);
  });

  it("is not ready with neither a code nor an application", () => {
    expect(isSaleReady({ ...readyPart, code: "", applicationCount: 0 })).toBe(false);
  });
});

describe("missingRequirements", () => {
  it("lists nothing when the form is complete", () => {
    expect(missingRequirements(readyPart, "free")).toEqual([]);
  });

  it("asks for the code before anything else", () => {
    expect(missingRequirements({ ...readyPart, code: "C2" }, "typing")[0]).toBe("code");
  });

  it("reports a duplicate instead of a missing code", () => {
    const missing = missingRequirements(readyPart, "duplicate");
    expect(missing).toContain("codeDuplicate");
    expect(missing).not.toContain("code");
  });

  it("does not report the code while the lookup is still running", () => {
    const missing = missingRequirements(readyPart, "loading");
    expect(missing).not.toContain("code");
    expect(missing).not.toContain("codeDuplicate");
  });

  it("lists every empty required field in reading order", () => {
    expect(
      missingRequirements(
        {
          code: "",
          name: "",
          brand: "",
          category: undefined,
          unitCost: 0,
          markupPercent: 1.2,
          directPrice: 0,
          applicationCount: 0,
        },
        "idle",
      ),
    ).toEqual(["code", "name", "brand", "category", "price"]);
  });

  it("accepts a price typed directly when there is no cost", () => {
    expect(missingRequirements({ ...readyPart, unitCost: 0, directPrice: 189.9 }, "free")).toEqual(
      [],
    );
  });

  it("asks for a price when cost and markup produce nothing", () => {
    expect(missingRequirements({ ...readyPart, unitCost: 0, directPrice: 0 }, "free")).toEqual([
      "price",
    ]);
  });
});
