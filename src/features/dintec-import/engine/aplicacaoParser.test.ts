import { describe, expect, it } from "vitest";
import { parseAplicacaoText } from "./aplicacaoParser";

describe("parseAplicacaoText", () => {
  it("splits fitment text from a trailing COD. SEMELHANTES: cross-reference list", () => {
    const raw =
      "AGRALE: MA 7.5T - MICRO-BUS - MWM 4.10T; MA 8.5T - MICRO-BUS - MWM 4.10T / AGCO: MF-297 / JCB: 580/12020 = Secundário use CF500/1 (componente da carcaça 45 500 92 941)\nCOD. SEMELHANTES: ARS3003 / CA9352 / WAP606";
    const result = parseAplicacaoText(raw);
    expect(result.applicationNotes).toBe(
      "AGRALE: MA 7.5T - MICRO-BUS - MWM 4.10T; MA 8.5T - MICRO-BUS - MWM 4.10T / AGCO: MF-297 / JCB: 580/12020 = Secundário use CF500/1 (componente da carcaça 45 500 92 941)",
    );
    expect(result.crossReferences).toEqual([
      { brand: "DINTEC (equivalente)", code: "ARS3003" },
      { brand: "DINTEC (equivalente)", code: "CA9352" },
      { brand: "DINTEC (equivalente)", code: "WAP606" },
    ]);
  });

  it("returns only applicationNotes when there is no COD. SEMELHANTES section", () => {
    const raw = "CITROËN: JUMPER 2.8 HDI 17 (01/07-)";
    const result = parseAplicacaoText(raw);
    expect(result.applicationNotes).toBe("CITROËN: JUMPER 2.8 HDI 17 (01/07-)");
    expect(result.crossReferences).toEqual([]);
  });

  it("returns undefined applicationNotes for blank/dash input", () => {
    expect(parseAplicacaoText("").applicationNotes).toBeUndefined();
    expect(parseAplicacaoText("-").applicationNotes).toBeUndefined();
    expect(parseAplicacaoText("").crossReferences).toEqual([]);
  });
});
