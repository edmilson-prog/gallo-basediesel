import { describe, expect, it } from "vitest";
import type { ILeadFunnel, ILeadFunnelEntry, ILeadFunnelStage } from "@/shared/types";
import { resolveFicheParticipations } from "./ficheParticipations";

const funnel = (id: string, name: string, position: number, isDefault = false): ILeadFunnel =>
  ({
    id,
    name,
    position,
    isDefault,
    accent: 1,
    icon: "mdi:filter-variant",
    storeId: "s1",
    openToStore: true,
    entryAlertThreshold: 50,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }) as ILeadFunnel;

const stage = (id: string, funnelId: string, name: string): ILeadFunnelStage => ({
  id,
  funnelId,
  name,
  accent: 1,
  position: 0,
  kind: "aberta",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const entry = (id: string, funnelId: string, stageId: string): ILeadFunnelEntry =>
  ({
    id,
    leadId: "l1",
    funnelId,
    stageId,
    storeId: "s1",
    sellerId: null,
    enteredStageAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }) as ILeadFunnelEntry;

const GERAL = funnel("f-geral", "Geral", 0, true);
const CAT = funnel("f-cat", "Catalisador", 1);
const FIL = funnel("f-fil", "Filtros", 2);

describe("resolveFicheParticipations", () => {
  it("junta cada participação com o funil e a etapa dela", () => {
    const view = resolveFicheParticipations({
      entries: [entry("e1", "f-cat", "s-cat")],
      funnels: [CAT],
      stagesByFunnel: new Map([["f-cat", [stage("s-cat", "f-cat", "Em negociação")]]]),
      maxVisible: 3,
    });
    expect(view.visible).toHaveLength(1);
    expect(view.visible[0]!.funnel.name).toBe("Catalisador");
    expect(view.visible[0]!.stage?.name).toBe("Em negociação");
  });

  it("conta como bloqueada a participação em funil que o usuário não alcança", () => {
    // A RLS devolve a participação (o vendedor cuida do lead), mas não o funil.
    // Sem essa contagem a lista parece incompleta sem explicação; com os nomes,
    // vazaria a estrutura comercial.
    const view = resolveFicheParticipations({
      entries: [entry("e1", "f-cat", "s-cat"), entry("e2", "f-oculto", "s-x")],
      funnels: [CAT],
      stagesByFunnel: new Map([["f-cat", [stage("s-cat", "f-cat", "Em negociação")]]]),
      maxVisible: 3,
    });
    expect(view.visible).toHaveLength(1);
    expect(view.lockedCount).toBe(1);
  });

  it("põe o funil padrão por último, não primeiro", () => {
    // Geral é triagem: quem atende age nos funis de linha, não no depósito.
    const view = resolveFicheParticipations({
      entries: [entry("e1", "f-geral", "sg"), entry("e2", "f-cat", "sc")],
      funnels: [GERAL, CAT],
      stagesByFunnel: new Map(),
      maxVisible: 3,
    });
    expect(view.visible.map((p) => p.funnel.name)).toEqual(["Catalisador", "Geral"]);
  });

  it("ordena os não-padrão pela posição do funil", () => {
    const view = resolveFicheParticipations({
      entries: [entry("e2", "f-fil", "x"), entry("e1", "f-cat", "y")],
      funnels: [CAT, FIL],
      stagesByFunnel: new Map(),
      maxVisible: 3,
    });
    expect(view.visible.map((p) => p.funnel.name)).toEqual(["Catalisador", "Filtros"]);
  });

  it("mostra no máximo `maxVisible` e informa quantas ficaram de fora", () => {
    const view = resolveFicheParticipations({
      entries: [entry("e1", "f-cat", "a"), entry("e2", "f-fil", "b"), entry("e3", "f-geral", "c")],
      funnels: [CAT, FIL, GERAL],
      stagesByFunnel: new Map(),
      maxVisible: 2,
    });
    expect(view.visible).toHaveLength(2);
    expect(view.hiddenCount).toBe(1);
  });

  it("não esconde nada quando cabe tudo", () => {
    const view = resolveFicheParticipations({
      entries: [entry("e1", "f-cat", "a")],
      funnels: [CAT],
      stagesByFunnel: new Map(),
      maxVisible: 3,
    });
    expect(view.hiddenCount).toBe(0);
  });

  it("devolve a etapa como undefined quando ela não veio, sem quebrar", () => {
    const view = resolveFicheParticipations({
      entries: [entry("e1", "f-cat", "etapa-sumida")],
      funnels: [CAT],
      stagesByFunnel: new Map([["f-cat", [stage("outra", "f-cat", "Outra")]]]),
      maxVisible: 3,
    });
    expect(view.visible[0]!.stage).toBeUndefined();
  });

  it("lida com lead sem nenhuma participação", () => {
    const view = resolveFicheParticipations({
      entries: [],
      funnels: [CAT],
      stagesByFunnel: new Map(),
      maxVisible: 3,
    });
    expect(view).toEqual({ visible: [], hiddenCount: 0, lockedCount: 0 });
  });

  it("não conta a mesma participação duas vezes se a RPC repetir", () => {
    const view = resolveFicheParticipations({
      entries: [entry("e1", "f-cat", "a"), entry("e1", "f-cat", "a")],
      funnels: [CAT],
      stagesByFunnel: new Map(),
      maxVisible: 3,
    });
    expect(view.visible).toHaveLength(1);
  });

  it("com maxVisible infinito mostra tudo e não esconde nada", () => {
    // É o que o "ver todas" passa.
    const view = resolveFicheParticipations({
      entries: [entry("e1", "f-cat", "a"), entry("e2", "f-fil", "b"), entry("e3", "f-geral", "c")],
      funnels: [CAT, FIL, GERAL],
      stagesByFunnel: new Map(),
      maxVisible: Number.POSITIVE_INFINITY,
    });
    expect(view.visible).toHaveLength(3);
    expect(view.hiddenCount).toBe(0);
  });
});
