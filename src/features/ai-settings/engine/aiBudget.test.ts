import { describe, expect, it } from "vitest";
import { budgetLevel, projectMonthlySpend } from "./aiBudget";

describe("projectMonthlySpend", () => {
  it("extrapola o gasto parcial até o fim do mês (run-rate)", () => {
    // metade do mês de 30 dias, R$ 150 gastos → projeção ~R$ 300
    const now = new Date("2026-06-15T12:00:00.000Z");
    const p = projectMonthlySpend(150, now);
    expect(p).toBeGreaterThan(280);
    expect(p).toBeLessThan(320);
  });
});

describe("budgetLevel", () => {
  it("classifica ok/warning/critical pelo threshold", () => {
    expect(budgetLevel(50, 80)).toBe("ok");
    expect(budgetLevel(85, 80)).toBe("warning");
    expect(budgetLevel(100, 80)).toBe("critical");
  });
});
