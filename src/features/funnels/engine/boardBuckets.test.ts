import { describe, expect, it } from "vitest";
import type { ILead, ILeadFunnelEntry, ILeadFunnelStage } from "@/shared/types";
import { bucketLeadsByStage } from "./boardBuckets";

const stage = (id: string, position: number): ILeadFunnelStage => ({
  id,
  funnelId: "f1",
  name: id,
  accent: 1,
  position,
  kind: "aberta",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const lead = (id: string): ILead => ({ id, name: id }) as unknown as ILead;

const entry = (leadId: string, stageId: string): ILeadFunnelEntry => ({
  id: `e-${leadId}`,
  leadId,
  funnelId: "f1",
  stageId,
  storeId: "s1",
  sellerId: null,
  enteredStageAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const STAGES = [stage("novo", 0), stage("andamento", 1)];

describe("bucketLeadsByStage", () => {
  it("põe o lead na etapa da participação, não na do snapshot do lead", () => {
    const leads = [{ ...lead("l1"), stage: { id: "outra", name: "Outra" } } as unknown as ILead];
    const entriesByLead = new Map([["l1", entry("l1", "andamento")]]);
    const buckets = bucketLeadsByStage({ leads, entriesByLead, stages: STAGES });
    expect(buckets.get("andamento")?.map((c) => c.lead.id)).toEqual(["l1"]);
    expect(buckets.get("novo")).toEqual([]);
  });

  it("cria um balde vazio para toda etapa, mesmo sem lead", () => {
    const buckets = bucketLeadsByStage({ leads: [], entriesByLead: new Map(), stages: STAGES });
    expect([...buckets.keys()]).toEqual(["novo", "andamento"]);
    expect([...buckets.values()].every((v) => v.length === 0)).toBe(true);
  });

  it("descarta lead sem participação neste funil", () => {
    // O fetch é escopado pelo funil, mas cache morno durante a troca de funil
    // entrega leads do funil anterior. Sem este descarte eles apareceriam
    // empilhados na primeira coluna.
    const buckets = bucketLeadsByStage({
      leads: [lead("l1"), lead("l2")],
      entriesByLead: new Map([["l1", entry("l1", "novo")]]),
      stages: STAGES,
    });
    expect(buckets.get("novo")?.map((c) => c.lead.id)).toEqual(["l1"]);
  });

  it("descarta participação apontando para etapa que não existe mais", () => {
    const buckets = bucketLeadsByStage({
      leads: [lead("l1")],
      entriesByLead: new Map([["l1", entry("l1", "etapa-apagada")]]),
      stages: STAGES,
    });
    expect([...buckets.values()].flat()).toEqual([]);
  });

  it("preserva a ordem de entrada dos leads dentro do balde", () => {
    const buckets = bucketLeadsByStage({
      leads: [lead("l3"), lead("l1"), lead("l2")],
      entriesByLead: new Map([
        ["l1", entry("l1", "novo")],
        ["l2", entry("l2", "novo")],
        ["l3", entry("l3", "novo")],
      ]),
      stages: STAGES,
    });
    expect(buckets.get("novo")?.map((c) => c.lead.id)).toEqual(["l3", "l1", "l2"]);
  });
});
