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

/** Storage bucket holding conversation media bytes (PRD-106). */
export const MEDIA_BUCKET = "whatsapp-media";

/**
 * If a stored media ref is itself a signed/public URL of OUR `whatsapp-media`
 * bucket, pull the object path back out so it can be re-signed fresh on display.
 * Returns null for any other URL (external seed/mock assets), used verbatim.
 */
export function whatsappMediaObjectPath(rawUrl: string): string | null {
  try {
    const { pathname } = new URL(rawUrl);
    const marker = "/storage/v1/object/";
    const at = pathname.indexOf(marker);
    if (at === -1) return null;
    const [, bucket, ...rest] = pathname.slice(at + marker.length).split("/");
    if (bucket !== MEDIA_BUCKET || rest.length === 0) return null;
    const objectPath = rest.join("/");
    return objectPath ? decodeURIComponent(objectPath) : null;
  } catch {
    return null;
  }
}

export interface MediaRefPlan {
  /** Refs whose bytes live in our private bucket — sign these in one batch. */
  toSign: { ref: string; objectPath: string }[];
  /** External absolute refs (seed/mock) — usable verbatim. */
  passthrough: { ref: string; url: string }[];
  /** Empty/missing refs — resolve to null (unavailable). */
  unavailable: string[];
}

/**
 * Classify a list of media refs into a signing plan. Dedups by ref. Mirrors the
 * per-ref logic of the Supabase `resolveMediaUrl` so a whole conversation's
 * media can be resolved in one round-trip.
 */
export function partitionMediaRefs(refs: string[]): MediaRefPlan {
  const plan: MediaRefPlan = { toSign: [], passthrough: [], unavailable: [] };
  const seen = new Set<string>();
  for (const ref of refs) {
    if (ref == null || seen.has(ref)) continue;
    seen.add(ref);
    const classified = classifyMediaRef(ref);
    if (classified.kind === "none") {
      plan.unavailable.push(ref);
      continue;
    }
    const objectPath =
      classified.kind === "storage" ? classified.path : whatsappMediaObjectPath(classified.url);
    if (objectPath) {
      plan.toSign.push({ ref, objectPath });
    } else {
      // external absolute — verbatim
      plan.passthrough.push({ ref, url: (classified as { url: string }).url });
    }
  }
  return plan;
}
