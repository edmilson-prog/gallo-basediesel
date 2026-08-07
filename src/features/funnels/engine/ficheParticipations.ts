import type { ID, ILeadFunnel, ILeadFunnelEntry, ILeadFunnelStage } from "@/shared/types";

export interface IFicheParticipation {
  entry: ILeadFunnelEntry;
  funnel: ILeadFunnel;
  /** Absent while the funnel's stages are in flight, or if the stage is gone. */
  stage: ILeadFunnelStage | undefined;
}

export interface IFicheInput {
  entries: ILeadFunnelEntry[];
  /** Only the funnels this user reaches. */
  funnels: ILeadFunnel[];
  stagesByFunnel: Map<ID, ILeadFunnelStage[]>;
  maxVisible: number;
}

export interface IFicheView {
  visible: IFicheParticipation[];
  /** Reachable, but past `maxVisible`. */
  hiddenCount: number;
  /** Participations in funnels the user cannot reach — counted, never named. */
  lockedCount: number;
}

/**
 * What the conversation fiche shows about a lead's funnels.
 *
 * The gated RPC returns participations the user may see because they handle the
 * lead — including ones in funnels they have no access to. That is the
 * `seller_handles_lead` branch of the policy, and the owner's decision that a
 * funnel filters the board, never the existence of the lead.
 *
 * Those become a count behind a padlock. Without the line the list looks
 * incomplete with no explanation; with the names it would leak the commercial
 * structure that funnel access exists to partition.
 *
 * The default funnel sorts last. It is the triage everything enters through —
 * someone in the middle of a conversation acts on the product-line funnels,
 * not on the holding pen.
 */
export function resolveFicheParticipations({
  entries,
  funnels,
  stagesByFunnel,
  maxVisible,
}: IFicheInput): IFicheView {
  const funnelById = new Map(funnels.map((f) => [f.id, f]));

  const seen = new Set<ID>();
  const reachable: IFicheParticipation[] = [];
  let lockedCount = 0;

  for (const entry of entries) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);

    const funnel = funnelById.get(entry.funnelId);
    if (!funnel) {
      lockedCount += 1;
      continue;
    }

    reachable.push({
      entry,
      funnel,
      stage: stagesByFunnel.get(funnel.id)?.find((s) => s.id === entry.stageId),
    });
  }

  reachable.sort((a, b) => {
    if (a.funnel.isDefault !== b.funnel.isDefault) return a.funnel.isDefault ? 1 : -1;
    return a.funnel.position - b.funnel.position;
  });

  return {
    visible: reachable.slice(0, maxVisible),
    hiddenCount: Math.max(0, reachable.length - maxVisible),
    lockedCount,
  };
}
