/**
 * Classifies a stored media reference (`IMessage.mediaUrl`) so the data layer
 * knows how to turn it into a browser-navigable URL.
 *
 * - `none`     — empty/missing: nothing to play or show (a text message, or
 *                inbound media whose download failed, leaving `media_url` null).
 * - `absolute` — already navigable (http(s)/blob/data): seed/mock assets and
 *                outbound media signed elsewhere. Used verbatim.
 * - `storage`  — a PRIVATE `whatsapp-media` object path written by the webhook
 *                (`conversations/<conv>/<msg>/media.<ext>`). Must be signed
 *                server-side before a browser can fetch it.
 *
 * Pure and transport-agnostic so both the Supabase provider (which signs) and
 * tests can reason about it without a network.
 */
export type MediaRef =
  | { kind: "none" }
  | { kind: "absolute"; url: string }
  | { kind: "storage"; path: string };

const ABSOLUTE_URL_RE = /^(https?:|blob:|data:)/i;

export function classifyMediaRef(ref: string | undefined | null): MediaRef {
  const trimmed = ref?.trim();
  if (!trimmed) return { kind: "none" };
  if (ABSOLUTE_URL_RE.test(trimmed)) return { kind: "absolute", url: trimmed };
  return { kind: "storage", path: trimmed };
}
