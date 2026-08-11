import { describe, expect, it } from "vitest";
import type { IConversation } from "@/shared/types";
import { canPinMore, mergePinnedFirst, resolveMaxPinned, shouldShowPinnedBlock } from "./pinPolicy";

/** Minimal conversation — only the field the engine reads (id). */
function conv(id: string): IConversation {
  return { id } as IConversation;
}

describe("resolveMaxPinned", () => {
  it("cai no padrão 5 quando o valor está ausente", () => {
    expect(resolveMaxPinned(undefined)).toBe(5);
  });

  it("cai no padrão quando o valor não é um número finito", () => {
    expect(resolveMaxPinned(Number.NaN)).toBe(5);
    expect(resolveMaxPinned(Number.POSITIVE_INFINITY)).toBe(5);
  });

  it("prende o valor na faixa [1, 20]", () => {
    expect(resolveMaxPinned(0)).toBe(1);
    expect(resolveMaxPinned(-3)).toBe(1);
    expect(resolveMaxPinned(999)).toBe(20);
  });

  it("trunca fração para inteiro", () => {
    expect(resolveMaxPinned(7.5)).toBe(7);
  });

  it("preserva um valor válido", () => {
    expect(resolveMaxPinned(3)).toBe(3);
  });
});

describe("canPinMore", () => {
  it("libera abaixo do teto", () => {
    expect(canPinMore(4, 5)).toBe(true);
  });

  it("bloqueia no teto", () => {
    expect(canPinMore(5, 5)).toBe(false);
  });

  it("bloqueia acima do teto (teto reduzido depois de já ter fixado)", () => {
    expect(canPinMore(7, 5)).toBe(false);
  });
});

describe("shouldShowPinnedBlock", () => {
  it("esconde quando não há nenhuma fixada", () => {
    expect(
      shouldShowPinnedBlock({ searchActive: false, messageSearchActive: false, pinnedCount: 0 }),
    ).toBe(false);
  });

  it("esconde durante busca por texto", () => {
    expect(
      shouldShowPinnedBlock({ searchActive: true, messageSearchActive: false, pinnedCount: 3 }),
    ).toBe(false);
  });

  it("esconde no modo de busca em mensagens", () => {
    expect(
      shouldShowPinnedBlock({ searchActive: false, messageSearchActive: true, pinnedCount: 3 }),
    ).toBe(false);
  });

  it("mostra no caso normal", () => {
    expect(
      shouldShowPinnedBlock({ searchActive: false, messageSearchActive: false, pinnedCount: 3 }),
    ).toBe(true);
  });
});

describe("mergePinnedFirst", () => {
  it("coloca as fixadas na frente e preserva a ordem de cada lado", () => {
    const result = mergePinnedFirst([conv("p1"), conv("p2")], [conv("a"), conv("b")]);
    expect(result.items.map((c) => c.id)).toEqual(["p1", "p2", "a", "b"]);
    expect(result.pinnedCount).toBe(2);
  });

  it("não duplica a fixada que também veio na lista", () => {
    const result = mergePinnedFirst([conv("p1")], [conv("a"), conv("p1"), conv("b")]);
    expect(result.items.map((c) => c.id)).toEqual(["p1", "a", "b"]);
    expect(result.pinnedCount).toBe(1);
  });

  it("sem fixadas devolve a lista intacta", () => {
    const result = mergePinnedFirst([], [conv("a"), conv("b")]);
    expect(result.items.map((c) => c.id)).toEqual(["a", "b"]);
    expect(result.pinnedCount).toBe(0);
  });

  it("sem lista devolve só as fixadas", () => {
    const result = mergePinnedFirst([conv("p1")], []);
    expect(result.items.map((c) => c.id)).toEqual(["p1"]);
    expect(result.pinnedCount).toBe(1);
  });
});
