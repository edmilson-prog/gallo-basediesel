import { describe, expect, it } from "vitest";
import { resolvePlaceholders, hasUnresolved } from "./placeholderResolver";

describe("resolvePlaceholders", () => {
  it("substitutes known placeholders from context", () => {
    const r = resolvePlaceholders("Olá {{nome}}, sobre a {{peca}}", {
      nome: "Carlos",
      peca: "pastilha",
    });
    expect(r.resolved).toBe("Olá Carlos, sobre a pastilha");
    expect(r.gaps).toEqual([]);
  });

  it("lists unresolved placeholders as gaps and renders them as [gap] pills", () => {
    const r = resolvePlaceholders("Prazo {{prazo}} para {{nome}}", { nome: "Ana" });
    expect(r.gaps).toEqual(["prazo"]);
    expect(r.resolved).toBe("Prazo [prazo] para Ana");
  });

  it("treats everything as a gap when context is empty", () => {
    const r = resolvePlaceholders("{{nome}} {{peca}} {{prazo}}", {});
    expect(r.gaps).toEqual(["nome", "peca", "prazo"]);
  });

  it("hasUnresolved is true while raw {{...}} remains", () => {
    expect(hasUnresolved("Olá {{nome}}")).toBe(true);
  });

  it("hasUnresolved is true while a [gap] pill remains", () => {
    expect(hasUnresolved("Prazo [prazo]")).toBe(true);
  });

  it("hasUnresolved is false for fully resolved text", () => {
    expect(hasUnresolved("Olá Carlos, tudo certo")).toBe(false);
  });

  it("ignores empty/whitespace-only braces (not a placeholder)", () => {
    expect(hasUnresolved("custa R$ 10")).toBe(false);
  });
});
