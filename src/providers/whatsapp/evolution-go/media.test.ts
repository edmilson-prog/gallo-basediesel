import { describe, expect, it } from "vitest";
import { decodeGoMediaPayload, decodeGoMediaRef, encodeGoMediaRef } from "./media";

describe("go media ref", () => {
  it("round-trips a media message node through encode/decode", () => {
    const message = {
      imageMessage: {
        url: "https://m/x.enc",
        directPath: "/v/t",
        mediaKey: "AAAA",
        mimetype: "image/jpeg",
        fileLength: 123,
      },
    };
    expect(decodeGoMediaRef(encodeGoMediaRef(message))).toEqual(message);
  });

  it("decode throws VALIDATION_ERROR on non-JSON", () => {
    expect(() => decodeGoMediaRef("not-json")).toThrowError(/mídia/i);
  });
});

describe("decodeGoMediaPayload", () => {
  it("parses a Data URL into bytes + mime", () => {
    const payload = decodeGoMediaPayload(`data:image/jpeg;base64,${btoa("abc")}`);
    expect(payload.mimeType).toBe("image/jpeg");
    expect(new TextDecoder().decode(payload.bytes)).toBe("abc");
  });

  it("falls back to bare base64 when there is no data: prefix", () => {
    const payload = decodeGoMediaPayload(btoa("hello"));
    expect(payload.mimeType).toBe("application/octet-stream");
    expect(new TextDecoder().decode(payload.bytes)).toBe("hello");
  });

  it("defaults the mime when the Data URL has an empty type", () => {
    const payload = decodeGoMediaPayload(`data:;base64,${btoa("x")}`);
    expect(payload.mimeType).toBe("application/octet-stream");
  });

  it("throws on malformed base64", () => {
    expect(() => decodeGoMediaPayload("data:image/png;base64,!!!not-base64!!!")).toThrow();
  });
});
