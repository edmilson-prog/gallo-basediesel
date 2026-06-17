import type {
  DistributionMatchedCriterion,
  ID,
  IDistributionCandidate,
  IRotationQueueState,
  ISeller,
} from "@/shared/types";
import type { IDistributionResult } from "@/features/distribution/engine";
import { selectNextFromRotation } from "./selectNextFromRotation";

/** Criteria where the queue may take over (the 013 "revezamento" zone). */
const ROTATION_GOVERNS: ReadonlySet<DistributionMatchedCriterion> = new Set([
  "round_robin",
  "carga",
  "fallback_fila",
]);

const SKIP_LABEL: Record<string, string> = {
  selected: "rodízio: selecionado",
  skipped_offline: "rodízio: pulado — offline",
  skipped_disabled: "rodízio: pulado — desabilitado",
  skipped_inactive: "rodízio: pulado — inativo",
  skipped_off_hours: "rodízio: pulado — fora do horário",
};

export interface IRotationOverrideResult {
  decision: IDistributionResult;
  /** Pointers to persist when the queue took over; null = no change. */
  pointers: { topRefId: ID; memberByDept: Record<ID, ID> } | null;
}

/**
 * Applies the rotation queue as the source of the "revezamento" — a single
 * consultation point referencing PRD-013 without rewriting it. Carteira and
 * especialidade keep upstream precedence; an empty queue keeps the 013 fallback.
 */
export function applyRotationOverride(
  decision: IDistributionResult,
  state: IRotationQueueState,
  sellersById: Record<ID, ISeller>,
  now: Date,
): IRotationOverrideResult {
  // Manual mode defers distribution by design ("gestor distribui depois") — even
  // though it yields fallback_fila, the queue must NOT auto-assign there.
  if (decision.mode === "manual" || !ROTATION_GOVERNS.has(decision.criterionMatched)) {
    return { decision, pointers: null };
  }

  const result = selectNextFromRotation({
    queue: state.queue,
    participants: state.topParticipants,
    membersByDepartment: state.membersByDepartment,
    sellersById,
    now,
  });

  if (!result.selectedSellerId) return { decision, pointers: null };

  const candidatesEvaluated: IDistributionCandidate[] = result.candidates.map((c) => ({
    sellerId: c.refId,
    reason: SKIP_LABEL[c.reason] ?? c.reason,
    selected: c.selected && c.refType === "seller",
  }));

  return {
    decision: {
      ...decision,
      selectedSellerId: result.selectedSellerId,
      status: "em_andamento",
      isSdrActive: false,
      criterionMatched: "round_robin", // the queue IS the revezamento (no new enum)
      candidatesEvaluated,
    },
    pointers: { topRefId: result.nextTopPointer ?? result.selectedSellerId, memberByDept: result.nextMemberPointerByDept },
  };
}
