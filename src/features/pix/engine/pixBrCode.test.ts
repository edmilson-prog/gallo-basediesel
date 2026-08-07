import { describe, it, expect } from "vitest";
import { buildPixPayload, crc16Ccitt, toAscii } from "./pixBrCode";

/** Official CRC-16/CCITT-FALSE check vector — external anchor, not PIX-specific. */
const OFFICIAL_VECTOR = "123456789";

/**
 * Real published BR Code example (random UUID key, lowercase GUI), minus its
 * four checksum characters. Its checksum is CITED, not computed by us.
 */
const BACEN_EXAMPLE_BODY =
  "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000" +
  "5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304";

describe("crc16Ccitt", () => {
  it("matches the official CRC-16/CCITT-FALSE check vector", () => {
    expect(crc16Ccitt(OFFICIAL_VECTOR)).toBe("29B1");
  });

  it("matches the checksum published with the real BR Code example", () => {
    expect(crc16Ccitt(BACEN_EXAMPLE_BODY)).toBe("1D3D");
  });

  it("always returns four uppercase hex characters", () => {
    expect(crc16Ccitt("A")).toMatch(/^[0-9A-F]{4}$/);
  });
});

describe("buildPixPayload", () => {
  it("emits the standard's fields in order and appends the matching CRC", () => {
    const result = buildPixPayload({
      keyValue: "12345678901",
      receiverName: "Fulano de Tal",
      receiverCity: "BRASILIA",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Field order: 00, 26, 52, 53, 58, 59, 60, 62, 63. Every TLV length is
    // two digits, zero-padded. This asserts the ASSEMBLY.
    expect(result.value.slice(0, -4)).toBe(
      "00020126330014BR.GOV.BCB.PIX01111234567890152040000" +
        "53039865802BR5913Fulano de Tal6008BRASILIA62070503***6304",
    );
    // The CRC itself is anchored by the two external vectors above; here we
    // only assert the builder appends the checksum of its own body.
    expect(result.value.slice(-4)).toBe(crc16Ccitt(result.value.slice(0, -4)));
  });

  it("carries no transaction amount — the key is static (D-3)", () => {
    const result = buildPixPayload({
      keyValue: "12345678000195",
      receiverName: "GALLO BASE DIESEL",
      receiverCity: "FREDERICO W",
    });
    expect(result.ok).toBe(true);
    // Tag 54 is the transaction amount; a static key must not carry it.
    if (result.ok) expect(result.value).not.toContain("54");
  });

  it("rejects an empty key instead of emitting a half-built payload", () => {
    const result = buildPixPayload({
      keyValue: "",
      receiverName: "GALLO",
      receiverCity: "FREDERICO W",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a receiver name longer than 25 characters", () => {
    const result = buildPixPayload({
      keyValue: "12345678000195",
      receiverName: "A".repeat(26),
      receiverCity: "FREDERICO W",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a city longer than 15 characters", () => {
    const result = buildPixPayload({
      keyValue: "12345678000195",
      receiverName: "GALLO",
      receiverCity: "A".repeat(16),
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-ASCII key instead of emitting a payload the reader would corrupt", () => {
    const result = buildPixPayload({
      keyValue: "joão@empresa.com",
      receiverName: "GALLO BASE DIESEL",
      receiverCity: "FREDERICO W",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("key-not-ascii");
  });
});

describe("toAscii", () => {
  it("strips accents — a non-ASCII byte decodes wrong in the Latin-1 encoder", () => {
    expect(toAscii("Frederico Westphalen", 25)).toBe("Frederico Westphalen");
    expect(toAscii("São João", 25)).toBe("Sao Joao");
    expect(toAscii("Comércio & Peças", 25)).toBe("Comercio & Pecas");
  });

  it("preserves case — the BR Code spec does not require uppercase", () => {
    expect(toAscii("Fulano de Tal", 25)).toBe("Fulano de Tal");
  });

  it("truncates to the given limit", () => {
    expect(toAscii("A".repeat(40), 15)).toHaveLength(15);
  });
});
