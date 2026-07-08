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
 * Infers which attach picker `AttachmentKind` a raw `File` (dropped or pasted)
 * belongs to, without ever chancing on the wrong lane. Video is explicitly
 * rejected rather than falling through to "document" (PRD-119 RF-026 has no
 * video kind). `null` means "don't attach it" — the caller toasts and stops.
 *
 * Falls back to the file name extension when `type` is empty, which browsers
 * commonly do for clipboard-pasted files.
 */
export function inferAttachmentKind(file: Pick<File, "type" | "name">): AttachmentKind | null {
  const type = file.type.toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("video/")) return null;
  if (DOCUMENT_MIME_TYPES.has(type)) return "document";

  const name = file.name.toLowerCase();
  if (DOCUMENT_EXTENSIONS.some((ext) => name.endsWith(ext))) return "document";

  return null;
}
