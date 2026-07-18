import { describe, expect, it } from "vitest";
import { buildCrossReferenceIndex, findBridgeSku, normalizeCrossReferenceCode } from "./crossReferenceBridge";

describe("normalizeCrossReferenceCode", () => {
  it("uppercases and strips separators the two spreadsheets format differently", () => {
    expect(normalizeCrossReferenceCode(" hf-7043 ")).toBe("HF7043");
    expect(normalizeCrossReferenceCode("A.12/34")).toBe("A1234");
  });
});

describe("buildCrossReferenceIndex", () => {
  it("indexes by brand + normalized code", () => {
    const index = buildCrossReferenceIndex([
      { sku: "19.008.00", crossReferences: [{ brand: "Mann", code: "CU2952" }] },
    ]);
    expect(index.get("Mann::CU2952")).toBe("19.008.00");
    expect(index.size).toBe(1);
  });

  it("first entry wins on a collision, deterministic by source order", () => {
    const index = buildCrossReferenceIndex([
      { sku: "19.008.00", crossReferences: [{ brand: "Mann", code: "CU2952" }] },
      { sku: "23.127.00", crossReferences: [{ brand: "Mann", code: "cu-2952" }] },
    ]);
    expect(index.get("Mann::CU2952")).toBe("19.008.00");
    expect(index.size).toBe(1);
  });

  it("ignores entries with no cross references", () => {
    const index = buildCrossReferenceIndex([{ sku: "X", crossReferences: [] }]);
    expect(index.size).toBe(0);
  });
});

describe("findBridgeSku", () => {
  const index = buildCrossReferenceIndex([
    {
      sku: "53.161.00",
      crossReferences: [
        { brand: "Hengst", code: "E953LI" },
        { brand: "Mahle", code: "LA123" },
      ],
    },
  ]);

  it("returns the sku for the first cross-reference that matches the index", () => {
    expect(
      findBridgeSku(
        [
          { brand: "Tecfil", code: "ACP105" },
          { brand: "Mahle", code: "LA123" },
        ],
        index,
      ),
    ).toBe("53.161.00");
  });

  it("normalizes before comparing", () => {
    expect(findBridgeSku([{ brand: "Hengst", code: "e953-li" }], index)).toBe("53.161.00");
  });

  it("returns null when no cross-reference matches", () => {
    expect(findBridgeSku([{ brand: "Fram", code: "CF9999" }], index)).toBeNull();
  });

  it("returns null for an empty cross-reference list", () => {
    expect(findBridgeSku([], index)).toBeNull();
  });
});
