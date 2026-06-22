import { describe, expect, it } from "vitest";
import { PLACEHOLDER_KEYS, buildSampleContext } from "./placeholderVocabulary";
import { resolvePlaceholders } from "./placeholderResolver";

describe("placeholderVocabulary", () => {
  it("canonical vocabulary covers nome/loja/vendedor/peca/prazo", () => {
    expect([...PLACEHOLDER_KEYS]).toEqual(["nome", "loja", "vendedor", "peca", "prazo"]);
  });

  it("buildSampleContext resolves every canonical placeholder (no gaps)", () => {
    const ctx = buildSampleContext({ loja: "GALLO Matriz", vendedor: "Ana" });
    const body = "Olá {{nome}}, da {{loja}} fala {{vendedor}}: {{peca}} em {{prazo}}.";
    const { resolved, gaps } = resolvePlaceholders(body, ctx);
    expect(gaps).toEqual([]);
    expect(resolved).toContain("GALLO Matriz");
    expect(resolved).toContain("Ana");
  });
});
