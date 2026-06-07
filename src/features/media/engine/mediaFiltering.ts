import type { IListMediaParams, IMediaAsset } from "@/shared/types";

/** A contiguous match range (char offsets) for search-term highlighting. */
export interface IHighlightRange {
  start: number;
  end: number;
}

/**
 * A contiguous slice of the source text, flagged as a match or not. The full
 * ordered list of segments reassembles the original string verbatim (matched
 * and unmatched slices preserve their original casing).
 */
export interface IHighlightSegment {
  text: string;
  isMatch: boolean;
}

/** Concatenated searchable text of an asset (fileName + ocr + transcription). */
function searchHaystack(asset: IMediaAsset): string {
  return [asset.fileName ?? "", asset.ocrText ?? "", asset.transcription ?? ""].join(" ");
}

/**
 * Apply every set filter with AND semantics, then a case-insensitive text
 * search over fileName/ocrText/transcription. Pure; preserves input order.
 * Spec §8 (mediaFiltering).
 */
export function applyMediaFilters(
  assets: IMediaAsset[],
  filter: IListMediaParams,
): IMediaAsset[] {
  const q = filter.search?.toLowerCase().trim() ?? "";
  return assets.filter((a) => {
    if (filter.conversationId && a.conversationId !== filter.conversationId) return false;
    if (filter.customerId && a.customerId !== filter.customerId) return false;
    if (filter.kind && a.kind !== filter.kind) return false;
    if (filter.classification && a.classification !== filter.classification) return false;
    if (filter.authorType && a.authorType !== filter.authorType) return false;
    if (filter.from && a.createdAt < filter.from) return false;
    if (filter.to && a.createdAt > filter.to) return false;
    if (q.length > 0 && !searchHaystack(a).toLowerCase().includes(q)) return false;
    return true;
  });
}

/**
 * Char ranges of every occurrence of `term` within `text` (case-insensitive).
 * Used by the UI to wrap matches in <mark>. Empty for empty term / no match.
 */
export function highlightRanges(text: string, term: string): IHighlightRange[] {
  const needle = term.toLowerCase().trim();
  if (needle.length === 0) return [];
  const hay = text.toLowerCase();
  const ranges: IHighlightRange[] = [];
  let from = 0;
  for (;;) {
    const idx = hay.indexOf(needle, from);
    if (idx === -1) break;
    ranges.push({ start: idx, end: idx + needle.length });
    from = idx + needle.length;
  }
  return ranges;
}

/**
 * Split `text` into ordered segments covering the WHOLE string, flagging the
 * `term` occurrences with `isMatch: true`. Built on {@link highlightRanges}.
 * When there is no match (or an empty term), returns a single non-match
 * segment with the full text. Plan B maps over this to render <mark> spans
 * without re-implementing offset math.
 */
export function highlightSegments(text: string, term: string): IHighlightSegment[] {
  const ranges = highlightRanges(text, term);
  if (ranges.length === 0) return [{ text, isMatch: false }];
  const segments: IHighlightSegment[] = [];
  let cursor = 0;
  for (const { start, end } of ranges) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), isMatch: false });
    segments.push({ text: text.slice(start, end), isMatch: true });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), isMatch: false });
  return segments;
}
