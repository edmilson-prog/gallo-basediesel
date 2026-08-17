import { describe, expect, it } from "vitest";
import { getSiblingModels, groupModelsByBrand, isSiblingModel } from "./modelGrouping";

const BRAND_ORDER = ["Volvo", "Scania", "Mercedes-Benz"];

function model(id: string, brand: string, name: string) {
  return { id, brand, model: name };
}

// The real catalog case: FH 460 is two canonical records, one per engine.
const fh460a = model("volvo-fh460-d13k460", "Volvo", "FH 460");
const fh460b = model("volvo-fh460-d13k500", "Volvo", "FH 460");
const fh540 = model("volvo-fh540", "Volvo", "FH 540");
const r450 = model("scania-r450", "Scania", "R 450");

describe("isSiblingModel", () => {
  it("treats two engines of the same designation as the same truck", () => {
    expect(isSiblingModel(fh460a, fh460b)).toBe(true);
  });

  it("does not call a record its own sibling", () => {
    expect(isSiblingModel(fh460a, fh460a)).toBe(false);
  });

  it("separates different designations and different brands", () => {
    expect(isSiblingModel(fh460a, fh540)).toBe(false);
    expect(isSiblingModel(fh460a, { ...fh460a, id: "other", brand: "Scania" })).toBe(false);
  });
});

describe("getSiblingModels", () => {
  it("returns the other engines of the designation, never the model itself", () => {
    expect(getSiblingModels(fh460a, [fh460a, fh460b, fh540, r450])).toEqual([fh460b]);
  });

  it("returns nothing for a designation with a single engine", () => {
    expect(getSiblingModels(r450, [fh460a, fh460b, fh540, r450])).toEqual([]);
  });
});

describe("groupModelsByBrand", () => {
  it("orders known brands by display order and counts every engine", () => {
    const groups = groupModelsByBrand([r450, fh460a, fh540, fh460b], BRAND_ORDER);

    expect(groups.map((g) => g.brand)).toEqual(["Volvo", "Scania"]);
    expect(groups[0].count).toBe(3);
    expect(groups[1].count).toBe(1);
  });

  it("groups siblings into one block even when the provider interleaves them", () => {
    // fh540 sits between the two FH 460 records — adjacency grouping would split them.
    const groups = groupModelsByBrand([fh460a, fh540, fh460b], BRAND_ORDER);
    const volvo = groups[0];

    expect(volvo.blocks.map((b) => b.model)).toEqual(["FH 460", "FH 540"]);
    expect(volvo.blocks[0].engines).toEqual([fh460a, fh460b]);
    expect(volvo.blocks[1].engines).toEqual([fh540]);
  });

  it("appends unknown brands after the known ones, in first-seen order", () => {
    const daf = model("daf-xf", "DAF", "XF 480");
    const man = model("man-tgx", "MAN", "TGX");
    const groups = groupModelsByBrand([man, daf, fh460a], BRAND_ORDER);

    expect(groups.map((g) => g.brand)).toEqual(["Volvo", "MAN", "DAF"]);
  });

  it("omits brands with no model instead of emitting empty groups", () => {
    const groups = groupModelsByBrand([r450], BRAND_ORDER);
    expect(groups.map((g) => g.brand)).toEqual(["Scania"]);
  });

  it("returns nothing for an empty catalog", () => {
    expect(groupModelsByBrand([], BRAND_ORDER)).toEqual([]);
  });
});
