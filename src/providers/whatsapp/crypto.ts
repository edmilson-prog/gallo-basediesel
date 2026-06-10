/**
 * HMAC helpers for webhook signature validation (PRD-112 RF-080 / RNF-002,
 * PRD-113 RF-061). Web Crypto only — works in browser, Deno and Node 18+.
 * Runtime-agnostic file: relative imports only, Web APIs only.
 */

const encoder = new TextEncoder();

/** HMAC-SHA256 of `payload` keyed by `secret`, hex-encoded. */
export async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time string comparison — naïve `===` leaks information through
 * timing (PRD-112 RNF-002). Length mismatch returns false immediately, which
 * is safe: length is not secret.
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
