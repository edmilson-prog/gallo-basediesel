/**
 * Meta webhook HMAC validation (PRD-112 RF-080 / RNF-002).
 *
 * Meta signs the RAW request body with HMAC-SHA256 keyed by the App Secret
 * and sends it in `X-Hub-Signature-256` as `sha256=<hex>`. Comparison must be
 * constant-time. Never throws — malformed input returns false.
 */

import { hmacSha256Hex, timingSafeEqualStrings } from "../crypto";

const SIGNATURE_PREFIX = "sha256=";

export async function verifyMetaWebhookSignature(
  rawBody: string,
  signature: string,
  appSecret: string,
): Promise<boolean> {
  if (!signature?.startsWith(SIGNATURE_PREFIX) || appSecret.length === 0) {
    return false;
  }
  try {
    const expected = SIGNATURE_PREFIX + (await hmacSha256Hex(appSecret, rawBody));
    return timingSafeEqualStrings(signature, expected);
  } catch {
    return false;
  }
}
