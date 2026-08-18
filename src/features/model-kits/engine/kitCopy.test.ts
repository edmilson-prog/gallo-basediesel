import { describe, expect, it } from "vitest";
import { renameKitForModel } from "./kitCopy";

const FH460 = { model: "FH 460", engine: "D13K460" };
const FH500 = { model: "FH 460", engine: "D13K500" };

describe("renameKitForModel", () => {
  it("swaps the engine when the name carries it — the sibling-engine copy", () => {
    expect(renameKitForModel("Kit Filtros — Volvo FH 460 D13K460", FH460, FH500)).toBe(
      "Kit Filtros — Volvo FH 460 D13K500",
    );
  });

  it("appends the destination engine when the name carries only the model", () => {
    expect(renameKitForModel("Kit Filtros FH 460", FH460, FH500)).toBe(
      "Kit Filtros FH 460 D13K500",
    );
  });

  it("appends the whole destination when the name is generic", () => {
    expect(renameKitForModel("Kit de revisão", FH460, FH500)).toBe(
      "Kit de revisão — FH 460 D13K500",
    );
  });

  it("names a copy across different models", () => {
    expect(
      renameKitForModel(
        "Kit Filtros — Scania R 450 DC13",
        { model: "R 450", engine: "DC13" },
        { model: "R 500", engine: "DC13 EURO 6" },
      ),
    ).toBe("Kit Filtros — Scania R 450 DC13 EURO 6");
  });

  it("trims stray whitespace", () => {
    expect(renameKitForModel("  Kit de revisão  ", FH460, FH500)).toBe(
      "Kit de revisão — FH 460 D13K500",
    );
  });
});
