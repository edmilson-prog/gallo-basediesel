import type { ConversationStatus } from "@/shared/types";

/**
 * Audit action name for a status transition — mirrors ConversationMenu's
 * archive/resolve audit actions (each toggle logs one action name regardless
 * of direction), so the unified status control logs the same semantic action
 * as the kebab shortcuts. Archive is checked before resolve: a transition
 * that touches "arquivada" on either end (e.g. resolvida -> arquivada, or
 * arquivada -> resolvida) is fundamentally an archive/unarchive event, not a
 * resolve event, even when the other end is "resolvida".
 */
export function actionForTransition(
  from: ConversationStatus,
  to: ConversationStatus,
): string | undefined {
  if (from === "arquivada" || to === "arquivada") return "conversation.archive";
  if (from === "resolvida" || to === "resolvida") return "conversation.resolve";
  return undefined;
}
