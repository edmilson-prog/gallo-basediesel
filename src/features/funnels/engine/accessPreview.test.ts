import { describe, expect, it } from "vitest";
import type { ISeller } from "@/shared/types";
import { resolveAccessPreview } from "./accessPreview";

const seller = (id: string, fullName: string): ISeller => ({ id, fullName }) as ISeller;

const LUCAS = seller("s1", "Lucas Cardoso");
const WELLINGTON = seller("s2", "Wellington Nunes");
const TIAGO = seller("s3", "Tiago Ribeiro");
const MARINA = seller("s4", "Marina Cardoso"); // gestora
const SELLERS = [LUCAS, WELLINGTON, TIAGO, MARINA];

const names = (list: ISeller[]) => list.map((s) => s.fullName);

describe("resolveAccessPreview", () => {
  it("sem ninguém marcado e sem abrir para a loja, só o staff enxerga", () => {
    const view = resolveAccessPreview({
      sellers: SELLERS,
      grantedIds: [],
      openToStore: false,
      staffIds: ["s4"],
    });
    expect(names(view.viaRole)).toEqual(["Marina Cardoso"]);
    expect(view.viaStore).toEqual([]);
    expect(view.viaGrant).toEqual([]);
    expect(view.reachCount).toBe(1);
    expect(view.isEmpty).toBe(true);
  });

  it("isEmpty olha só quem não é staff — o funil sem vendedor nenhum é o aviso", () => {
    // Dono e gestor enxergam tudo por papel; se a lista parasse neles, o aviso
    // "ninguém enxerga" nunca apareceria e perderia a função.
    const view = resolveAccessPreview({
      sellers: SELLERS,
      grantedIds: ["s1"],
      openToStore: false,
      staffIds: ["s4"],
    });
    expect(view.isEmpty).toBe(false);
  });

  it("abrir para a loja traz todos os vendedores", () => {
    const view = resolveAccessPreview({
      sellers: SELLERS,
      grantedIds: [],
      openToStore: true,
      staffIds: ["s4"],
    });
    expect(names(view.viaStore).sort()).toEqual(
      ["Lucas Cardoso", "Tiago Ribeiro", "Wellington Nunes"].sort(),
    );
    expect(view.reachCount).toBe(4);
  });

  it("as duas dimensões somam, e ninguém é contado duas vezes", () => {
    const view = resolveAccessPreview({
      sellers: SELLERS,
      grantedIds: ["s1", "s2"],
      openToStore: true,
      staffIds: ["s4"],
    });
    expect(view.reachCount).toBe(4);
    expect(view.viaGrant).toEqual([]);
  });

  it("quem entra por papel não aparece como marcado, mesmo se estiver na lista", () => {
    const view = resolveAccessPreview({
      sellers: SELLERS,
      grantedIds: ["s4"],
      openToStore: false,
      staffIds: ["s4"],
    });
    expect(names(view.viaRole)).toEqual(["Marina Cardoso"]);
    expect(view.viaGrant).toEqual([]);
    expect(view.reachCount).toBe(1);
  });

  it("marcação nominal sozinha traz só quem foi marcado", () => {
    const view = resolveAccessPreview({
      sellers: SELLERS,
      grantedIds: ["s1", "s3"],
      openToStore: false,
      staffIds: [],
    });
    expect(names(view.viaGrant).sort()).toEqual(["Lucas Cardoso", "Tiago Ribeiro"]);
    expect(view.reachCount).toBe(2);
  });

  it("ignora id marcado que não corresponde a vendedor algum", () => {
    const view = resolveAccessPreview({
      sellers: SELLERS,
      grantedIds: ["fantasma"],
      openToStore: false,
      staffIds: [],
    });
    expect(view.reachCount).toBe(0);
    expect(view.isEmpty).toBe(true);
  });

  it("loja sem vendedores devolve tudo vazio sem quebrar", () => {
    const view = resolveAccessPreview({
      sellers: [],
      grantedIds: ["s1"],
      openToStore: true,
      staffIds: [],
    });
    expect(view).toEqual({
      reachCount: 0,
      viaRole: [],
      viaStore: [],
      viaGrant: [],
      isEmpty: true,
    });
  });

  it("preserva a ordem em que os vendedores chegaram", () => {
    const view = resolveAccessPreview({
      sellers: SELLERS,
      grantedIds: ["s3", "s1"],
      openToStore: false,
      staffIds: [],
    });
    expect(names(view.viaGrant)).toEqual(["Lucas Cardoso", "Tiago Ribeiro"]);
  });
});
