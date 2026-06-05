import { describe, expect, it } from "vitest";
import {
  suggestionsForRole,
  categorizedSuggestionsForRole,
} from "../suggestions";

describe("categorizedSuggestionsForRole", () => {
  it("Gestor recebe grupos com perguntas de escopo gerencial", () => {
    const groups = categorizedSuggestionsForRole("Gestor");
    expect(groups.length).toBeGreaterThanOrEqual(2);
    const all = groups.flatMap((g) => g.items);
    expect(all.every((i) => i.question.length > 0 && i.icon.startsWith("mdi:"))).toBe(true);
    expect(all.some((i) => /margem/i.test(i.question))).toBe(true);
  });

  it("Vendedor recebe frasing de escopo próprio (minha/meu)", () => {
    const groups = categorizedSuggestionsForRole("Vendedor");
    const all = groups.flatMap((g) => g.items).map((i) => i.question.toLowerCase());
    expect(all.some((q) => q.includes("minha") || q.includes("meu") || q.includes("faturei"))).toBe(
      true,
    );
  });

  it("cada grupo tem rótulo e ao menos um item", () => {
    for (const g of categorizedSuggestionsForRole("Owner")) {
      expect(g.label.length).toBeGreaterThan(0);
      expect(g.items.length).toBeGreaterThan(0);
    }
  });

  it("suggestionsForRole (flat) continua funcionando", () => {
    expect(suggestionsForRole("Vendedor").length).toBeGreaterThan(0);
    expect(suggestionsForRole("Gestor").length).toBeGreaterThan(0);
  });
});
