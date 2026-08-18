// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/echoContinuity.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/**
 * Echo continuity window (decision 2026-07-23 —
 * docs/dev/conversation-split-echo-after-close.md §7 item 3).
 *
 * A phone-sent echo normally NEVER reuses a closed conversation — closing is
 * a deliberate act, and an echo must not resurrect it. The continuity window
 * softens exactly one case: when the contact's most recent conversation on
 * the same account is `resolvida` and was closed less than `windowHours` ago,
 * the echo APPENDS to it — without reopening — so a follow-up sent from the
 * phone right after closing doesn't split the thread. `arquivada` never
 * participates; the customer's next inbound still reopens the thread through
 * the normal inbound rule.
 *
 * Runtime-agnostic: pure functions, no imports (mirrored to
 * `supabase/functions/_shared/whatsapp/` by scripts/sync-whatsapp-shared.ts).
 */

export const DEFAULT_ECHO_CONTINUITY_WINDOW_HOURS = 24;

/**
 * Reads `echoContinuity.windowHours` from a raw `stores.settings` blob (jsonb,
 * untyped at the edge). Absent or malformed → the 24h default; negative → 0
 * (a deliberate 0 disables the window).
 */
export function resolveEchoContinuityWindowHours(settings: unknown): number {
  const raw = (settings as { echoContinuity?: { windowHours?: unknown } } | null | undefined)
    ?.echoContinuity?.windowHours;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_ECHO_CONTINUITY_WINDOW_HOURS;
  }
  return Math.max(0, raw);
}

/**
 * ISO cutoff for the reuse lookup (`closed_at >= cutoff`), or `null` when the
 * window is disabled — the caller skips the lookup entirely on `null`.
 */
export function echoContinuityCutoffIso(nowMs: number, windowHours: number): string | null {
  if (windowHours <= 0) return null;
  return new Date(nowMs - windowHours * 3_600_000).toISOString();
}
