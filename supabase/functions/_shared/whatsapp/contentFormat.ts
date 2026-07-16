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

import { toE164 } from "./phone.ts";

export interface ILocationContent {
  /** Place label, when the sender attached one. */
  name?: string;
  /** Decimal degrees — present only when the share carried coordinates. */
  lat?: number;
  lng?: number;
}

export interface IContactContent {
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
/**
 * Phone-ish: a LEADING `+` is required, then digits possibly broken by
 * separators (≥6 chars). Every phone this module ever receives is already
 * E.164 (`toE164` in Meta/Evolution/Evolution Go parsers) — requiring the `+`
 * disambiguates a single-line contact whose NAME happens to be all-numeric
 * (e.g. an unsaved contact with no resolvable phone) from an actual phone,
 * without needing a wire-format marker.
 */
const PHONE_RE = /^\+\d[\d().\s-]{4,}\d$/;

/**
 * A coordinate as a plain decimal string `COORD_RE` can parse. `String(n)`
 * yields exponential notation for |n| < 1e-6 (e.g. `5e-7`) — coordinates very
 * close to the equator/prime meridian — which the regex would reject, dropping
 * the coords. Expand those to fixed notation; everything else stays exact.
 * Exported so the DISPLAY side (LocationBubble: map href + on-screen text)
 * honors the same no-exponential invariant when it re-stringifies the decoded
 * numbers — otherwise `${lat}` reintroduces `5e-7` at the consumption boundary.
 */
export function coordStr(n: number): string {
  const s = String(n);
  if (!s.includes("e") && !s.includes("E")) return s;
  return n.toFixed(20).replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * Location → canonical text. With coordinates: `"<name>\n<lat>,<lng>"` (the name
 * line is omitted when absent → just the coord line). Without coordinates: the
 * name alone. Coordinates always sit on their OWN last line so a name carrying a
 * comma can never be mistaken for them.
 */
export function encodeLocation(content: ILocationContent): string {
  const name = oneLine(content.name);
  const hasCoords =
    typeof content.lat === "number" &&
    Number.isFinite(content.lat) &&
    typeof content.lng === "number" &&
    Number.isFinite(content.lng);
  const coords = hasCoords ? `${coordStr(content.lat as number)},${coordStr(content.lng as number)}` : "";
  if (name && coords) return `${name}\n${coords}`;
  return coords || name;
}

/** Inverse of {@link encodeLocation}. Always returns a payload (the row is
 *  already known to be a location); `lat`/`lng` are absent when no coord line. */
export function decodeLocation(text: string): ILocationContent {
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
export function encodeContact(content: IContactContent): string {
  const name = oneLine(content.name);
  const phone = oneLine(content.phone);
  if (name && phone) return `${name}\n${phone}`;
  return name || phone;
}

/**
 * Inverse of {@link encodeContact}. {@link encodeContact} always puts the phone
 * on the LAST line, so decode trusts position: the last line is the phone when
 * phone-shaped, and everything before it is the name. This avoids the
 * name/phone swap that a "first phone-shaped line wins" heuristic causes when a
 * contact's display name is itself a number (unsaved contacts). With a single
 * line we fall back to shape: only a `+`-prefixed number is a phone (every real
 * phone is E.164), so an all-numeric NAME with no resolvable phone decodes as
 * a name instead of being mistaken for one.
 */
export function decodeContact(text: string): IContactContent {
  const lines = (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return {};
  if (lines.length === 1) {
    const only = lines[0] as string;
    return PHONE_RE.test(only) ? { phone: only } : { name: only };
  }
  const last = lines[lines.length - 1] as string;
  if (PHONE_RE.test(last)) {
    return { name: lines.slice(0, -1).join(" ") || undefined, phone: last };
  }
  return { name: lines.join(" ") || undefined };
}

/**
 * Best-effort phone extraction from a vCard (whatsmeow / Meta contact shares).
 * Prefers the clean `waid=<digits>` param; falls back to the first `TEL` value.
 * Returns undefined when nothing phone-like is found.
 */
export function phoneFromVCard(vcard: string | undefined | null): string | undefined {
  if (!vcard) return undefined;
  const waid = vcard.match(/waid=(\d{6,})/i);
  if (waid) return toE164(waid[1] as string);
  // `[ \t]` (not `\s`) so the capture can't bleed across the vCard's CRLF lines
  // into a following digit-led line (e.g. a NOTE), which would corrupt the number.
  const tel = vcard.match(/TEL[^:]*:(\+?\d[\d().\t -]{4,}\d)/i);
  // toE164 strips the vCard's separators ("+55 54 9..." → "+5554 9...") so the
  // copied number is clean E.164, matching the waid branch.
  if (tel) return toE164(tel[1] as string);
  return undefined;
}

/**
 * Best-effort display name from a vCard's FN (Formatted Name) line — the
 * only place a bare vCard (WAHA) carries a name; Baileys-shaped engines get
 * it from a separate proto field instead (see encodeBaileysContact).
 */
export function nameFromVCard(vcard: string | undefined | null): string | undefined {
  if (!vcard) return undefined;
  const fn = vcard.match(/^FN:(.+)$/m);
  return fn ? oneLine(fn[1]) || undefined : undefined;
}

/**
 * Baileys-shaped location/contact nodes — the proto fields shared by the
 * Evolution classic and Evolution Go (whatsmeow) parsers. Centralizing the
 * node → canonical-text mapping here keeps the two engines in lockstep.
 */
export interface IBaileysLocationNode {
  degreesLatitude?: number;
  degreesLongitude?: number;
  name?: string;
  /** Street/neighborhood label — often the most specific text the pin carries. */
  address?: string;
}

export interface IBaileysContactNode {
  displayName?: string;
  vcard?: string;
}

/** Baileys location node → canonical location text. `address` is the label
 *  fallback when the share carried no `name` (otherwise it would be dropped). */
export function encodeBaileysLocation(node: IBaileysLocationNode): string {
  return encodeLocation({
    name: node.name || node.address,
    lat: node.degreesLatitude,
    lng: node.degreesLongitude,
  });
}

/** Baileys contact node → canonical contact text (phone from the vCard). */
export function encodeBaileysContact(node: IBaileysContactNode): string {
  return encodeContact({ name: node.displayName, phone: phoneFromVCard(node.vcard) });
}
