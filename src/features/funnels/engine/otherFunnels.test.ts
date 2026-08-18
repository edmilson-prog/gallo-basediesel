import { describe, expect, it } from "vitest";
import type { ILeadFunnelChip } from "../hooks/useLeadFunnelChips";
import { otherFunnelsFor } from "./otherFunnels";

const chip = (funnelId: string, name: string): ILeadFunnelChip => ({
  funnelId,
  name,
  accent: 1,
});

describe("otherFunnelsFor", () => {
  it("exclui o funil do board corrente", () => {
    const out = otherFunnelsFor([chip("a", "Catalisador"), chip("b", "Filtros")], "a");
    expect(out.map((c) => c.funnelId)).toEqual(["b"]);
  });

  it("devolve vazio quando o lead só está no funil corrente", () => {
    expect(otherFunnelsFor([chip("a", "Catalisador")], "a")).toEqual([]);
  });

  it("devolve vazio quando o lead não tem chips carregados", () => {
    expect(otherFunnelsFor(undefined, "a")).toEqual([]);
  });

  it("devolve vazio para lista vazia", () => {
    expect(otherFunnelsFor([], "a")).toEqual([]);
  });

  it("não conta o mesmo funil duas vezes", () => {
    const out = otherFunnelsFor([chip("b", "Filtros"), chip("b", "Filtros")], "a");
    expect(out).toHaveLength(1);
  });

  it("preserva a ordem em que os funis chegaram", () => {
    const out = otherFunnelsFor([chip("c", "Módulos"), chip("b", "Filtros")], "a");
    expect(out.map((c) => c.name)).toEqual(["Módulos", "Filtros"]);
  });

  it("não muta a lista recebida", () => {
    const chips = [chip("a", "Catalisador"), chip("b", "Filtros")];
    const snapshot = [...chips];
    otherFunnelsFor(chips, "a");
    expect(chips).toEqual(snapshot);
  });
});
