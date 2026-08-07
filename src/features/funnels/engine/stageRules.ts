import type { FunnelAccent, ID, LeadFunnelStageKind } from "@/shared/types";

/** A stage while it is being edited — before it has a row. */
export interface IStageDraft {
  id: ID;
  name: string;
  kind: LeadFunnelStageKind;
  accent: FunnelAccent;
  position: number;
}

export type StageIssue =
  | "missing_entrada"
  | "missing_ganho"
  | "missing_perda"
  | "too_many_terminals"
  | "duplicate_name"
  | "empty_name"
  | "name_too_long";

/** The column's own limit; longer names also break the board's column header. */
const NAME_MAX = 24;

/** Exactly one of each of these may exist in a funnel. */
const SINGULAR_KINDS: LeadFunnelStageKind[] = ["entrada", "ganho", "perda"];

/**
 * Everything wrong with a set of stages, at once.
 *
 * The database enforces the terminal rules through a deferred constraint
 * trigger, so an invalid set is rejected regardless. This exists so the person
 * editing hears it before they lose the work, and beside the field rather than
 * in a toast after the click.
 */
export function validateStageSet(stages: IStageDraft[]): StageIssue[] {
  const issues = new Set<StageIssue>();

  const countByKind = new Map<LeadFunnelStageKind, number>();
  for (const s of stages) countByKind.set(s.kind, (countByKind.get(s.kind) ?? 0) + 1);

  for (const kind of SINGULAR_KINDS) {
    const n = countByKind.get(kind) ?? 0;
    if (n === 0) issues.add(`missing_${kind}` as StageIssue);
    if (n > 1) issues.add("too_many_terminals");
  }

  const seenNames = new Set<string>();
  for (const s of stages) {
    const name = s.name.trim();
    if (name.length === 0) {
      issues.add("empty_name");
      continue;
    }
    if (name.length > NAME_MAX) issues.add("name_too_long");

    const key = name.toLowerCase();
    if (seenNames.has(key)) issues.add("duplicate_name");
    seenNames.add(key);
  }

  return [...issues];
}

export type DeleteBlockReason = "terminal" | "has_leads" | "last_open";

export interface ICanDeleteInput {
  stage: IStageDraft;
  /** Participations currently sitting on this stage. */
  leadCount: number;
  all: IStageDraft[];
}

/**
 * Whether a stage may be removed, and why not.
 *
 * The order of the checks is the message the user gets, so it is deliberate:
 * "terminal" wins over "has leads", because telling somebody to move the leads
 * out of a won/lost stage offers them a path that unblocks nothing.
 *
 * `has_leads` exists because `lead_funnel_entries.stage_id` carries a foreign
 * key with no cascade — deleting would raise 23503. The UI asks where the leads
 * should go instead of letting Postgres refuse.
 */
export function canDeleteStage({
  stage,
  leadCount,
  all,
}: ICanDeleteInput): { allowed: boolean; reason?: DeleteBlockReason } {
  if (stage.kind !== "aberta") return { allowed: false, reason: "terminal" };
  if (leadCount > 0) return { allowed: false, reason: "has_leads" };
  if (all.filter((s) => s.kind === "aberta").length <= 1) {
    return { allowed: false, reason: "last_open" };
  }
  return { allowed: true };
}
