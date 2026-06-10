import { describe, expect, it } from "vitest";
import type { IMessageTemplate } from "@/shared/types";
import { countTemplateVariables, renderTemplate, TemplateRenderError } from "./render";

function makeTemplate(partial?: Partial<IMessageTemplate>): IMessageTemplate {
  return {
    id: "tpl-1",
    metaTemplateName: "boas_vindas_v1",
    metaLanguageCode: "pt_BR",
    metaCategory: "utility",
    metaStatus: "approved",
    displayName: "Boas-vindas",
    isActive: true,
    bodyTemplate: "Olá {{1}}! Recebemos seu interesse na peça {{2}}.",
    variableCount: 2,
    variableLabels: ["Nome", "Peça"],
    headerType: "none",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...partial,
  };
}

describe("renderTemplate (RF-010..013)", () => {
  it("substitutes positional variables and builds the body component", () => {
    const result = renderTemplate(makeTemplate(), ["Edmilson", "Filtro de óleo"]);
    expect(result.text).toBe("Olá Edmilson! Recebemos seu interesse na peça Filtro de óleo.");
    expect(result.components).toEqual([
      {
        type: "body",
        parameters: [
          { type: "text", text: "Edmilson" },
          { type: "text", text: "Filtro de óleo" },
        ],
      },
    ]);
  });

  it("substitutes repeated occurrences of the same variable", () => {
    const template = makeTemplate({
      bodyTemplate: "{{1}}, confirme: {{1}} é seu nome?",
      variableCount: 1,
      variableLabels: ["Nome"],
    });
    expect(renderTemplate(template, ["Ana"]).text).toBe("Ana, confirme: Ana é seu nome?");
  });

  it("prepends the header component when headerType=text (RF-013)", () => {
    const template = makeTemplate({
      headerType: "text",
      headerTextTemplate: "GALLO Base Diesel",
    });
    const result = renderTemplate(template, ["A", "B"]);
    expect(result.components[0]).toEqual({
      type: "header",
      parameters: [{ type: "text", text: "GALLO Base Diesel" }],
    });
    expect(result.components[1]?.type).toBe("body");
  });

  it("returns no components for variable-less templates", () => {
    const template = makeTemplate({
      bodyTemplate: "Estamos abertos!",
      variableCount: 0,
      variableLabels: [],
    });
    expect(renderTemplate(template, []).components).toEqual([]);
  });

  it("throws on wrong variable count or blank values (RF-011)", () => {
    expect(() => renderTemplate(makeTemplate(), ["só uma"])).toThrow(TemplateRenderError);
    expect(() => renderTemplate(makeTemplate(), ["ok", "  "])).toThrow(/preenchidas/);
  });
});

describe("countTemplateVariables (RF-031)", () => {
  it("counts distinct {{N}} markers", () => {
    expect(countTemplateVariables("Olá {{1}}, pedido {{2}} de {{1}}")).toBe(2);
    expect(countTemplateVariables("sem variável")).toBe(0);
    expect(countTemplateVariables("{{1}} {{2}} {{3}} {{4}}")).toBe(4);
  });
});
