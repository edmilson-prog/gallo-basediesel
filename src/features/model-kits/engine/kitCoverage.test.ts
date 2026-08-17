import { describe, expect, it } from "vitest";
import {
  computeKitCoverage,
  getModelCoverageStatus,
  groupKitsByModel,
  pickRepresentativeKit,
  sortKitsByCuration,
  type ICoverageKit,
} from "./kitCoverage";

function kit(modelId: string, status: "oficial" | "rascunho"): ICoverageKit {
  return { modelId, status };
}

describe("getModelCoverageStatus", () => {
  it("reads one published kit as covered, whatever else the model carries", () => {
    expect(getModelCoverageStatus([kit("m1", "rascunho"), kit("m1", "oficial")])).toBe("oficial");
  });

  it("reads drafts with no published kit as the review queue", () => {
    expect(getModelCoverageStatus([kit("m1", "rascunho")])).toBe("rascunho");
  });

  it("reads no kit at all as the work queue", () => {
    expect(getModelCoverageStatus([])).toBe("sem");
  });
});

describe("computeKitCoverage", () => {
  const models = [{ id: "m1" }, { id: "m2" }, { id: "m3" }, { id: "m4" }];

  it("puts every model in exactly one bucket, so the three numbers add up", () => {
    const coverage = computeKitCoverage(models, [
      kit("m1", "oficial"),
      // A model with both still counts once, as covered.
      kit("m1", "rascunho"),
      kit("m2", "rascunho"),
    ]);

    expect(coverage).toEqual({ official: 1, draft: 1, none: 2, total: 4 });
    expect(coverage.official + coverage.draft + coverage.none).toBe(coverage.total);
  });

  it("reports the whole catalog as uncurated when no kit exists — production today", () => {
    expect(computeKitCoverage(models, [])).toEqual({
      official: 0,
      draft: 0,
      none: 4,
      total: 4,
    });
  });

  it("ignores kits pointing at models outside the filtered list", () => {
    expect(
      computeKitCoverage([{ id: "m1" }], [kit("m1", "oficial"), kit("ghost", "oficial")]),
    ).toEqual({ official: 1, draft: 0, none: 0, total: 1 });
  });
});

describe("groupKitsByModel", () => {
  it("indexes kits under the model they hang off", () => {
    const a = kit("m1", "oficial");
    const b = kit("m1", "rascunho");
    const c = kit("m2", "rascunho");

    const grouped = groupKitsByModel([a, b, c]);

    expect(grouped.get("m1")).toEqual([a, b]);
    expect(grouped.get("m2")).toEqual([c]);
    expect(grouped.get("m3")).toBeUndefined();
  });
});

describe("sortKitsByCuration / pickRepresentativeKit", () => {
  const draftB = { status: "rascunho" as const, name: "B" };
  const draftA = { status: "rascunho" as const, name: "A" };
  const official = { status: "oficial" as const, name: "Z" };

  it("sorts published kits first, then alphabetically in pt-BR", () => {
    expect(sortKitsByCuration([draftB, official, draftA])).toEqual([official, draftA, draftB]);
  });

  it("does not mutate the input", () => {
    const input = [draftB, official];
    sortKitsByCuration(input);
    expect(input).toEqual([draftB, official]);
  });

  it("elects the published kit as the model's representative", () => {
    expect(pickRepresentativeKit([draftA, official])).toBe(official);
  });

  it("falls back to the first draft when nothing is published", () => {
    expect(pickRepresentativeKit([draftB, draftA])).toBe(draftB);
  });

  it("returns undefined for a model with no kit", () => {
    expect(pickRepresentativeKit([])).toBeUndefined();
  });
});
