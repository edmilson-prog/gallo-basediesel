/**
 * WAHA webhook HMAC-SHA512 (header `X-Webhook-Hmac`, algorithm advertised via
 * `X-Webhook-Hmac-Algorithm: sha512`). Web Crypto only — runs identically in
 * the browser test runner and in Deno Edge Functions.
 */

import { timingSafeEqualStrings } from "../crypto";

export async function computeWahaHmac(rawBody: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Never throws — an unverifiable header (missing/malformed) resolves to false. */
export async function verifyWahaHmac(
  rawBody: string,
  secret: string,
  headerValue: string | null,
): Promise<boolean> {
  if (!headerValue) return false;
  try {
    const expected = await computeWahaHmac(rawBody, secret);
    return timingSafeEqualStrings(expected, headerValue);
  } catch {
    return false;
  }
}
