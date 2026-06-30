import { describe, it, expect } from "vitest";
import {
  decodeContact,
  decodeLocation,
  encodeBaileysContact,
  encodeBaileysLocation,
  encodeContact,
  encodeLocation,
  phoneFromVCard,
} from "./contentFormat";

/**
 * Pins the canonical `text` shape for location/contact rows. The webhook parsers
 * ENCODE and the conversation bubbles DECODE through THIS module, so these
 * literals are the contract that keeps the two ends from drifting — change the
 * format and both an encode and a decode assertion break here.
 */

describe("location encode/decode", () => {
  it("round-trips name + coordinates with the coord line last", () => {
    const text = encodeLocation({ name: "São Paulo", lat: -23.55, lng: -46.63 });
    expect(text).toBe("São Paulo\n-23.55,-46.63");
    expect(decodeLocation(text)).toEqual({ name: "São Paulo", lat: -23.55, lng: -46.63 });
  });

  it("encodes coordinates alone when there is no place name", () => {
    const text = encodeLocation({ lat: -23.55, lng: -46.63 });
    expect(text).toBe("-23.55,-46.63");
    expect(decodeLocation(text)).toEqual({ lat: -23.55, lng: -46.63 });
  });

  it("keeps the name when coordinates are missing (no map link possible)", () => {
    const text = encodeLocation({ name: "Loja Centro" });
    expect(text).toBe("Loja Centro");
    expect(decodeLocation(text)).toEqual({ name: "Loja Centro" });
  });

  it("does not mistake a comma in the name for coordinates", () => {
    const text = encodeLocation({ name: "Av. Brasil, 100", lat: -29.35, lng: -53.39 });
    expect(decodeLocation(text)).toEqual({ name: "Av. Brasil, 100", lat: -29.35, lng: -53.39 });
  });

  it("encodes near-zero coordinates without exponential notation (still parseable)", () => {
    const text = encodeLocation({ lat: 0.0000005, lng: -0.0000007 });
    // String(5e-7) === "5e-7" — COORD_RE would reject it and drop the coords.
    expect(text).not.toMatch(/e/i);
    expect(decodeLocation(text)).toEqual({ lat: 0.0000005, lng: -0.0000007 });
  });
});

describe("contact encode/decode", () => {
  it("round-trips name + phone with the phone on its own line", () => {
    const text = encodeContact({ name: "João Silva", phone: "+5554999990000" });
    expect(text).toBe("João Silva\n+5554999990000");
    expect(decodeContact(text)).toEqual({ name: "João Silva", phone: "+5554999990000" });
  });

  it("keeps just the name when no phone is available", () => {
    const text = encodeContact({ name: "Maria" });
    expect(text).toBe("Maria");
    expect(decodeContact(text)).toEqual({ name: "Maria" });
  });

  it("treats a phone-only payload as a phone, not a name", () => {
    expect(decodeContact("+5554999990000")).toEqual({ phone: "+5554999990000" });
  });

  it("does not swap name and phone when the display name is itself a number", () => {
    // Unsaved contact: WhatsApp uses the raw number as the display name. A
    // "first phone-shaped line wins" decode would pick the NAME line as phone.
    const text = encodeContact({ name: "5554999990000", phone: "+5554988887777" });
    expect(text).toBe("5554999990000\n+5554988887777");
    expect(decodeContact(text)).toEqual({ name: "5554999990000", phone: "+5554988887777" });
  });
});

describe("phoneFromVCard", () => {
  it("prefers the waid parameter as clean digits", () => {
    const vcard =
      "BEGIN:VCARD\nVERSION:3.0\nFN:João\nTEL;type=CELL;waid=5554999990000:+55 54 99999-0000\nEND:VCARD";
    expect(phoneFromVCard(vcard)).toBe("+5554999990000");
  });

  it("falls back to the TEL value when there is no waid, normalized to clean E.164", () => {
    const vcard = "BEGIN:VCARD\nVERSION:3.0\nFN:Maria\nTEL:+55 54 98888-1111\nEND:VCARD";
    expect(phoneFromVCard(vcard)).toBe("+5554988881111");
  });

  it("returns undefined when nothing phone-like is present", () => {
    expect(phoneFromVCard("BEGIN:VCARD\nFN:Sem telefone\nEND:VCARD")).toBeUndefined();
    expect(phoneFromVCard(undefined)).toBeUndefined();
  });

  it("does not let the TEL capture bleed across lines into a following digit-led line", () => {
    // No waid → TEL fallback. The next line starts with a digit; the capture
    // must stop at the newline, not absorb "0NOTE...".
    const vcard = "BEGIN:VCARD\nTEL:+5554 98888-1111\n0NOTE:algo\nEND:VCARD";
    expect(phoneFromVCard(vcard)).toBe("+5554988881111");
  });
});

describe("Baileys structured encoders (shared by Evolution classic & Go)", () => {
  it("encodes a location node, preferring name over address", () => {
    expect(
      encodeBaileysLocation({ name: "Pátio", address: "Av. Brasil, 1000", degreesLatitude: -27.39, degreesLongitude: -53.4 }),
    ).toBe("Pátio\n-27.39,-53.4");
  });

  it("falls back to address as the label when the pin carried no name", () => {
    expect(
      encodeBaileysLocation({ address: "Av. Brasil, 1000 - Centro", degreesLatitude: -27.39, degreesLongitude: -53.4 }),
    ).toBe("Av. Brasil, 1000 - Centro\n-27.39,-53.4");
  });

  it("encodes a contact node, taking the phone from the vCard", () => {
    expect(
      encodeBaileysContact({ displayName: "Zé", vcard: "BEGIN:VCARD\nTEL;waid=5554999990000:x\nEND:VCARD" }),
    ).toBe("Zé\n+5554999990000");
  });
});
