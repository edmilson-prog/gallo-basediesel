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

  it("rejects an unrecognized generic mimetype with no matching extension", () => {
    expect(
      inferAttachmentKind({ type: "application/octet-stream", name: "arquivo.bin" }),
    ).toBeNull();
  });

  it("rejects when there is neither a usable type nor a recognized extension", () => {
    expect(inferAttachmentKind({ type: "", name: "sem-extensao" })).toBeNull();
  });
});
