import type { LeadFunnelStageKind } from "@/shared/types";

/**
 * Legacy terminal stage id, seeded before stages carried a lifecycle role.
 * Only consulted when a stage has no explicit `kind` — i.e. until the phase 2
 * migration lands. Mirrors CLOSING_STAGE_ID in features/leads/utils/leadDisplay.
 */
const LEGACY_CLOSING_STAGE_ID = "stage-fechado";

export interface IStageKindInput {
  id: string;
  kind?: LeadFunnelStageKind;
}

/**
 * The lifecycle role of a stage. Prefers the explicit `kind`; falls back to the
 * legacy id heuristic so this predicate can replace every CLOSING_STAGE_ID
 * comparison today, before the new stage table exists.
 *
 * The legacy closing stage conflated both outcomes, so it resolves to 'ganho' —
 * lost leads were already distinguished by `lossReason`, never by the stage.
 */
export function resolveStageKind(stage: IStageKindInput): LeadFunnelStageKind {
  if (stage.kind) return stage.kind;
  return stage.id === LEGACY_CLOSING_STAGE_ID ? "ganho" : "aberta";
}

/** Terminal stages — reaching one closes the lead's participation in the funnel. */
export function isClosingKind(kind: LeadFunnelStageKind): boolean {
  return kind === "ganho" || kind === "perda";
}
