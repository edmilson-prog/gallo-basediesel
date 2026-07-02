import type { ID, ISO8601, IMessage, MessageAuthorType, MessageDirection } from "@/shared/types";

/** The 4 visual kinds the conversation media panel renders (sticker -> image). */
export type ConversationMediaKind = "image" | "audio" | "video" | "document";

/** A single playable/viewable media item derived from a conversation message. */
export interface IConversationMediaItem {
  /** Source message id. */
  id: ID;
  conversationId: ID;
  kind: ConversationMediaKind;
  /** Storage path or absolute URL — resolved to a signed URL for display. */
  mediaUrl: string;
  /** Message text used as caption, when present. */
  caption?: string;
  /** Original filename (documents) — preferred over deriving from mediaUrl. */
  fileName?: string;
  authorType: MessageAuthorType;
  direction: MessageDirection;
  sentAt: ISO8601;
}

/** Author filter — collapses authorType into the two sides shown in the panel. */
export type MediaAuthorFilter = "all" | "in" | "out";
/** Time-window filter, mirroring the Vault gallery presets. */
export type MediaPeriodFilter = "all" | "7d" | "30d" | "90d";

export interface IConversationMediaFilters {
  kind: "all" | ConversationMediaKind;
  author: MediaAuthorFilter;
  period: MediaPeriodFilter;
}

export const DEFAULT_MEDIA_FILTERS: IConversationMediaFilters = {
  kind: "all",
  author: "all",
  period: "all",
};

/**
 * Map a message to a media item, or null when it carries no displayable media.
 * Only messages with a `mediaType` AND a `mediaUrl` qualify — inbound media
 * whose download failed has a null url and is excluded (the panel shows only
 * media with bytes available, per the product decision).
 */
export function messageToMediaItem(message: IMessage): IConversationMediaItem | null {
  if (!message.mediaType || !message.mediaUrl) return null;
  // Inferred as the full MessageMediaType union (incl. location/contact); the
  // guard below narrows it back to ConversationMediaKind (it rejects nothing at
  // runtime — structured shares have no mediaUrl and already returned above).
  const kind = message.mediaType === "sticker" ? "image" : message.mediaType;
  if (kind !== "image" && kind !== "audio" && kind !== "video" && kind !== "document") {
    return null;
  }
  return {
    id: message.id,
    conversationId: message.conversationId,
    kind,
    mediaUrl: message.mediaUrl,
    caption: message.text ? message.text : undefined,
    fileName: message.mediaFilename,
    authorType: message.authorType,
    direction: message.direction,
    sentAt: message.sentAt,
  };
}

/** Number of days a period preset spans, or null for "all". */
export function periodDays(period: MediaPeriodFilter): number | null {
  switch (period) {
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "90d":
      return 90;
    default:
      return null;
  }
}

/**
 * Apply the panel filters. `nowMs` is injected (not read from the clock) so the
 * period window is deterministic and unit-testable.
 */
export function filterMediaItems(
  items: IConversationMediaItem[],
  filters: IConversationMediaFilters,
  nowMs: number,
): IConversationMediaItem[] {
  const days = periodDays(filters.period);
  const cutoff = days === null ? null : nowMs - days * 86_400_000;
  return items.filter((item) => {
    if (filters.kind !== "all" && item.kind !== filters.kind) return false;
    if (filters.author !== "all" && item.direction !== filters.author) return false;
    if (cutoff !== null && new Date(item.sentAt).getTime() < cutoff) return false;
    return true;
  });
}

/** Count items per kind (for the filter chips), regardless of active filters. */
export function countByKind(
  items: IConversationMediaItem[],
): Record<ConversationMediaKind, number> {
  const counts: Record<ConversationMediaKind, number> = {
    image: 0,
    audio: 0,
    video: 0,
    document: 0,
  };
  for (const item of items) counts[item.kind] += 1;
  return counts;
}

/** User-facing pt-BR label for a media kind (singular). */
export const MEDIA_KIND_LABEL: Record<ConversationMediaKind, string> = {
  image: "Imagem",
  audio: "Áudio",
  video: "Vídeo",
  document: "Documento",
};

/** A typed section of the "por tipo" view, mirroring the Vault grouping. */
export type ConversationMediaGroupKey = "imagesVideos" | "documents" | "audios";

export interface IConversationMediaGroup {
  key: ConversationMediaGroupKey;
  label: string;
  items: IConversationMediaItem[];
}

/** pt-BR section headers for the grouped ("por tipo") layout. */
export const MEDIA_GROUP_LABEL: Record<ConversationMediaGroupKey, string> = {
  imagesVideos: "Imagens e vídeos",
  documents: "Documentos",
  audios: "Áudios",
};

/**
 * Group items into the three Vault-style buckets (images+videos, documents,
 * audios), preserving the input order within each bucket and dropping empty
 * buckets so the panel never renders an empty section.
 */
export function groupMediaByType(items: IConversationMediaItem[]): IConversationMediaGroup[] {
  const buckets: Record<ConversationMediaGroupKey, IConversationMediaItem[]> = {
    imagesVideos: [],
    documents: [],
    audios: [],
  };
  for (const item of items) {
    if (item.kind === "image" || item.kind === "video") buckets.imagesVideos.push(item);
    else if (item.kind === "document") buckets.documents.push(item);
    else buckets.audios.push(item);
  }
  return (Object.keys(buckets) as ConversationMediaGroupKey[])
    .map((key) => ({ key, label: MEDIA_GROUP_LABEL[key], items: buckets[key] }))
    .filter((group) => group.items.length > 0);
}
