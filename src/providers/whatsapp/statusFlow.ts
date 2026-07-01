/**
 * Conversation status transitions ("whose turn is it") — pure & runtime-agnostic
 * (no imports, Web-API-free) so it mirrors into the Edge tree and is unit-tested.
 * Consumed by the outbound send core.
 */
export type ConversationStatusValue =
  | "aguardando"
  | "em_andamento"
  | "aguardando_cliente"
  | "resolvida"
  | "arquivada";

/**
 * Next status when a HUMAN sends an outbound message: claims the conversation
 * as "our turn" regardless of where it was (aguardando, aguardando_cliente or
 * even a resolved one — reopens it). `arquivada` is a deliberate, manual-only
 * axis and is never auto-touched; already `em_andamento` is a no-op.
 */
export function nextStatusOnOutboundHuman(current: string): "em_andamento" | null {
  if (current === "em_andamento" || current === "arquivada") return null;
  return "em_andamento";
}
