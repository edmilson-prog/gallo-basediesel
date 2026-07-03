import type { ConversationStatus } from "@/shared/types";

/**
 * Status ⇄ assignment coupling (spec 2026-07-02-unify + 2026-07-03-attendance-close).
 * OPEN unowned ⇒ aguardando (queue); owned ⇒ being attended; TERMINAL (resolvida
 * ∪ arquivada) ⇒ always unowned and exempt from the queue invariant. A customer
 * inbound reopens a terminal conversation back to the queue.
 */

/** Closed axis — hidden by default, unowned, reopened on inbound. */
export const TERMINAL_STATUSES: ReadonlySet<ConversationStatus> = new Set([
  "resolvida",
  "arquivada",
]);

export function isTerminalStatus(s: ConversationStatus): boolean {
  return TERMINAL_STATUSES.has(s);
}

/** Assigning someone pulls a queued conversation into "being attended". */
export function statusOnAssign(current: ConversationStatus): ConversationStatus | null {
  return current === "aguardando" ? "em_andamento" : null;
}

/**
 * Unassigning returns the conversation to the queue — except the terminal axis
 * (already unowned/closed) and aguardando (already queued).
 */
export function statusOnUnassign(current: ConversationStatus): ConversationStatus | null {
  if (isTerminalStatus(current) || current === "aguardando") return null;
  return "aguardando";
}

export type ManualStatusCoupling = "assign-self" | "unassign" | "close" | null;

/**
 * Manual status change coupling: closing an owned conversation (→ terminal)
 * strips the owner atomically ('close'); picking an "owned" status on an unowned
 * conversation claims it ('assign-self'); picking "aguardando" on an owned one
 * returns it to the queue ('unassign').
 */
export function coupleManualStatusChange(
  next: ConversationStatus,
  hasAssignee: boolean,
): ManualStatusCoupling {
  if (hasAssignee && isTerminalStatus(next)) return "close";
  if (!hasAssignee && (next === "em_andamento" || next === "aguardando_cliente"))
    return "assign-self";
  if (hasAssignee && next === "aguardando") return "unassign";
  return null;
}

/** A customer inbound reopens a terminal conversation to the queue. */
export function reopenOnInbound(current: ConversationStatus): ConversationStatus | null {
  return isTerminalStatus(current) ? "aguardando" : null;
}
