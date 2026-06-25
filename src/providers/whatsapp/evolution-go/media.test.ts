import { describe, expect, it } from "vitest";
import { encodeGoMediaRef, decodeGoMediaRef } from "./media";

describe("go media ref", () => {
  it("round-trips a media ref through encode/decode", () => {
    const ref = { url: "https://m/x.enc", directPath: "/v/t", mediaKey: "AAAA", mimetype: "image/jpeg", fileLength: 123 };
    expect(decodeGoMediaRef(encodeGoMediaRef(ref))).toEqual(ref);
  });

  it("decode throws VALIDATION_ERROR on non-JSON", () => {
    expect(() => decodeGoMediaRef("not-json")).toThrowError(/mídia/i);
  });
});
