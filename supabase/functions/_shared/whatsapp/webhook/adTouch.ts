// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/webhook/adTouch.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

import type { IAdReferral } from "../types.ts";

/** One ad click that turned into a message — what `record_ad_touch` needs. */
export interface IAdTouchInput {
  conversationId: string;
  messageId: string;
  occurredAt: string;
  referral: IAdReferral;
}

/**
 * Decides whether an inbound referral is worth recording as a touch.
 *
 * Without a `sourceId` the creative has no natural key: it cannot be catalogued
 * in `ads` and the touch would be unattributable to any campaign. Those are
 * dropped here instead of reaching the database (PRD-217 RN-01).
 */
export function buildAdTouchInput(args: {
  conversationId: string;
  messageId: string;
  occurredAt: string;
  referral: IAdReferral | undefined;
}): IAdTouchInput | null {
  const { conversationId, messageId, occurredAt, referral } = args;
  if (!referral?.sourceId?.trim()) return null;
  return { conversationId, messageId, occurredAt, referral };
}
