/**
 * Log sanitization helpers (PRD-112 RF-120 / RNF-001).
 *
 * Engines log every outbound call through the injected sink; payloads pass
 * through here first so integration logs never carry tokens or huge bodies.
 * Runtime-agnostic file: relative imports only, Web APIs only.
 */

/** Max serialized payload size kept in a log entry (PRD-112: 10KB). */
export const LOG_PAYLOAD_MAX_CHARS = 10_000;

const SECRET_KEY_PATTERN = /token|secret|apikey|api_key|authorization|password/i;

/**
 * Returns a log-safe copy of `value`: keys that look like secrets are
 * redacted recursively and the result is truncated when serialization
 * exceeds {@link LOG_PAYLOAD_MAX_CHARS}.
 */
export function sanitizeForLog(value: unknown): unknown {
  const redacted = redact(value);
  try {
    const serialized = JSON.stringify(redacted);
    if (serialized !== undefined && serialized.length > LOG_PAYLOAD_MAX_CHARS) {
      return { truncated: true, preview: serialized.slice(0, LOG_PAYLOAD_MAX_CHARS) };
    }
  } catch {
    return { unserializable: true };
  }
  return redacted;
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY_PATTERN.test(key) ? "[redacted]" : redact(entry);
    }
    return out;
  }
  return value;
}
