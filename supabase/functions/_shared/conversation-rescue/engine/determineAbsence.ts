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
  /** Waits older than this are backlog (idle-alerts territory), never a rescue. */
  maxClientWaitHours: number;
}

/**
 * Pure absence classification (spec 2026-07-17). The max-wait window is
 * checked first — rescue reacts to FRESH client messages; stale backlog
 * belongs to sub-project A's idle alerts (incident 2026-07-18: enabling the
 * feature swept months-old waits into an instant broadcast avalanche).
 * Then out-of-schedule wins immediately ("day-to-day" absence — no grace
 * period, they aren't coming back today). Within schedule but not `online`
 * only counts once the client has waited at least
 * `temporaryAbsenceGraceMinutes` — reuses the same clock as
 * `awaiting_reply_since` (sub-project A) instead of a new "since when away"
 * timestamp.
 */
export function determineAbsence(input: IDetermineAbsenceInput): AbsenceKind | null {
  const elapsedMs = input.now.getTime() - new Date(input.awaitingReplySince).getTime();
  if (elapsedMs > input.maxClientWaitHours * 3_600_000) return null;

  if (!input.isWithinSchedule) return "schedule";
  if (input.availability === "online") return null;

  const graceMs = input.temporaryAbsenceGraceMinutes * 60_000;
  return elapsedMs >= graceMs ? "temporary" : null;
}
