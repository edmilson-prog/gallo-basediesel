import { describe, expect, it } from "vitest";
import { inboundPreview, PREVIEW_FALLBACK } from "./inboundPreview";

describe("inboundPreview", () => {
  it("uses the plain text when present", () => {
    expect(inboundPreview("Bom dia, tem esse filtro?")).toBe("Bom dia, tem esse filtro?");
  });

  it("collapses line breaks into single spaces", () => {
    expect(inboundPreview("Bom dia\n\nPreciso de duas peças")).toBe("Bom dia Preciso de duas peças");
  });

  it("truncates a long text with an ellipsis", () => {
    const long = "a".repeat(200);
    const result = inboundPreview(long);
    expect(result).toHaveLength(91); // 90 chars + ellipsis
    expect(result.endsWith("…")).toBe(true);
  });

  it("does not truncate a text exactly at the limit", () => {
    const exact = "b".repeat(90);
    expect(inboundPreview(exact)).toBe(exact);
  });

  it("labels media that carries no caption", () => {
    expect(inboundPreview("", "image")).toBe("Foto");
    expect(inboundPreview(undefined, "audio")).toBe("Áudio");
    expect(inboundPreview(null, "video")).toBe("Vídeo");
    expect(inboundPreview("", "document")).toBe("Documento");
    expect(inboundPreview("", "sticker")).toBe("Figurinha");
  });

  it("prefers the caption over the media label", () => {
    expect(inboundPreview("Olha a peça quebrada", "image")).toBe("Olha a peça quebrada");
  });

  it("always labels structured content, never its encoded text", () => {
    // `location`/`contact` encode their payload INSIDE `text` (see
    // providers/whatsapp/contentFormat.ts) — showing it raw would leak
    // coordinates / vCard noise into the toast.
    expect(inboundPreview("-27.3586,-53.3958\nRua Ademar", "location")).toBe("Localização");
    expect(inboundPreview("João Silva\n5555999998888", "contact")).toBe("Contato");
  });

  it("falls back when there is neither text nor media", () => {
    expect(inboundPreview("", undefined)).toBe(PREVIEW_FALLBACK);
    expect(inboundPreview("   ", null)).toBe(PREVIEW_FALLBACK);
    expect(inboundPreview(undefined)).toBe(PREVIEW_FALLBACK);
  });
});
