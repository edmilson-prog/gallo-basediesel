// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/features/conversation-rescue/engine/determineAbsence.ts (sync: bun run scripts/sync-conversation-rescue-shared.ts)

import type { AbsenceKind, SellerAvailability } from "@/shared/types";

export interface IDetermineAbsenceInput {
  /** Whether the assigned seller is within their own work schedule right now. */
  isWithinSchedule: boolean;
  availability: SellerAvailability;
  /** ISO8601 — `conversations.awaiting_reply_since`. */
  awaitingReplySince: string;
  now: Date;
  temporaryAbsenceGraceMinutes: number;
}

/**
 * Pure absence classification (spec 2026-07-17). Out-of-schedule always wins
 * immediately ("day-to-day" absence — no grace period, they aren't coming
 * back today). Within schedule but not `online` only counts once the client
 * has waited at least `temporaryAbsenceGraceMinutes` — reuses the same clock
 * as `awaiting_reply_since` (sub-project A) instead of a new "since when
 * away" timestamp.
 */
export function determineAbsence(input: IDetermineAbsenceInput): AbsenceKind | null {
  if (!input.isWithinSchedule) return "schedule";
  if (input.availability === "online") return null;

  const elapsedMs = input.now.getTime() - new Date(input.awaitingReplySince).getTime();
  const graceMs = input.temporaryAbsenceGraceMinutes * 60_000;
  return elapsedMs >= graceMs ? "temporary" : null;
}
