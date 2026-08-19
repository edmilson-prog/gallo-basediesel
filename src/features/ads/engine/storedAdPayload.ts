import type { IAdReferral } from "@/providers/whatsapp/types";
import { extractWahaAdReferral, type IWahaMessagePayload } from "@/providers/whatsapp/waha/parser";

/**
 * Turns an `externalAdReply` node read back out of `webhook_deliveries` into
 * the domain referral, using the SAME mapping the live webhook uses.
 *
 * Why it wraps instead of mapping the fields itself: `extractWahaAdReferral`
 * owns the field renames (`sourceID` → `sourceId`, `title` → `headline`, …) and
 * the `mediaType` normalization (`1`/`"IMAGE"` → image, `2`/`"VIDEO"` → video).
 * Re-implementing that here would let the backfill drift away from live capture
 * the first time either side changes — and the two must agree, because they
 * write into the same table. Editing the parser to export a smaller helper was
 * the alternative and was rejected: the parser is mirrored into the WAHA Edge
 * Function, so touching it would put a redeploy of the function that carries
 * all ad traffic on the table for a purely cosmetic refactor.
 *
 * Only the `extendedTextMessage` branch is built here: the wrapper exists to
 * reach the mapping, and the three real branches all converge on it.
 *
 * Returns undefined for anything unusable — including a node with no usable
 * `sourceID` (missing, empty, or not a string — the jsonb column stored in
 * `webhook_deliveries` guarantees none of that), since without a string key
 * the node could never be catalogued in `ads` (PRD-217 RN-01).
 */
export function adReferralFromStoredNode(node: unknown): IAdReferral | undefined {
  if (typeof node !== "object" || node === null) return undefined;

  const payload = {
    _data: { Message: { extendedTextMessage: { contextInfo: { externalAdReply: node } } } },
  } as unknown as IWahaMessagePayload;

  const referral = extractWahaAdReferral(payload);
  if (typeof referral?.sourceId !== "string" || referral.sourceId.trim() === "") return undefined;
  return referral;
}
