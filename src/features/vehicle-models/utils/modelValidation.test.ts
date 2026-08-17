import { describe, expect, it } from "vitest";
import { describeModelForm, usableEngines } from "./modelValidation";

describe("usableEngines", () => {
  it("drops blanks and trims what is left", () => {
    expect(usableEngines(["  D13K460 ", "", "   ", "D13K500"])).toEqual(["D13K460", "D13K500"]);
  });

  it("collapses engines that differ only by case or padding", () => {
    expect(usableEngines(["DC13", "dc13 ", " DC13"])).toEqual(["DC13"]);
  });

  it("keeps the order the operator typed", () => {
    expect(usableEngines(["OM 457 LA", "OM 924 LA"])).toEqual(["OM 457 LA", "OM 924 LA"]);
  });

  it("returns nothing for an all-blank list", () => {
    expect(usableEngines(["", "  "])).toEqual([]);
  });
});

describe("describeModelForm", () => {
  const valid = { brand: "Volvo", model: "FH 460", engines: ["D13K460"] };

  it("clears the bar once brand, model and one engine are in", () => {
    expect(describeModelForm(valid)).toEqual({
      error: null,
      engines: ["D13K460"],
      summary: "Volvo FH 460 D13K460",
    });
  });

  it("reports the record count when several engines are listed", () => {
    const result = describeModelForm({ ...valid, engines: ["D13K460", "D13K500", "D13K540"] });
    expect(result.error).toBeNull();
    expect(result.summary).toBe("3 modelos de Volvo FH 460");
  });

  it("asks for the missing field in the order the form reads", () => {
    expect(describeModelForm({ brand: "", model: "", engines: [] }).error).toBe(
      "Selecione a marca.",
    );
    expect(describeModelForm({ ...valid, model: "  " }).error).toBe("Informe o modelo.");
    expect(describeModelForm({ ...valid, engines: ["  "] }).error).toBe(
      "Informe ao menos um motor.",
    );
  });

  it("rejects a year range that runs backwards", () => {
    expect(describeModelForm({ ...valid, yearStart: 2020, yearEnd: 2015 }).error).toBe(
      "O ano final não pode ser antes do inicial.",
    );
  });

  it("accepts an open range — an empty end year means current", () => {
    expect(describeModelForm({ ...valid, yearStart: 2020 }).error).toBeNull();
    expect(describeModelForm({ ...valid, yearEnd: 2020 }).error).toBeNull();
    expect(describeModelForm({ ...valid, yearStart: 2020, yearEnd: 2020 }).error).toBeNull();
  });

  it("counts de-duplicated engines, not typed rows", () => {
    const result = describeModelForm({ ...valid, engines: ["DC13", "dc13"] });
    expect(result.engines).toEqual(["DC13"]);
    expect(result.summary).toBe("Volvo FH 460 DC13");
  });
});
