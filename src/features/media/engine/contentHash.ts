/**
 * Simulated content hash for dedup (Fase 1). Deterministic, dependency-free
 * FNV-1a over the input string rendered base36 with an `h` prefix so it's
 * visually distinct from real ids. NOT cryptographic — Fase 2 uses the real
 * object digest from Supabase Storage.
 */
export function contentHash(input: string): string {
  let hash = 0x811c9dc5; // FNV offset basis (32-bit)
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // FNV prime 16777619, kept in 32-bit via Math.imul.
    hash = Math.imul(hash, 0x01000193);
  }
  // >>> 0 forces an unsigned 32-bit integer before base36.
  return `h${(hash >>> 0).toString(36)}`;
}

/**
 * Build the canonical dedup key for a media payload. Mirrors what the mock
 * `ensureFromMessage` and the generator both feed into {@link contentHash},
 * so a generated asset and an inbound message resolve to the same hash.
 */
export function mediaHashSeed(parts: {
  messageId?: string;
  mimeType: string;
  sizeBytes: number;
  fileName?: string;
}): string {
  return [parts.messageId ?? "", parts.mimeType, String(parts.sizeBytes), parts.fileName ?? ""].join(
    "|",
  );
}
