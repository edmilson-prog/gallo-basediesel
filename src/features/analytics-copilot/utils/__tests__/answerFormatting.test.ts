import { describe, expect, it } from "vitest";
import type { IGoalPeriod } from "@/shared/types/bi";
import {
  formatPeriodLabel,
  scopeLabel,
  comparisonModeLabel,
  filterEntries,
} from "../answerFormatting";

const may: IGoalPeriod = {
  type: "monthly",
  start: "2026-05-01T00:00:00.000Z",
  end: "2026-05-31T23:59:59.999Z",
};

describe("answerFormatting", () => {
  it("formatPeriodLabel → mês/ano pt-BR", () => {
    expect(formatPeriodLabel(may)).toMatch(/mai.*2026/i);
  });
  it("scopeLabel reflete papel e loja", () => {
    expect(scopeLabel({ role: "Owner" })).toMatch(/Owner/);
    expect(scopeLabel({ role: "Vendedor", sellerId: "s1" })).toMatch(/Vendedor/);
  });
  it("comparisonModeLabel em pt-BR", () => {
    expect(comparisonModeLabel("previous_period")).toMatch(/anterior/i);
    expect(comparisonModeLabel("previous_year")).toMatch(/ano/i);
    expect(comparisonModeLabel(undefined)).toBe("");
  });
  it("filterEntries lista só filtros presentes", () => {
    expect(filterEntries({ marca: "Volvo" })).toEqual([{ label: "Marca", value: "Volvo" }]);
    expect(filterEntries({})).toEqual([]);
  });
});
