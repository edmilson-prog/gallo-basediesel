import type { ID, ILead, ILeadFunnelEntry, ILeadFunnelStage } from "@/shared/types";

/** Um lead e a participação dele NESTE funil. O board não conhece outro par. */
export interface IBoardCard {
  lead: ILead;
  entry: ILeadFunnelEntry;
}

export interface IBucketInput {
  leads: ILead[];
  entriesByLead: Map<ID, ILeadFunnelEntry>;
  stages: ILeadFunnelStage[];
}

/**
 * Agrupa por `entry.stageId`, nunca por `lead.stage.id`.
 *
 * O snapshot `lead.stage` é o pipeline legado da loja: com N funis ele responde
 * por um só, e usá-lo aqui colocaria o mesmo lead na mesma coluna em todos os
 * boards. A etapa de verdade vive na participação.
 *
 * Lead sem participação e participação órfã são descartados em silêncio: os
 * dois só aparecem em janelas de cache morno (troca de funil, etapa recém
 * apagada) e um balde de "sem etapa" seria uma coluna que a spec não prevê.
 */
export function bucketLeadsByStage({
  leads,
  entriesByLead,
  stages,
}: IBucketInput): Map<ID, IBoardCard[]> {
  const buckets = new Map<ID, IBoardCard[]>();
  for (const s of stages) buckets.set(s.id, []);

  for (const lead of leads) {
    const entry = entriesByLead.get(lead.id);
    if (!entry) continue;
    const bucket = buckets.get(entry.stageId);
    if (!bucket) continue;
    bucket.push({ lead, entry });
  }

  return buckets;
}
