// src/features/quotes/utils/kitRanking.test.ts
import { describe, expect, it } from "vitest";
import type { IVehicle, IVehicleModelKit } from "@/shared/types";
import { pickSuggestedKit, rankKitsByFleet } from "./kitRanking";

function kit(
  id: string,
  modelId: string,
  name: string,
  status: "oficial" | "rascunho",
): IVehicleModelKit {
  return { id, modelId, name, status } as unknown as IVehicleModelKit;
}

function vehicle(id: string, modelId?: string): IVehicle {
  return { id, modelId } as unknown as IVehicle;
}

const ATEGO = kit("k1", "mb-atego-1719", "Kit filtros — Atego", "oficial");
const FH = kit("k2", "volvo-fh-460", "Revisão 60.000 km — FH", "oficial");
const DRAFT_FH = kit("k3", "volvo-fh-460", "Reparo CP3", "rascunho");
const UNRELATED = kit("k4", "scania-r-450", "Kit freios — Scania", "oficial");
const UNRELATED_DRAFT = kit("k5", "agrale-ma-87", "Avulso Agrale", "rascunho");

describe("rankKitsByFleet", () => {
  it("puts kits matching the fleet first, in fleet order", () => {
    const ranked = rankKitsByFleet(
      [UNRELATED, FH, ATEGO],
      [vehicle("v1", "mb-atego-1719"), vehicle("v2", "volvo-fh-460")],
    );
    expect(ranked.map((r) => r.kit.id)).toEqual(["k1", "k2", "k4"]);
    expect(ranked[0]?.matchedVehicleIndex).toBe(0);
    expect(ranked[1]?.matchedVehicleIndex).toBe(1);
    expect(ranked[2]?.matchedVehicleIndex).toBe(-1);
  });

  it("orders unmatched kits official before draft, then by name", () => {
    const ranked = rankKitsByFleet([UNRELATED_DRAFT, UNRELATED], []);
    expect(ranked.map((r) => r.kit.id)).toEqual(["k4", "k5"]);
  });

  it("keeps a matching draft ahead of an unmatched official", () => {
    const ranked = rankKitsByFleet([UNRELATED, DRAFT_FH], [vehicle("v1", "volvo-fh-460")]);
    expect(ranked.map((r) => r.kit.id)).toEqual(["k3", "k4"]);
  });

  it("ignores vehicles without a catalogued model", () => {
    const ranked = rankKitsByFleet([ATEGO], [vehicle("v1", undefined)]);
    expect(ranked[0]?.matchedVehicleIndex).toBe(-1);
  });

  it("matches the first vehicle when the fleet repeats a model", () => {
    const ranked = rankKitsByFleet(
      [FH],
      [vehicle("v1", "volvo-fh-460"), vehicle("v2", "volvo-fh-460")],
    );
    expect(ranked[0]?.matchedVehicleIndex).toBe(0);
  });

  it("returns an empty list for an empty catalog of kits", () => {
    expect(rankKitsByFleet([], [vehicle("v1", "volvo-fh-460")])).toEqual([]);
  });
});

describe("pickSuggestedKit", () => {
  it("suggests the top-ranked official kit that matches the fleet", () => {
    const ranked = rankKitsByFleet([FH, ATEGO], [vehicle("v1", "mb-atego-1719")]);
    expect(pickSuggestedKit(ranked)?.kit.id).toBe("k1");
  });

  it("never suggests a draft, even when it matches", () => {
    const ranked = rankKitsByFleet([DRAFT_FH], [vehicle("v1", "volvo-fh-460")]);
    expect(pickSuggestedKit(ranked)).toBeNull();
  });

  it("never suggests an official kit that matches no vehicle", () => {
    const ranked = rankKitsByFleet([UNRELATED], [vehicle("v1", "volvo-fh-460")]);
    expect(pickSuggestedKit(ranked)).toBeNull();
  });
});
