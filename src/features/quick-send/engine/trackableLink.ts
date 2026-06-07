import type { ID } from "@/shared/types";

/**
 * Trackable link helpers (PRD-027 RF-016, D-8). Builds a deterministic
 * `glo.bz/<ref>` short ref from a seed (simulated; Fase 2 swaps in a real
 * short-link service) and a well-formed UTM record. Also exports the `[link]`
 * message marker and the PRODUCER `encodeLinkMarker` consumed by MessageBubble /
 * LinkBubble (CONTRACT §H.1). The DECODER (`decodeLinkMarker`) is owned by
 * `LinkBubble.tsx` (Plan C) and imports `ILinkPayload` from here.
 */

export const TRACKABLE_LINK_MARKER = "[link]";

/**
 * Snapshot serialized into a `[link]<json>` outbound message (CONTRACT §H.1).
 * Single source of truth for both the encoder (here) and the decoder (LinkBubble).
 */
export interface ILinkPayload {
  linkId: ID;
  label: string;
  shortRef: string;
}

/** Deterministic FNV-1a → base36 short ref (mirrors media contentHash). */
export function buildShortRef(seed: string): string {
  let hash = 0x811c9dc5; // FNV offset basis (32-bit)
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime, 32-bit via imul
  }
  return `glo.bz/${(hash >>> 0).toString(36)}`;
}

export function buildUtm(input: {
  source: string;
  medium: string;
  campaign: string;
}): { source: string; medium: string; campaign: string } {
  return {
    source: input.source,
    medium: input.medium,
    campaign: input.campaign,
  };
}

/**
 * Encode a trackable-link snapshot as a `[link]<json>` outbound message marker.
 * Pure producer; the inverse `decodeLinkMarker` lives in `LinkBubble.tsx`
 * (Plan C) and round-trips this output. The IMessage schema does NOT change.
 */
export function encodeLinkMarker(payload: ILinkPayload): string {
  return `${TRACKABLE_LINK_MARKER}${JSON.stringify(payload)}`;
}
