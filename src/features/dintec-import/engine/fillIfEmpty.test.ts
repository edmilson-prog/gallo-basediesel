import { describe, it, expect } from "vitest";
import { fillIfEmpty } from "./fillIfEmpty";

describe("fillIfEmpty", () => {
  it("keeps the existing value when it is non-empty", () => {
    expect(fillIfEmpty("Nome Já Cadastrado", "Nome DINTEC")).toBe("Nome Já Cadastrado");
  });

  it("takes the incoming value when existing is null", () => {
    expect(fillIfEmpty(null, "Nome DINTEC")).toBe("Nome DINTEC");
  });

  it("takes the incoming value when existing is undefined", () => {
    expect(fillIfEmpty(undefined, "Nome DINTEC")).toBe("Nome DINTEC");
  });

  it("takes the incoming value when existing is an empty string", () => {
    expect(fillIfEmpty("", "Nome DINTEC")).toBe("Nome DINTEC");
  });

  it("returns null when both existing and incoming are empty", () => {
    expect(fillIfEmpty(null, null)).toBe(null);
    expect(fillIfEmpty("", undefined)).toBe(null);
  });

  it("never overwrites existing with an incoming empty value", () => {
    expect(fillIfEmpty("Telefone Verificado", "")).toBe("Telefone Verificado");
  });
});
