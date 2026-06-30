// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/contentFormat.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/**
 * Canonical `text` encoding for structured WhatsApp content (location / contact)
 * — payloads that carry no binary media but still must round-trip through the
 * single `messages.text` column.
 *
 * The discriminator lives in `messages.media_type` ("location" | "contact");
 * THIS module owns the readable, deterministic shape of `text` for those rows.
 * It is the SINGLE source of truth for the format: the webhook parsers ENCODE
 * (server-side, mirrored into `_shared` — see scripts/sync-whatsapp-shared.ts),
 * the conversation bubbles DECODE (frontend, importing this same module) — so
 * the two ends can never drift.
 *
 * Runtime-agnostic (Web APIs + relative imports only) so the mirror into the
 * Edge Functions tree stays byte-identical.
 */

export interface LocationContent {
  /** Place label, when the sender attached one. */
  name?: string;
  /** Decimal degrees — present only when the share carried coordinates. */
  lat?: number;
  lng?: number;
}

export interface ContactContent {
  name?: string;
  /** First usable phone number, when resolvable (vCard TEL / Meta phones[]). */
  phone?: string;
}

/** Collapse internal whitespace/newlines so a field stays on a single line. */
function oneLine(value: string | undefined | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/** A line that is exactly `lat,lng` in decimal degrees. */
const COORD_RE = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;
/** Phone-ish: optional `+`, then digits possibly broken by separators (≥6 chars). */
const PHONE_RE = /^\+?\d[\d().\s-]{4,}\d$/;

/**
 * Location → canonical text. With coordinates: `"<name>\n<lat>,<lng>"` (the name
 * line is omitted when absent → just the coord line). Without coordinates: the
 * name alone. Coordinates always sit on their OWN last line so a name carrying a
 * comma can never be mistaken for them.
 */
export function encodeLocation(content: LocationContent): string {
  const name = oneLine(content.name);
  const hasCoords =
    typeof content.lat === "number" &&
    Number.isFinite(content.lat) &&
    typeof content.lng === "number" &&
    Number.isFinite(content.lng);
  const coords = hasCoords ? `${content.lat},${content.lng}` : "";
  if (name && coords) return `${name}\n${coords}`;
  return coords || name;
}

/** Inverse of {@link encodeLocation}. Always returns a payload (the row is
 *  already known to be a location); `lat`/`lng` are absent when no coord line. */
export function decodeLocation(text: string): LocationContent {
  const lines = (text ?? "").split("\n");
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const match = lines[i]?.match(COORD_RE);
    if (match) {
      const name = lines.filter((_, idx) => idx !== i).join(" ").trim();
      return { name: name || undefined, lat: Number(match[1]), lng: Number(match[2]) };
    }
  }
  const name = oneLine(text);
  return { name: name || undefined };
}

/**
 * Contact → canonical text: `"<name>\n<phone>"` (either part omitted when
 * absent). The phone, when present, is always its own line.
 */
export function encodeContact(content: ContactContent): string {
  const name = oneLine(content.name);
  const phone = oneLine(content.phone);
  if (name && phone) return `${name}\n${phone}`;
  return name || phone;
}

/** Inverse of {@link encodeContact}. The first phone-shaped line is the phone;
 *  every other line joins into the name. */
export function decodeContact(text: string): ContactContent {
  const lines = (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  let phone: string | undefined;
  const names: string[] = [];
  for (const line of lines) {
    if (!phone && PHONE_RE.test(line)) phone = line;
    else names.push(line);
  }
  return { name: names.join(" ") || undefined, phone };
}

/**
 * Best-effort phone extraction from a vCard (whatsmeow / Meta contact shares).
 * Prefers the clean `waid=<digits>` param; falls back to the first `TEL` value.
 * Returns undefined when nothing phone-like is found.
 */
export function phoneFromVCard(vcard: string | undefined | null): string | undefined {
  if (!vcard) return undefined;
  const waid = vcard.match(/waid=(\d{6,})/i);
  if (waid) return `+${waid[1]}`;
  const tel = vcard.match(/TEL[^:]*:(\+?\d[\d().\s-]{4,}\d)/i);
  if (tel) return oneLine(tel[1]);
  return undefined;
}
