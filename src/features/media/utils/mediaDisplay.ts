import type { IMediaAsset } from "@/shared/types";

export type MediaKind = IMediaAsset["kind"];

/** Tally of asset counts per kind (always all four keys present). */
export interface IKindCounts {
  image: number;
  audio: number;
  document: number;
  video: number;
}

export function countByKind(assets: IMediaAsset[]): IKindCounts {
  const counts: IKindCounts = { image: 0, audio: 0, document: 0, video: 0 };
  for (const a of assets) counts[a.kind] += 1;
  return counts;
}

/** pt-BR singular/plural noun per kind. */
const KIND_NOUNS: Record<MediaKind, [singular: string, plural: string]> = {
  image: ["imagem", "imagens"],
  audio: ["áudio", "áudios"],
  document: ["documento", "documentos"],
  video: ["vídeo", "vídeos"],
};

/** Display order of the counter segments. */
const KIND_ORDER: MediaKind[] = ["image", "document", "audio", "video"];

/**
 * "3 imagens · 1 documento · 1 áudio" — singular/plural aware, skipping zero
 * counts. Empty set ⇒ "Nenhuma mídia". (aria-live consumer in the gallery.)
 */
export function mediaCounterLabel(assets: IMediaAsset[]): string {
  if (assets.length === 0) return "Nenhuma mídia";
  const counts = countByKind(assets);
  const parts: string[] = [];
  for (const kind of KIND_ORDER) {
    const n = counts[kind];
    if (n === 0) continue;
    const [singular, plural] = KIND_NOUNS[kind];
    parts.push(`${n} ${n === 1 ? singular : plural}`);
  }
  return parts.join(" · ");
}

/** mdi icon name per kind (consumed by Icon.tsx — Iconify). */
export function mediaKindIcon(kind: MediaKind): string {
  switch (kind) {
    case "image":
      return "mdi:image-outline";
    case "audio":
      return "mdi:music-note-outline";
    case "document":
      return "mdi:file-document-outline";
    case "video":
      return "mdi:video-outline";
  }
}

const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** Human file size with pt-BR decimal comma (e.g. "1,5 MB"). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(".", ",");
  return `${text} ${UNITS[unit]}`;
}
