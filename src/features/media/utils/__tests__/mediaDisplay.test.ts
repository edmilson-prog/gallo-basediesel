import { describe, expect, it } from "vitest";
import type { IMediaAsset } from "@/shared/types";
import { countByKind, formatBytes, mediaCounterLabel, mediaKindIcon } from "../mediaDisplay";

function asset(kind: IMediaAsset["kind"]): IMediaAsset {
  return {
    id: `m-${kind}-${Math.random()}`,
    storeId: "00000000-0000-0000-0000-000000000001",
    kind,
    mimeType: "x",
    sizeBytes: 1,
    authorType: "customer",
    direction: "in",
    createdAt: "2026-06-01T00:00:00.000Z",
    storageRef: "ref",
    persisted: true,
    sensitivity: "normal",
  };
}

describe("countByKind", () => {
  it("tallies per kind", () => {
    const set = [asset("image"), asset("image"), asset("document"), asset("audio")];
    expect(countByKind(set)).toEqual({ image: 2, document: 1, audio: 1, video: 0 });
  });
});

describe("mediaCounterLabel", () => {
  it("renders pt-BR counters joined by ·, singular/plural aware, skipping zeros", () => {
    const set = [asset("image"), asset("image"), asset("image"), asset("document"), asset("audio")];
    expect(mediaCounterLabel(set)).toBe("3 imagens · 1 documento · 1 áudio");
  });
  it("renders an empty-state label when there are no assets", () => {
    expect(mediaCounterLabel([])).toBe("Nenhuma mídia");
  });
  it("uses the singular form for a count of 1", () => {
    expect(mediaCounterLabel([asset("image")])).toBe("1 imagem");
  });
});

describe("formatBytes", () => {
  it("formats with pt-BR units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1_572_864)).toBe("1,5 MB");
  });
});

describe("mediaKindIcon", () => {
  it("maps each kind to an mdi icon name", () => {
    expect(mediaKindIcon("image")).toBe("mdi:image-outline");
    expect(mediaKindIcon("audio")).toBe("mdi:music-note-outline");
    expect(mediaKindIcon("document")).toBe("mdi:file-document-outline");
    expect(mediaKindIcon("video")).toBe("mdi:video-outline");
  });
});
