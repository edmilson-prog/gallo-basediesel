/**
 * WAHA `message.reaction` event. A reaction attaches to an ALREADY EXISTING
 * message instead of creating a new one, so it never flows through
 * parseWahaMessageEvent — it patches the reacted row.
 *
 * Runtime-agnostic (Web APIs + relative imports only) so the mirror into the
 * Edge Functions tree stays byte-identical.
 */

export interface IWahaReaction {
  /** `provider_message_id` of the message being reacted to. */
  targetProviderMessageId: string;
  /** The emoji, or "" when the reaction was REMOVED. */
  emoji: string;
  /** true when the shop reacted, false when the other party did. */
  fromMe: boolean;
  timestamp: string;
}

/**
 * One reactor's state. Structurally identical to IMessageReaction /
 * IMessageReactions in `@/shared/types` — duplicated on purpose: this module is
 * mirrored into the Edge Functions tree and must not import from `@/`, which
 * would break the runtime-agnostic rule. The two must stay in sync.
 */
export interface IReactionSlot {
  emoji: string;
  at: string;
}
export interface IMessageReactionsState {
  customer?: IReactionSlot;
  seller?: IReactionSlot;
}

/** Field types are what WAHA DOCUMENTS, not what it guarantees — every read
 *  below is narrowed at runtime before use. */
interface IWahaReactionPayload {
  fromMe?: unknown;
  timestamp?: unknown;
  reaction?: { text?: unknown; messageId?: unknown };
}

function tsToIso(value: number | undefined): string {
  return typeof value === "number" && value > 0
    ? new Date(value * 1000).toISOString()
    : new Date().toISOString();
}

/**
 * Throws on an unusable envelope — same contract as parseWahaMessageEvent, so
 * the webhook records it as `outcome: "ignored"` with the reason instead of
 * writing anything.
 */
export function parseWahaReactionEvent(rawPayload: unknown): IWahaReaction {
  const payload = rawPayload as IWahaReactionPayload | null;
  const reaction = payload?.reaction;
  if (!reaction || typeof reaction !== "object") {
    throw new Error("WahaProvider: evento de reaction sem 'reaction' — ignorar");
  }
  // Third-party JSON: narrow with real runtime checks, never a cast. A
  // non-string id would otherwise be used verbatim in the lookup query.
  const targetProviderMessageId = reaction.messageId;
  if (typeof targetProviderMessageId !== "string" || !targetProviderMessageId) {
    throw new Error("WahaProvider: reaction sem 'messageId' alvo — ignorar");
  }
  return {
    targetProviderMessageId,
    // An empty text is meaningful: it means the reaction was taken back. A
    // non-string text is treated the same way — we can't render it.
    emoji: typeof reaction.text === "string" ? reaction.text : "",
    // whatsmeow (WAHA's GOWS engine) has been observed emitting string-typed
    // values where the docs promise a boolean — same precedent as
    // normalizeWahaAdMediaType (parser.ts), which accepts number OR string
    // for the same field family. A plain `=== true` would degrade the string
    // "true" to `false`, which would route the SHOP's own reaction as if the
    // customer sent it — wrong side of applyReaction, and it would wrongly
    // bump the queue.
    fromMe: payload?.fromMe === true || payload?.fromMe === "true",
    timestamp: tsToIso(typeof payload?.timestamp === "number" ? payload.timestamp : undefined),
  };
}

/**
 * Next state of a message's `reactions` column. WhatsApp allows one reaction
 * per person per message, so a new one REPLACES that side's previous entry.
 * Returns null when no side is left, so "no reaction" has a single
 * representation in the column.
 *
 * Pure: `current` is never mutated, and the returned object shares no slot
 * reference with it — the untouched side is deep-copied — so a caller can hold
 * the DB-read `current` for comparison and freely mutate the result.
 */
export function applyReaction(
  current: IMessageReactionsState | null,
  reaction: IWahaReaction,
): IMessageReactionsState | null {
  const otherSide = reaction.fromMe ? "customer" : "seller";
  const side = reaction.fromMe ? "seller" : "customer";
  const next: IMessageReactionsState = {};
  // Carry the untouched side over as a fresh object, never the caller's ref.
  const carried = current?.[otherSide];
  if (carried) next[otherSide] = { ...carried };
  if (reaction.emoji) {
    next[side] = { emoji: reaction.emoji, at: reaction.timestamp };
  }
  return next.customer || next.seller ? next : null;
}
