import type { AttachmentKind } from "../hooks/useAttachmentUpload";

/** MIME types that map to `"document"` beyond the image/audio prefixes. */
const DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
  "application/xml",
  "text/xml",
  "application/zip",
]);

/** Mirrors `ATTACHMENT_ACCEPT.document` in useAttachmentUpload.ts. */
const DOCUMENT_EXTENSIONS = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt", ".xml", ".zip"];

/**
 * Extension fallbacks for the media kinds, in priority order.
 *
 * The MIME check above handles the common case, but a browser can hand over an
 * empty `type` (clipboard paste, some drag sources) or a generic
 * `application/octet-stream` — in which case a perfectly valid .mp4 used to be
 * refused as "unsupported". `.ogg` is claimed by audio: WhatsApp voice notes
 * use it and video/ogg is vanishingly rare in this workflow.
 */
const MEDIA_EXTENSIONS: ReadonlyArray<readonly [AttachmentKind, readonly string[]]> = [
  ["video", [".mp4", ".mov", ".3gp", ".3gpp", ".webm", ".mkv", ".avi", ".m4v"]],
  ["image", [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".heic", ".heif"]],
  ["audio", [".mp3", ".ogg", ".oga", ".opus", ".m4a", ".aac", ".wav", ".amr"]],
];

/**
 * Infers which attach picker `AttachmentKind` a raw `File` (dropped or pasted)
 * belongs to, without ever chancing on the wrong lane. `null` means "don't
 * attach it" — the caller toasts and stops.
 *
 * Falls back to the file name extension when `type` is empty, which browsers
 * commonly do for clipboard-pasted files.
 */
export function inferAttachmentKind(file: Pick<File, "type" | "name">): AttachmentKind | null {
  const type = file.type.toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (DOCUMENT_MIME_TYPES.has(type)) return "document";

  const name = file.name.toLowerCase();
  if (DOCUMENT_EXTENSIONS.some((ext) => name.endsWith(ext))) return "document";
  for (const [kind, extensions] of MEDIA_EXTENSIONS) {
    if (extensions.some((ext) => name.endsWith(ext))) return kind;
  }

  return null;
}
