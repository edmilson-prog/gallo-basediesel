import { describe, it, expect } from "vitest";
import { buildDownloadHref, sanitizeFileBase, downloadFileName } from "./mediaDownload";

describe("buildDownloadHref", () => {
  it("appends the download param while preserving the existing token query", () => {
    const signed =
      "https://x.supabase.co/storage/v1/object/sign/whatsapp-media/a/b.jpg?token=abc";
    const out = buildDownloadHref(signed, "foto.jpg");
    const u = new URL(out);
    expect(u.searchParams.get("token")).toBe("abc");
    expect(u.searchParams.get("download")).toBe("foto.jpg");
  });

  it("is idempotent on the download param", () => {
    const once = buildDownloadHref("https://x.co/a?token=t", "f.pdf");
    const twice = buildDownloadHref(once, "f.pdf");
    expect(twice).toBe(once);
  });

  it("returns non-URL input unchanged", () => {
    expect(buildDownloadHref("not a url", "f.pdf")).toBe("not a url");
  });
});

describe("sanitizeFileBase", () => {
  it("strips path separators and unsafe characters", () => {
    expect(sanitizeFileBase("a/b\\c:*?<>|.txt")).toBe("abc.txt");
  });
  it("collapses whitespace into single dashes", () => {
    expect(sanitizeFileBase("  nota   fiscal  ")).toBe("nota-fiscal");
  });
  it("falls back to 'midia' when empty after cleaning", () => {
    expect(sanitizeFileBase("///")).toBe("midia");
  });
  it("caps the length at 60 characters", () => {
    expect(sanitizeFileBase("a".repeat(100)).length).toBe(60);
  });
});

describe("downloadFileName", () => {
  it("keeps a real document name and its extension", () => {
    expect(
      downloadFileName({ mediaType: "document", id: "m1", existingName: "Nota Fiscal.pdf" }),
    ).toBe("Nota-Fiscal.pdf");
  });
  it("synthesizes an image name from the id suffix when there is no caption", () => {
    expect(downloadFileName({ mediaType: "image", id: "msg-ABC123" })).toBe("image-ABC123.jpg");
  });
  it("uses the caption as the base when present", () => {
    expect(downloadFileName({ mediaType: "image", id: "m1", caption: "comprovante pix" })).toBe(
      "comprovante-pix.jpg",
    );
  });
  it("maps audio to .ogg and video to .mp4", () => {
    expect(downloadFileName({ mediaType: "audio", id: "aaaaaa" })).toBe("audio-aaaaaa.ogg");
    expect(downloadFileName({ mediaType: "video", id: "bbbbbb" })).toBe("video-bbbbbb.mp4");
  });
  it("defaults a document with no name to .pdf", () => {
    expect(downloadFileName({ mediaType: "document", id: "cccccc" })).toBe("documento-cccccc.pdf");
  });
});
