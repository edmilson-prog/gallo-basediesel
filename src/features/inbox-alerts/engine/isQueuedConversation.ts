export interface IQueueCheckInput {
  assignedSellerId?: string | null;
  status: string;
  isSdrActive: boolean;
}

/**
 * A conversation is "queued" (waiting for manual distribution) when nobody is
 * assigned, the SDR bot isn't driving it, and its status is still "aguardando".
 * Single source of truth shared by the Inbox "Em fila" badge and the
 * inbox-alerts "cliente novo na fila" beep — they must never drift apart.
 */
export function isQueuedConversation(row: IQueueCheckInput): boolean {
  return !row.assignedSellerId && !row.isSdrActive && row.status === "aguardando";
}
