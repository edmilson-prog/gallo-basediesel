import { describe, expect, it } from "vitest";
import { resolveAssetSendSource } from "./assetSendSource";

describe("resolveAssetSendSource", () => {
  it("prefers the Vault media asset when the item points at one", () => {
    expect(
      resolveAssetSendSource({ mediaAssetId: "asset-1", url: "https://gallo.com/x.pdf" }),
    ).toEqual({ type: "media-asset", mediaAssetId: "asset-1" });
  });

  it("falls back to a direct URL when there is no media asset", () => {
    expect(resolveAssetSendSource({ url: "https://gallo.com/catalogo.pdf" })).toEqual({
      type: "url",
      url: "https://gallo.com/catalogo.pdf",
    });
  });

  it("flags items with neither source as unavailable (seeded ref-only items)", () => {
    expect(resolveAssetSendSource({})).toEqual({ type: "unavailable" });
  });

  it("treats empty strings as missing sources", () => {
    expect(resolveAssetSendSource({ mediaAssetId: "", url: "" })).toEqual({
      type: "unavailable",
    });
  });
});
