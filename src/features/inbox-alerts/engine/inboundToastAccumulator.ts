/** What the toast body renders for one conversation. */
export interface IInboundToastEntry {
  /** Preview of the most recent message. */
  preview: string;
  /** Messages accumulated since this toast was raised (1 = first). */
  count: number;
}

export interface IInboundToastAccumulator {
  /** Record an inbound message and return the state the toast should render. */
  register(conversationId: string, preview: string): IInboundToastEntry;
  /** Current state without mutating — `null` when no toast is live. */
  peek(conversationId: string): IInboundToastEntry | null;
  /** Forget a conversation (toast dismissed, auto-closed, or opened). */
  clear(conversationId: string): void;
  clearAll(): void;
}

/**
 * Per-conversation accumulation for the inbound toast. Pure and timer-free: the
 * host owns the lifecycle and calls `clear` when its toast goes away, which is
 * why a present entry doubles as "this toast is still on screen".
 */
export function createInboundToastAccumulator(): IInboundToastAccumulator {
  const entries = new Map<string, IInboundToastEntry>();

  return {
    register(conversationId, preview) {
      const previous = entries.get(conversationId);
      const next: IInboundToastEntry = {
        preview,
        count: (previous?.count ?? 0) + 1,
      };
      entries.set(conversationId, next);
      return { ...next };
    },
    peek(conversationId) {
      const entry = entries.get(conversationId);
      return entry ? { ...entry } : null;
    },
    clear(conversationId) {
      entries.delete(conversationId);
    },
    clearAll() {
      entries.clear();
    },
  };
}
