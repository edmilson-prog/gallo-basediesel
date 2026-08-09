import { describe, expect, it } from "vitest";
import type { ID, IFunnelBoardSummary, ILeadFunnelStage } from "@/shared/types";
import { resolveFunnelReadout } from "./funnelReadout";

function stage(id: string, name: string, kind: ILeadFunnelStage["kind"]): ILeadFunnelStage {
  return { id, name, kind } as ILeadFunnelStage;
}

/** The real board of the print: 1.579 parked on entry, 54 actually worked. */
const STAGES = [
  stage("novo", "Novo", "entrada"),
  stage("qualificacao", "Em qualificação", "aberta"),
  stage("orcamento", "Orçamento enviado", "aberta"),
  stage("negociacao", "Em negociação", "aberta"),
  stage("convertido", "Convertido", "ganho"),
  stage("perdido", "Perdido", "perda"),
];

function summary(
  rows: [string, number, number, number][],
): Map<ID, IFunnelBoardSummary> {
  return new Map(
    rows.map(([stageId, count, sumValue, overdueCount]) => [
      stageId,
      { stageId, count, sumValue, overdueCount },
    ]),
  );
}

const REAL = summary([
  ["novo", 1579, 135_700, 12],
  ["qualificacao", 25, 127_600, 13],
  ["orcamento", 12, 61_400, 4],
  ["negociacao", 17, 84_400, 8],
  ["convertido", 0, 0, 0],
  ["perdido", 1782, 0, 1],
]);

describe("resolveFunnelReadout", () => {
  it("separa etapas de trabalho dos desfechos", () => {
    const r = resolveFunnelReadout({ stages: STAGES, summaryByStage: REAL });
    expect(r.segments.map((s) => s.stage.id)).toEqual([
      "novo",
      "qualificacao",
      "orcamento",
      "negociacao",
    ]);
    expect(r.outcomes.map((s) => s.stage.id)).toEqual(["convertido", "perdido"]);
  });

  it("conta como ativo só o que está numa etapa de trabalho", () => {
    // Os 1.782 perdidos são arquivo: entrassem no total, o diagnóstico da
    // entrada cairia de 97% para 45% e deixaria de descrever o gargalo.
    const r = resolveFunnelReadout({ stages: STAGES, summaryByStage: REAL });
    expect(r.activeCount).toBe(1633);
    expect(r.workedCount).toBe(54);
    expect(r.entryShare).toBe(97);
  });

  it("soma os atrasados apenas das etapas de trabalho", () => {
    // O 1 atrasado da coluna Perdido não é acionável — ninguém trabalha um
    // lead perdido, e somá-lo inflaria o número que o usuário clica.
    const r = resolveFunnelReadout({ stages: STAGES, summaryByStage: REAL });
    expect(r.overdueCount).toBe(37);
  });

  it("distribui a barra sobre o total ativo", () => {
    const r = resolveFunnelReadout({ stages: STAGES, summaryByStage: REAL });
    const total = r.segments.reduce((sum, s) => sum + s.share, 0);
    expect(total).toBeCloseTo(100, 6);
    const [novo] = r.segments;
    expect(novo?.share).toBeCloseTo((1579 / 1633) * 100, 6);
  });

  it("marca parcial quando falta o agregado de alguma etapa", () => {
    const partial = summary([["novo", 10, 0, 0]]);
    const r = resolveFunnelReadout({ stages: STAGES, summaryByStage: partial });
    expect(r.isPartial).toBe(true);
    expect(r.activeCount).toBe(10);
  });

  it("não divide por zero num funil vazio", () => {
    const r = resolveFunnelReadout({
      stages: STAGES,
      summaryByStage: summary(STAGES.map((s) => [s.id, 0, 0, 0])),
    });
    expect(r.entryShare).toBe(0);
    expect(r.segments.every((s) => s.share === 0)).toBe(true);
    expect(r.segments.every((s) => Number.isFinite(s.share))).toBe(true);
  });

  it("funciona em funil sem etapa de entrada", () => {
    // O admin pode modelar um funil só com etapas abertas; nesse caso tudo o
    // que existe já é trabalho, e não há gargalo de entrada a denunciar.
    const noEntry = STAGES.filter((s) => s.kind !== "entrada");
    const r = resolveFunnelReadout({ stages: noEntry, summaryByStage: REAL });
    expect(r.entry).toBeNull();
    expect(r.entryShare).toBe(0);
    expect(r.workedCount).toBe(r.activeCount);
  });

  it("devolve vazio sem etapas", () => {
    const r = resolveFunnelReadout({ stages: [], summaryByStage: new Map() });
    expect(r.segments).toEqual([]);
    expect(r.activeCount).toBe(0);
    expect(r.isPartial).toBe(false);
  });
});
