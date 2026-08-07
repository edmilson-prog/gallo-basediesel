//
// Static BR Code (EMV®QRCPS-MPM) builder. Static means: no transaction amount
// (tag 54) — the customer types how much to pay. See the spec, D-3.
//
// Every field is TLV: two-digit id + two-digit length + value. The CRC is the
// last field and its own "6304" header IS part of what gets hashed.

export const RECEIVER_NAME_MAX = 25;
export const RECEIVER_CITY_MAX = 15;

/**
 * Normalizes to unaccented ASCII. This is not cosmetic: `qrcode-generator`
 * encodes with a Latin-1 `stringToBytes`, so a `ç` produces bytes some readers
 * decode wrong — and the BR Code spec requires ASCII anyway.
 *
 * Case is PRESERVED: the spec does not require uppercase and the canonical
 * BACEN example reads "Fulano de Tal".
 */
export function toAscii(value: string, maxLen: number): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .slice(0, maxLen);
}

function tlv(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

/** CRC16/CCITT-FALSE — polynomial 0x1021, initial value 0xFFFF. */
export function crc16Ccitt(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export interface IPixPayloadInput {
  /** Canonical key (see pixKeyFormat). */
  keyValue: string;
  receiverName: string;
  receiverCity: string;
}

export type PixPayloadResult =
  | { ok: true; value: string }
  | { ok: false; reason: "missing-key" | "name-too-long" | "city-too-long" | "missing-receiver" };

/**
 * Builds the full static payload. Returns a discriminated result instead of
 * throwing: the editor calls this on every keystroke and a half-typed key is a
 * normal state, not an exception.
 */
export function buildPixPayload(input: IPixPayloadInput): PixPayloadResult {
  const key = input.keyValue.trim();
  if (!key) return { ok: false, reason: "missing-key" };

  // Validate BEFORE truncating, so an over-long name is an error the editor can
  // report — silently cutting the receiver name is how money reaches a payload
  // that looks valid and fails only inside the bank app.
  const rawName = input.receiverName.trim();
  const rawCity = input.receiverCity.trim();
  if (!rawName || !rawCity) return { ok: false, reason: "missing-receiver" };
  if (toAscii(rawName, RECEIVER_NAME_MAX + 1).length > RECEIVER_NAME_MAX) {
    return { ok: false, reason: "name-too-long" };
  }
  if (toAscii(rawCity, RECEIVER_CITY_MAX + 1).length > RECEIVER_CITY_MAX) {
    return { ok: false, reason: "city-too-long" };
  }

  const merchantAccount = tlv("00", "BR.GOV.BCB.PIX") + tlv("01", key);

  const body =
    tlv("00", "01") +
    tlv("26", merchantAccount) +
    tlv("52", "0000") +
    tlv("53", "986") +
    tlv("58", "BR") +
    tlv("59", toAscii(rawName, RECEIVER_NAME_MAX)) +
    tlv("60", toAscii(rawCity, RECEIVER_CITY_MAX)) +
    tlv("62", tlv("05", "***"));

  const withCrcHeader = `${body}6304`;
  return { ok: true, value: `${withCrcHeader}${crc16Ccitt(withCrcHeader)}` };
}
