import { describe, expect, it } from "vitest";
import { initialsOf, shortNameOf } from "./statusMeta";

describe("shortNameOf", () => {
  it("puts every contact in the same case", () => {
    // The list mixed all three of these on consecutive rows, which is what the
    // owner asked to normalise.
    expect(shortNameOf("Marcelo Viana")).toBe("MARCELO VIANA");
    expect(shortNameOf("EDER BATISTA")).toBe("EDER BATISTA");
    expect(shortNameOf("raimannbuenodiego")).toBe("RAIMANNBUENODIEGO");
  });

  it("keeps accents rather than stripping them", () => {
    expect(shortNameOf("metalúrgica Fk")).toBe("METALÚRGICA FK");
    expect(shortNameOf("José Adair")).toBe("JOSÉ ADAIR");
    expect(shortNameOf("Assunção & Cia")).toBe("ASSUNÇÃO & CIA");
  });

  it("cuts at the first separator, so a long compound name still fits", () => {
    expect(shortNameOf("PAWIMAC · Antonello Terraplanagem")).toBe("PAWIMAC");
    expect(shortNameOf("Base Café — Matriz")).toBe("BASE CAFÉ");
    expect(shortNameOf("AGCO | Santa Rosa")).toBe("AGCO");
  });

  it("leaves a name whose punctuation is not a separator alone", () => {
    // No surrounding spaces: this is one name, not "MORONI" and "XAVIER".
    expect(shortNameOf("MORONI & XAVIER AUTOPECAS")).toBe("MORONI & XAVIER AUTOPECAS");
    expect(shortNameOf("Ferreira-Souza")).toBe("FERREIRA-SOUZA");
  });

  it("falls back to the original when the cut would empty the label", () => {
    expect(shortNameOf("  ")).toBe("  ".toLocaleUpperCase("pt-BR"));
    expect(shortNameOf("+55 55 99820-1177")).toBe("+55 55 99820-1177");
  });
});

describe("initialsOf", () => {
  it("takes the first letter of the first two words", () => {
    expect(initialsOf("Marcelo Viana")).toBe("MV");
    expect(initialsOf("MORONI & XAVIER AUTOPECAS")).toBe("M&");
  });

  it("uses the first two letters when there is a single word", () => {
    expect(initialsOf("raimannbuenodiego")).toBe("RA");
  });

  it("never renders empty", () => {
    expect(initialsOf("")).toBe("?");
    expect(initialsOf("   ")).toBe("?");
  });
});
