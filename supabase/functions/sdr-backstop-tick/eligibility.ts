// Pure decision engine for sdr-backstop-tick — no I/O, fully unit-tested.
// The relational eligibility filter (pilot gates, queue state,
// last-message-is-inbound, activation stamps, 24h window) lives in the
// sdr_backstop_candidates RPC; this module only decides, per candidate,
// whether the wait threshold was crossed, and applies the hard per-tick cap.
import type { IBusinessHoursWindow } from "@/shared/types";
import { isWithinBusinessHours } from "../_shared/distribution/engine/businessHours.ts";

/** Hard safety cap — not a business knob, never exposed in the UI. */
export const MAX_ACTIVATIONS_PER_TICK = 10;
export const DEFAULT_TIMEOUT_MINUTES = 2;

export interface IBackstopCandidate {
  conversationId: string;
  storeId: string;
  whatsappAccountId: string;
  /** ISO timestamp of the conversation's last (inbound) message. */
  lastInboundAt: string;
}

export interface IStorePilotConfig {
  timeoutMinutes: number;
  businessHours: IBusinessHoursWindow[];
}

export interface IBackstopDecision {
  /** FIFO by lastInboundAt, capped at `cap`. */
  toActivate: IBackstopCandidate[];
  /** Candidates past their threshold, before the cap. */
  eligibleCount: number;
  /** eligibleCount − toActivate.length — logged by the tick, never silent. */
  cappedCount: number;
}

/**
 * Threshold semantics: inside business hours — or when the store has no
 * ENABLED windows (missing data resolves to the CONSERVATIVE branch) — the
 * customer must have waited `timeoutMinutes` since their last message.
 * Outside configured business hours the threshold is 0 (immediate night
 * coverage — safe now that the candidates RPC excludes backlog).
 */
export function decideActivations(
  candidates: IBackstopCandidate[],
  configByStore: Map<string, IStorePilotConfig>,
  now: Date,
  cap: number = MAX_ACTIVATIONS_PER_TICK,
): IBackstopDecision {
  const eligible = candidates.filter((candidateRow) => {
    const config = configByStore.get(candidateRow.storeId);
    const timeoutMinutes = config?.timeoutMinutes ?? DEFAULT_TIMEOUT_MINUTES;
    const windows = config?.businessHours ?? [];
    const hasEnabledWindows = windows.some((win) => win.enabled);
    const within = hasEnabledWindows ? isWithinBusinessHours(now, windows) : true;
    const thresholdMinutes = within ? timeoutMinutes : 0;
    const elapsedMs = now.getTime() - new Date(candidateRow.lastInboundAt).getTime();
    return elapsedMs >= thresholdMinutes * 60_000;
  });
  const sorted = [...eligible].sort(
    (a, b) => new Date(a.lastInboundAt).getTime() - new Date(b.lastInboundAt).getTime(),
  );
  const toActivate = sorted.slice(0, cap);
  return {
    toActivate,
    eligibleCount: eligible.length,
    cappedCount: eligible.length - toActivate.length,
  };
}
