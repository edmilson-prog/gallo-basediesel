import { describe, expect, it } from "vitest";
import {
  buildShortRef,
  buildUtm,
  encodeLinkMarker,
  TRACKABLE_LINK_MARKER,
  type ILinkPayload,
} from "./trackableLink";

describe("buildShortRef", () => {
  it("is deterministic for the same seed", () => {
    expect(buildShortRef("asset-001")).toBe(buildShortRef("asset-001"));
  });
  it("differs for different seeds", () => {
    expect(buildShortRef("asset-001")).not.toBe(buildShortRef("asset-002"));
  });
  it("produces a glo.bz short ref shape", () => {
    expect(buildShortRef("asset-001")).toMatch(/^glo\.bz\/[a-z0-9]+$/);
  });
});

describe("buildUtm", () => {
  it("returns a well-formed utm record", () => {
    const utm = buildUtm({ source: "whatsapp", medium: "chat", campaign: "catalogo" });
    expect(utm).toEqual({ source: "whatsapp", medium: "chat", campaign: "catalogo" });
  });
});

describe("TRACKABLE_LINK_MARKER", () => {
  it("is the [link] prefix", () => {
    expect(TRACKABLE_LINK_MARKER).toBe("[link]");
  });
});

describe("encodeLinkMarker", () => {
  const payload: ILinkPayload = {
    linkId: "tl-001",
    label: "Catálogo Freios Volvo",
    shortRef: "glo.bz/a1b2c3",
  };

  it("prefixes the encoded payload with the [link] marker", () => {
    expect(encodeLinkMarker(payload)).toMatch(/^\[link\]\{/);
  });

  it("serializes exactly linkId/label/shortRef as JSON", () => {
    expect(encodeLinkMarker(payload)).toBe(
      `[link]${JSON.stringify({ linkId: "tl-001", label: "Catálogo Freios Volvo", shortRef: "glo.bz/a1b2c3" })}`,
    );
  });

  it("round-trips with a JSON.parse of the body (decoder counterpart)", () => {
    const encoded = encodeLinkMarker(payload);
    const body = encoded.slice(TRACKABLE_LINK_MARKER.length);
    expect(JSON.parse(body)).toEqual(payload);
  });
});
