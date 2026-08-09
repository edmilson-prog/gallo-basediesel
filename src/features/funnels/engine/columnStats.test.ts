import { describe, expect, it } from "vitest";
import type { IBoardCard } from "./boardBuckets";
import { resolveColumnStats } from "./columnStats";

const NOW = new Date("2026-08-06T12:00:00.000Z");

function card(
  id: string,
  value: number | undefined,
  nextActionAt: string | undefined,
  enteredStageAt: string,
): IBoardCard {
  return {
    lead: { id, name: id, nextActionAt } as unknown as IBoardCard["lead"],
    entry: {
      id: `e-${id}`,
      leadId: id,
      estimatedValue: value,
      enteredStageAt,
    } as unknown as IBoardCard["entry"],
  };
}

const CARDS = [
  card("a", 1000, "2026-08-01T12:00:00.000Z", "2026-08-04T12:00:00.000Z"), // atrasado, 2 dias
  card("b", 500, "2026-08-20T12:00:00.000Z", "2026-08-02T12:00:00.000Z"), // 4 dias
  card("c", undefined, undefined, "2026-07-31T12:00:00.000Z"), // 6 dias
];

describe("resolveColumnStats", () => {
  it("prefere o agregado do servidor ao que está carregado no cliente", () => {
    const stats = resolveColumnStats({
      cards: CARDS,
      summary: { stageId: "s", count: 903, sumValue: 750_000, overdueCount: 87 },
      now: NOW,
    });
    expect(stats.count).toBe(903);
    expect(stats.sumValue).toBe(750_000);
    expect(stats.overdueCount).toBe(87);
    expect(stats.isPartial).toBe(false);
  });

  it("cai para o cálculo local quando o agregado ainda não chegou", () => {
    const stats = resolveColumnStats({ cards: CARDS, summary: undefined, now: NOW });
    expect(stats.count).toBe(3);
    expect(stats.sumValue).toBe(1500);
    expect(stats.overdueCount).toBe(1);
    expect(stats.isPartial).toBe(true);
  });

  it("soma o valor da PARTICIPAÇÃO, não o do lead", () => {
    // Um lead em dois funis são duas receitas; somar o valor do lead contaria a
    // mesma oportunidade duas vezes (decisão 5 do dono).
    const c = card("x", 200, undefined, "2026-08-01T12:00:00.000Z");
    (c.lead as { estimatedValue?: number }).estimatedValue = 9_999;
    expect(resolveColumnStats({ cards: [c], summary: undefined, now: NOW }).sumValue).toBe(200);
  });

  it("trata participação sem valor como zero, nunca como NaN", () => {
    const stats = resolveColumnStats({ cards: [CARDS[2]!], summary: undefined, now: NOW });
    expect(stats.sumValue).toBe(0);
  });

  it("calcula a média de dias na etapa a partir de enteredStageAt", () => {
    // 2, 4 e 6 dias → média 4.
    const stats = resolveColumnStats({ cards: CARDS, summary: undefined, now: NOW });
    expect(stats.averageDays).toBe(4);
  });

  it("devolve média zero para coluna vazia em vez de dividir por zero", () => {
    const stats = resolveColumnStats({ cards: [], summary: undefined, now: NOW });
    expect(stats.averageDays).toBe(0);
    expect(stats.count).toBe(0);
  });

  it("mantém a média local mesmo quando o agregado do servidor manda nos demais", () => {
    // getBoardSummary não carrega média: ela é sempre do conjunto carregado, e
    // o tooltip é quem diz isso ao usuário.
    const stats = resolveColumnStats({
      cards: CARDS,
      summary: { stageId: "s", count: 903, sumValue: 750_000, overdueCount: 87 },
      now: NOW,
    });
    expect(stats.averageDays).toBe(4);
  });
});
