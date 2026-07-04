/**
 * True when an error is a failed dynamic-import (lazy chunk) load — the signature
 * of navigating to a route whose chunk was removed by a newer deploy. Matched by
 * message across browsers; the MIME-type variant is what Chrome throws when the
 * SPA rewrite serves index.html in place of the missing .js.
 */
const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /loading chunk \d+ failed/i,
  /expected a javascript(-or-wasm)? module script/i,
];

export function isChunkLoadError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!message) return false;
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}
