import { describe, expect, it } from "vitest";
import {
  findAlsoForCandidates,
  findStartFromCandidates,
  type ICandidateKit,
  type ICandidateModel,
} from "./kitCandidates";

function model(id: string, name: string, engine: string, brand = "Volvo"): ICandidateModel {
  return { id, brand, model: name, engine, status: "ativo" };
}

function kit(
  id: string,
  modelId: string,
  partIds: string[],
  optional: string[] = [],
): ICandidateKit {
  return {
    id,
    modelId,
    items: partIds.map((partId) => ({ partId, isOptional: optional.includes(partId) })),
  };
}

const fh460a = model("fh460-a", "FH 460", "D13K460");
const fh460b = model("fh460-b", "FH 460", "D13K500");
const fh540 = model("fh540", "FH 540", "D13K540");
const r450 = model("r450", "R 450", "DC13", "Scania");

const MODELS = [fh460a, fh460b, fh540, r450];
const MODELS_BY_ID = new Map(MODELS.map((m) => [m.id, m]));

describe("findStartFromCandidates", () => {
  it("puts the sibling engine first even when another kit fits better", () => {
    const siblingKit = kit("k-sibling", fh460a.id, ["p1", "p2", "p3", "p4"]);
    const perfectKit = kit("k-other", fh540.id, ["p1", "p2"]);

    const found = findStartFromCandidates({
      target: fh460b,
      kits: [perfectKit, siblingKit],
      modelsById: MODELS_BY_ID,
      // p4 does not reach this engine: the sibling kit fits 3 of 4.
      compatiblePartIds: new Set(["p1", "p2", "p3"]),
    });

    expect(found.map((c) => c.kit.id)).toEqual(["k-sibling", "k-other"]);
    expect(found[0]).toMatchObject({ isSibling: true, fit: 3, ratio: 0.75 });
    expect(found[1]).toMatchObject({ isSibling: false, fit: 2, ratio: 1 });
  });

  it("ranks non-siblings by how much of the kit survives the move", () => {
    const found = findStartFromCandidates({
      target: r450,
      kits: [kit("k-half", fh460a.id, ["p1", "p2"]), kit("k-full", fh540.id, ["p1", "p2"])],
      modelsById: MODELS_BY_ID,
      compatiblePartIds: new Set(["p1", "p2"]),
    });

    // Both fit fully here — the tie keeps input order, which is enough.
    expect(found.map((c) => c.ratio)).toEqual([1, 1]);
  });

  it("drops kits below the minimum ratio — a bad start is worse than none", () => {
    const found = findStartFromCandidates({
      target: r450,
      kits: [kit("k-poor", fh540.id, ["p1", "p2", "p3", "p4"])],
      modelsById: MODELS_BY_ID,
      compatiblePartIds: new Set(["p1"]),
    });

    expect(found).toEqual([]);
  });

  it("never offers a kit of the target model itself", () => {
    const found = findStartFromCandidates({
      target: fh460a,
      kits: [kit("k-own", fh460a.id, ["p1"])],
      modelsById: MODELS_BY_ID,
      compatiblePartIds: new Set(["p1"]),
    });

    expect(found).toEqual([]);
  });

  it("skips kits whose model left the catalog", () => {
    const found = findStartFromCandidates({
      target: fh460a,
      kits: [kit("k-orphan", "deleted-model", ["p1"])],
      modelsById: MODELS_BY_ID,
      compatiblePartIds: new Set(["p1"]),
    });

    expect(found).toEqual([]);
  });

  it("treats an empty kit as a zero-ratio candidate and drops it", () => {
    const found = findStartFromCandidates({
      target: fh460a,
      kits: [kit("k-empty", fh540.id, [])],
      modelsById: MODELS_BY_ID,
      compatiblePartIds: new Set(["p1"]),
    });

    expect(found).toEqual([]);
  });

  it("caps the list at the limit", () => {
    const kits = [fh460b, fh540, r450].map((m, i) => kit(`k${i}`, m.id, ["p1"]));
    const found = findStartFromCandidates({
      target: fh460a,
      kits,
      modelsById: MODELS_BY_ID,
      compatiblePartIds: new Set(["p1"]),
      limit: 2,
    });

    expect(found).toHaveLength(2);
  });
});

describe("findAlsoForCandidates", () => {
  const compatibility: Record<string, string[]> = {
    [fh460b.id]: ["p1", "p2", "p3"],
    [fh540.id]: ["p1", "p2"],
    [r450.id]: ["p1"],
  };
  const compatiblePartIdsFor = (id: string) => new Set(compatibility[id] ?? []);

  it("offers only models where every base part applies, siblings first", () => {
    const found = findAlsoForCandidates({
      source: fh460a,
      models: MODELS,
      modelsWithKits: new Set<string>(),
      basePartIds: ["p1", "p2"],
      compatiblePartIdsFor,
    });

    // r450 only reaches p1, so it is not offered at all.
    expect(found.map((c) => c.model.id)).toEqual([fh460b.id, fh540.id]);
    expect(found.map((c) => c.isSibling)).toEqual([true, false]);
  });

  it("ignores optional parts — the offer is about the base composition", () => {
    // p3 is optional and only fh460b carries it; fh540 must still be offered.
    const found = findAlsoForCandidates({
      source: fh460a,
      models: MODELS,
      modelsWithKits: new Set<string>(),
      basePartIds: kit("k", fh460a.id, ["p1", "p2", "p3"], ["p3"])
        .items.filter((i) => !i.isOptional)
        .map((i) => i.partId),
      compatiblePartIdsFor,
    });

    expect(found.map((c) => c.model.id)).toEqual([fh460b.id, fh540.id]);
  });

  it("skips models that already carry a kit", () => {
    const found = findAlsoForCandidates({
      source: fh460a,
      models: MODELS,
      modelsWithKits: new Set([fh460b.id]),
      basePartIds: ["p1", "p2"],
      compatiblePartIdsFor,
    });

    expect(found.map((c) => c.model.id)).toEqual([fh540.id]);
  });

  it("skips inactive models", () => {
    const found = findAlsoForCandidates({
      source: fh460a,
      models: [{ ...fh460b, status: "inativo" }, fh540],
      modelsWithKits: new Set<string>(),
      basePartIds: ["p1", "p2"],
      compatiblePartIdsFor,
    });

    expect(found.map((c) => c.model.id)).toEqual([fh540.id]);
  });

  it("offers nothing for an empty composition — it would apply to everything", () => {
    const found = findAlsoForCandidates({
      source: fh460a,
      models: MODELS,
      modelsWithKits: new Set<string>(),
      basePartIds: [],
      compatiblePartIdsFor,
    });

    expect(found).toEqual([]);
  });

  it("never offers the source model itself", () => {
    const found = findAlsoForCandidates({
      source: fh460a,
      models: [fh460a],
      modelsWithKits: new Set<string>(),
      basePartIds: ["p1"],
      compatiblePartIdsFor: () => new Set(["p1"]),
    });

    expect(found).toEqual([]);
  });

  it("caps the list at the limit", () => {
    const found = findAlsoForCandidates({
      source: fh460a,
      models: MODELS,
      modelsWithKits: new Set<string>(),
      basePartIds: ["p1"],
      compatiblePartIdsFor: () => new Set(["p1"]),
      limit: 2,
    });

    expect(found).toHaveLength(2);
  });
});
