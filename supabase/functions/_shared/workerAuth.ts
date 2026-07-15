/**
 * Constant-time comparison for shared-secret worker auth (SDR_WORKER_SECRET,
 * SCHEDULED_WORKER_SECRET). Same discipline as the HMAC compares elsewhere in
 * the WhatsApp adapters — avoids leaking timing information about how many
 * leading characters matched.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length === 0 || b.length === 0) return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** `expected` is `undefined` when the secret hasn't been provisioned yet — always denies. */
export function verifyWorkerSecret(provided: string, expected: string | undefined): boolean {
  if (!expected) return false;
  return safeEqual(provided, expected);
}
