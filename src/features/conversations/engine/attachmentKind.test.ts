import { describe, expect, it } from "vitest";
import { inferAttachmentKind } from "./attachmentKind";

describe("inferAttachmentKind", () => {
  it.each(["image/png", "image/jpeg", "image/webp", "image/gif"])(
    "infers image for %s",
    (type) => {
      expect(inferAttachmentKind({ type, name: "foto.bin" })).toBe("image");
    },
  );

  it.each(["audio/mpeg", "audio/ogg", "audio/webm", "audio/mp4"])(
    "infers audio for %s",
    (type) => {
      expect(inferAttachmentKind({ type, name: "audio.bin" })).toBe("audio");
    },
  );

  it.each(["video/mp4", "video/3gpp", "video/quicktime", "video/webm"])(
    "infers video for %s",
    (type) => {
      expect(inferAttachmentKind({ type, name: "clipe.bin" })).toBe("video");
    },
  );

  it("infers document for a known document mimetype", () => {
    expect(inferAttachmentKind({ type: "application/pdf", name: "nota.pdf" })).toBe("document");
  });

  it("falls back to extension when type is empty (common on paste)", () => {
    expect(inferAttachmentKind({ type: "", name: "planilha.xlsx" })).toBe("document");
  });

  it("matches extensions case-insensitively", () => {
    expect(inferAttachmentKind({ type: "", name: "RELATORIO.PDF" })).toBe("document");
  });

  it.each([
    ["clipe.mp4", "video"],
    ["FILME.MOV", "video"],
    ["gravacao.3gp", "video"],
    ["foto.jpg", "image"],
    ["captura.PNG", "image"],
    ["musica.mp3", "audio"],
    ["nota.ogg", "audio"],
  ])("falls back to the extension for %s when the browser reports no type", (name, expected) => {
    expect(inferAttachmentKind({ type: "", name })).toBe(expected);
  });

  it("falls back to the extension for a generic octet-stream video", () => {
    // Some drag sources hand over application/octet-stream instead of video/mp4.
    expect(inferAttachmentKind({ type: "application/octet-stream", name: "clipe.mp4" })).toBe(
      "video",
    );
  });

  it("rejects an unrecognized generic mimetype with no matching extension", () => {
    expect(
      inferAttachmentKind({ type: "application/octet-stream", name: "arquivo.bin" }),
    ).toBeNull();
  });

  it("rejects when there is neither a usable type nor a recognized extension", () => {
    expect(inferAttachmentKind({ type: "", name: "sem-extensao" })).toBeNull();
  });
});
