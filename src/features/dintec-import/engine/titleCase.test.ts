import { describe, expect, it } from "vitest";
import { titleCaseName } from "./titleCase";

describe("titleCaseName", () => {
  it("title-cases each word, preserving accents", () => {
    expect(titleCaseName("Chave para desmontagem de filtro")).toBe("Chave Para Desmontagem De Filtro");
    expect(titleCaseName("ELEMENTO FILTRANTE DO ÓLEO")).toBe("Elemento Filtrante Do Óleo");
  });

  it("collapses extra whitespace", () => {
    expect(titleCaseName("  Filtro   De  Ar  ")).toBe("Filtro De Ar");
  });

  it("returns an empty string unchanged", () => {
    expect(titleCaseName("")).toBe("");
  });
});
