import { describe, expect, it } from "vitest";
import type { IBoardCard } from "./boardBuckets";
import { BOARD_SORT_MODES, defaultSortForKind, sortBoardCards } from "./boardSort";

const NOW = new Date("2026-08-06T12:00:00.000Z");

function card(
  id: string,
  createdAt: string,
  nextActionAt: string | undefined,
  value: number,
  enteredStageAt: string,
): IBoardCard {
  return {
    lead: { id, name: id, createdAt, nextActionAt } as unknown as IBoardCard["lead"],
    entry: {
      id: `e-${id}`,
      leadId: id,
      estimatedValue: value,
      enteredStageAt,
    } as unknown as IBoardCard["entry"],
  };
}

const A = card("a", "2026-01-01T00:00:00.000Z", "2026-08-10T00:00:00.000Z", 100, "2026-08-05T00:00:00.000Z");
const B = card("b", "2026-06-01T00:00:00.000Z", "2026-08-02T00:00:00.000Z", 900, "2026-01-01T00:00:00.000Z");
const C = card("c", "2026-03-01T00:00:00.000Z", undefined, 500, "2026-07-01T00:00:00.000Z");
const CARDS = [A, B, C];

const ids = (cards: IBoardCard[]) => cards.map((c) => c.lead.id);

describe("defaultSortForKind", () => {
  it("põe os mais antigos primeiro na etapa de entrada", () => {
    expect(defaultSortForKind("entrada")).toBe("oldest");
  });

  it("ordena as demais etapas por próxima ação", () => {
    for (const kind of ["aberta", "ganho", "perda"] as const) {
      expect(defaultSortForKind(kind)).toBe("nextAction");
    }
  });
});

describe("sortBoardCards", () => {
  it("oldest: do mais antigo ao mais novo por criação", () => {
    expect(ids(sortBoardCards(CARDS, "oldest", NOW))).toEqual(["a", "c", "b"]);
  });

  it("newest: o inverso exato de oldest", () => {
    expect(ids(sortBoardCards(CARDS, "newest", NOW))).toEqual(["b", "c", "a"]);
  });

  it("nextAction: quem tem data vem antes; sem data vai para o fim", () => {
    expect(ids(sortBoardCards(CARDS, "nextAction", NOW))).toEqual(["b", "a", "c"]);
  });

  it("highestValue: pelo valor da participação, decrescente", () => {
    expect(ids(sortBoardCards(CARDS, "highestValue", NOW))).toEqual(["b", "c", "a"]);
  });

  it("stalest: mais tempo parado na etapa primeiro", () => {
    expect(ids(sortBoardCards(CARDS, "stalest", NOW))).toEqual(["b", "c", "a"]);
  });

  it("highestValue trata participação sem valor como zero", () => {
    const noValue = { ...A, entry: { ...A.entry, estimatedValue: undefined } };
    expect(ids(sortBoardCards([noValue, C], "highestValue", NOW))).toEqual(["c", "a"]);
  });

  it("não muta o array recebido", () => {
    const original = [...CARDS];
    sortBoardCards(CARDS, "highestValue", NOW);
    expect(CARDS).toEqual(original);
  });

  it("expõe os cinco modos que o menu oferece", () => {
    expect(BOARD_SORT_MODES).toEqual([
      "oldest",
      "newest",
      "nextAction",
      "highestValue",
      "stalest",
    ]);
  });
});
