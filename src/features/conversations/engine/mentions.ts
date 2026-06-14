/**
 * Pure helpers for "@mention" handling inside conversation notes.
 *
 * Two concerns, no React and no side effects:
 *  - the composer side: detect the `@token` being typed at the caret
 *    (mirrors quick-send's `parseSlash`) and rewrite it into `@Display `.
 *  - the render/persist side: resolve which sellers a finished note mentions
 *    (greedy longest-name match, boundary-aware) and split it into segments
 *    so the UI can highlight the mentions.
 *
 * The source of truth for mentions is always the text crossed with the seller
 * list — there is no parallel state to drift, so deleting an `@Name` from the
 * text removes the mention, and the persisted `mentions[]` stays honest.
 */
import type { ID } from "@/shared/types";

export interface IMentionQuery {
  /** True while a mention token is open at the caret. */
  active: boolean;
  /** Text typed after `@`, up to the caret (never contains whitespace). */
  query: string;
  /** Index of the opening `@`. */
  start: number;
  /** Caret index (end of the token). */
  end: number;
}

/** A seller that can be mentioned. `display` = attendantName || fullName. */
export interface IMentionCandidate {
  id: ID;
  display: string;
}

export type INoteSegment =
  | { type: "text"; value: string }
  | { type: "mention"; value: string; id: ID };

const INACTIVE: IMentionQuery = { active: false, query: "", start: -1, end: -1 };

/** A "word" char for boundary checks — Unicode letters and digits. */
const WORD = /[\p{L}\p{N}]/u;

/**
 * Inspects `value` + `caret` and decides whether an `@mention` token is open.
 * Fires only when `@` starts the message or immediately follows whitespace
 * (so e-mails like `user@host` never trigger it) and closes as soon as a space
 * is typed — the user picks from the list, they don't type the full name.
 */
export function parseMentionQuery(value: string, caret: number): IMentionQuery {
  if (caret <= 0) return INACTIVE;
  const head = value.slice(0, caret);
  const at = head.lastIndexOf("@");
  if (at < 0) return INACTIVE;

  // The char immediately before `@` must be start-of-string or whitespace.
  const prev = at === 0 ? "" : (head[at - 1] ?? "");
  if (prev !== "" && !/\s/.test(prev)) return INACTIVE;

  const token = head.slice(at + 1);
  // A space closes the mention (the picker fills the rest of the name).
  if (/\s/.test(token)) return INACTIVE;

  return { active: true, query: token, start: at, end: caret };
}

/**
 * Replaces the open token (`value[start..end]`) with `@Display ` and returns
 * the new value plus the caret position right after the inserted space.
 */
export function applyMention(
  value: string,
  query: IMentionQuery,
  display: string,
): { value: string; caret: number } {
  const before = value.slice(0, query.start);
  const after = value.slice(query.end);
  const insert = `@${display} `;
  return { value: before + insert + after, caret: before.length + insert.length };
}

interface IMentionSpan {
  start: number;
  end: number;
  id: ID;
}

/**
 * Finds the non-overlapping `@Display` spans in `text`. Candidates are matched
 * longest-display-first so `@Ana Paula` wins over `@Ana`, and each match must
 * sit on word boundaries (so `@Anabela` and `user@Ana` do not match `@Ana`).
 */
function findMentionSpans(text: string, candidates: IMentionCandidate[]): IMentionSpan[] {
  const sorted = candidates
    .filter((c) => c.display.trim().length > 0)
    .sort((a, b) => b.display.length - a.display.length);

  const consumed = new Array(text.length).fill(false);
  const spans: IMentionSpan[] = [];

  for (const candidate of sorted) {
    const needle = `@${candidate.display}`;
    let from = 0;
    for (;;) {
      const idx = text.indexOf(needle, from);
      if (idx < 0) break;
      const end = idx + needle.length;
      const prevCh = idx > 0 ? text[idx - 1] : undefined;
      const nextCh = text[end];
      const prevOk = prevCh === undefined || !WORD.test(prevCh);
      const nextOk = nextCh === undefined || !WORD.test(nextCh);

      let overlaps = false;
      for (let k = idx; k < end; k += 1) {
        if (consumed[k]) {
          overlaps = true;
          break;
        }
      }

      if (prevOk && nextOk && !overlaps) {
        spans.push({ start: idx, end, id: candidate.id });
        for (let k = idx; k < end; k += 1) consumed[k] = true;
      }
      from = idx + 1;
    }
  }

  return spans.sort((a, b) => a.start - b.start);
}

/** Unique seller ids mentioned in `text`, in order of first appearance. */
export function extractMentionedIds(text: string, candidates: IMentionCandidate[]): ID[] {
  const seen = new Set<ID>();
  const ids: ID[] = [];
  for (const span of findMentionSpans(text, candidates)) {
    if (!seen.has(span.id)) {
      seen.add(span.id);
      ids.push(span.id);
    }
  }
  return ids;
}

/** Splits `text` into text/mention segments for highlighted rendering. */
export function segmentNote(text: string, candidates: IMentionCandidate[]): INoteSegment[] {
  const spans = findMentionSpans(text, candidates);
  if (spans.length === 0) return text ? [{ type: "text", value: text }] : [];

  const out: INoteSegment[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) out.push({ type: "text", value: text.slice(cursor, span.start) });
    out.push({ type: "mention", value: text.slice(span.start, span.end), id: span.id });
    cursor = span.end;
  }
  if (cursor < text.length) out.push({ type: "text", value: text.slice(cursor) });
  return out;
}
