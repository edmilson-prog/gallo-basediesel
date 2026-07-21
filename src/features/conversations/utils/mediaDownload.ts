import type { MessageMediaType } from "@/shared/types";

/** Extension synthesized per downloadable non-document media type (we lack the
 *  real MIME). `location`, `contact`, and `payment` are structured content with
 *  no binary to download, so they are excluded — `downloadFileName` never reaches
 *  them. */
const EXT_BY_TYPE: Record<
  Exclude<MessageMediaType, "document" | "location" | "contact" | "payment">,
  string
> = {
  image: "jpg",
  sticker: "webp",
  audio: "ogg",
  video: "mp4",
};

/**
 * Append Supabase Storage's `download` query param to an already-resolved URL so
 * the object endpoint answers with `Content-Disposition: attachment`. The HTML
 * `download` attribute is ignored for cross-origin URLs (our signed URLs are
 * cross-origin), so this param is the only reliable way to force a real save.
 * Pure string work on the resolved URL — it never re-signs or touches the
 * (frozen) media-resolution layer. Non-URL input is returned unchanged.
 */
export function buildDownloadHref(url: string, fileName: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("download", fileName);
    return u.toString();
  } catch {
    return url;
  }
}

/** Sanitize a caption/name into a safe file base (no separators, capped at 60). */
export function sanitizeFileBase(raw: string): string {
  const cleaned = raw
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return cleaned || "midia";
}

/**
 * Friendly download file name for a media item. A real existing name (a document
 * file name, when known) wins and keeps its extension; otherwise synthesize
 * `<base>.<ext>` from the caption or a stable id suffix (deterministic — no
 * Math.random, so it is testable).
 */
export function downloadFileName(opts: {
  mediaType: MessageMediaType | undefined;
  id: string;
  caption?: string | null;
  existingName?: string | null;
}): string {
  const existing = opts.existingName?.trim();
  if (existing) {
    const ext = existing.match(/\.[a-z0-9]+$/i)?.[0] ?? "";
    return sanitizeFileBase(existing.replace(/\.[a-z0-9]+$/i, "")) + ext;
  }
  const idSuffix = opts.id.replace(/[^a-z0-9]/gi, "").slice(-6) || "arquivo";
  const caption = opts.caption?.trim();
  const type = opts.mediaType;
  // `location`, `contact`, and `payment` have no binary to download (no download
  // affordance ever calls this for them); fold them into the document fallback so
  // the lookup below only ever sees a downloadable media type.
  if (
    !type ||
    type === "document" ||
    type === "location" ||
    type === "contact" ||
    type === "payment"
  ) {
    const base = caption ? sanitizeFileBase(caption) : `documento-${idSuffix}`;
    return /\.[a-z0-9]+$/i.test(base) ? base : `${base}.pdf`;
  }
  const ext = EXT_BY_TYPE[type];
  const base = caption ? sanitizeFileBase(caption) : `${type}-${idSuffix}`;
  return `${base}.${ext}`;
}

/**
 * Programmatic anchor click that forces a download with the chosen file name.
 * Browser-only (uses `document`); never called from tests.
 */
export function triggerMediaDownload(url: string, fileName: string): void {
  const a = document.createElement("a");
  a.href = buildDownloadHref(url, fileName);
  a.download = fileName; // same-origin hint; cross-origin relies on the param above
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
