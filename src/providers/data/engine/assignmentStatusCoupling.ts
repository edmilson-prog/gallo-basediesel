import type { ConversationStatus } from "@/shared/types";

/**
 * Status ⇄ assignment coupling (spec 2026-07-02-unify-queue-assignment):
 * an OPEN conversation without an assignee sits in the queue (`aguardando`);
 * an assigned conversation is being attended (`em_andamento`). These helpers
 * are the single source of the transitions applied by assignSeller/unassign
 * (mock + supabase) and by the manual StatusControl coupling. The archive
 * axis is manual-only and never auto-touched.
 */

/** Assigning someone pulls a queued conversation into "being attended". */
export function statusOnAssign(current: ConversationStatus): ConversationStatus | null {
  return current === "aguardando" ? "em_andamento" : null;
}

/** Unassigning returns the conversation to the queue — except the archive axis. */
export function statusOnUnassign(current: ConversationStatus): ConversationStatus | null {
  if (current === "arquivada" || current === "aguardando") return null;
  return "aguardando";
}

export type ManualStatusCoupling = "assign-self" | "unassign" | null;

/**
 * Manual status change coupling (owner-approved corollary): picking an
 * "owned" status on an unowned conversation claims it for the actor; picking
 * "aguardando" on an owned conversation returns it to the queue.
 */
export function coupleManualStatusChange(
  next: ConversationStatus,
  hasAssignee: boolean,
): ManualStatusCoupling {
  if (!hasAssignee && (next === "em_andamento" || next === "aguardando_cliente"))
    return "assign-self";
  if (hasAssignee && next === "aguardando") return "unassign";
  return null;
}
