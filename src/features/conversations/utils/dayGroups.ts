import type { IMessage, IConversationNote, IAdReferral } from "@/shared/types";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";
import { buildAdReferralView, type IAdReferralView } from "../engine/adReferral";

const MS_PER_DAY = 86_400_000;

/** Strip the time component to a stable day key (`YYYY-MM-DD`) using local time. */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function weekdayLabel(date: Date): string {
  const idx = date.getDay();
  return CONVERSATION_STRINGS.weekdays[idx] ?? "";
}

function midnight(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Human-readable label for a day separator between message groups.
 *
 *   - 0 days ago → "Hoje"
 *   - 1 day ago  → "Ontem"
 *   - 2-6 days   → weekday name, lowercase ("segunda-feira")
 *   - older      → "12 de maio" / "3 de dezembro de 2024" if not current year
 */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const diffDays = Math.floor((midnight(now) - midnight(date)) / MS_PER_DAY);
  if (diffDays <= 0) return CONVERSATION_STRINGS.today;
  if (diffDays === 1) return CONVERSATION_STRINGS.yesterday;
  if (diffDays < 7) {
    return weekdayLabel(date);
  }
  const day = date.getDate();
  const monthIdx = date.getMonth();
  const months = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  const sameYear = date.getFullYear() === now.getFullYear();
  return sameYear
    ? `${day} de ${months[monthIdx]}`
    : `${day} de ${months[monthIdx]} de ${date.getFullYear()}`;
}

export interface IDaySeparator {
  kind: "day";
  id: string;
  label: string;
}

export interface IMessageRow {
  kind: "message";
  id: string;
  message: IMessage;
}

export type ConversationRow = IDaySeparator | IMessageRow;

/**
 * Walk the messages (assumed sorted ascending by `sentAt`) and insert day
 * separators whenever the local-time day changes.
 */
export function groupMessagesWithDaySeparators(
  messages: IMessage[],
  now: Date = new Date(),
): ConversationRow[] {
  const rows: ConversationRow[] = [];
  let lastKey = "";
  for (const message of messages) {
    const key = dayKey(new Date(message.sentAt));
    if (key !== lastKey) {
      rows.push({ kind: "day", id: `day-${key}`, label: dayLabel(message.sentAt, now) });
      lastKey = key;
    }
    rows.push({ kind: "message", id: message.id, message });
  }
  return rows;
}

export interface INoteRow {
  kind: "note";
  id: string;
  note: IConversationNote;
}

/** A message, an internal note, the ad-origin card, or a day separator — the
 *  unified thread. */
export type ThreadRow = IDaySeparator | IMessageRow | INoteRow | IAdReferralRow;

/**
 * Merge messages (sorted ascending by `sentAt`) with internal notes (by
 * `createdAt`) into one chronological thread, inserting day separators when the
 * local-time day changes. Notes render inline in the chat but never leave for
 * the customer — they live in `conversation_notes`, not `messages`.
 */
export function buildThreadRows(
  messages: IMessage[],
  notes: IConversationNote[],
  now: Date = new Date(),
): ThreadRow[] {
  const items: { ts: number; iso: string; row: IMessageRow | INoteRow }[] = [];
  for (const message of messages) {
    items.push({
      ts: new Date(message.sentAt).getTime(),
      iso: message.sentAt,
      row: { kind: "message", id: message.id, message },
    });
  }
  for (const note of notes) {
    items.push({
      ts: new Date(note.createdAt).getTime(),
      iso: note.createdAt,
      row: { kind: "note", id: `note-${note.id}`, note },
    });
  }
  items.sort((a, b) => a.ts - b.ts);

  const rows: ThreadRow[] = [];
  let lastKey = "";
  for (const item of items) {
    const key = dayKey(new Date(item.iso));
    if (key !== lastKey) {
      rows.push({ kind: "day", id: `day-${key}`, label: dayLabel(item.iso, now) });
      lastKey = key;
    }
    rows.push(item.row);
  }
  return rows;
}

export interface IAdReferralRow {
  kind: "adReferral";
  id: string;
  view: IAdReferralView;
}

/**
 * Prepends the ad-origin card to a thread built by `buildThreadRows`, ahead of
 * the first day separator: the referral describes how the conversation STARTED,
 * so it reads before anything that was said.
 *
 * Returns the very same array when there is nothing worth showing, so the
 * caller's `useMemo` keeps its reference and React skips the re-render.
 */
export function prependAdReferralRow(
  rows: ThreadRow[],
  referral: IAdReferral | undefined | null,
): ThreadRow[] {
  const view = buildAdReferralView(referral);
  if (!view) return rows;
  return [{ kind: "adReferral", id: "ad-referral", view }, ...rows];
}
