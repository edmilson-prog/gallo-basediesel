/**
 * Pure eligibility decision for the NPS survey — no I/O, tested with Vitest.
 * Same arrangement as sdr-backstop-tick/eligibility.ts, and self-contained
 * because Deno does not resolve the `@/` alias.
 *
 * Guard order matters. `backfill` and `daily_cap` are the two backstops that
 * keep flipping the master switch from surveying the whole historical backlog
 * at once — the SDR mass-dispatch incident, repeated. Neither depends on the
 * other being correct, and both sit ahead of the cheaper filters on purpose.
 */

export type ISuppressionReason =
  | "disabled"
  | "trigger_off"
  | "backfill"
  | "delay"
  | "cooldown"
  | "active_survey"
  | "opt_out"
  | "no_human_message"
  | "sampling"
  | "send_window"
  | "daily_cap";

export interface INpsCandidate {
  conversationId: string;
  storeId: string;
  phoneDigits: string;
  closedAt: string;
  /** Most recent survey for this phone, from any trigger. Null if never surveyed. */
  lastSurveyAt: string | null;
  hasActiveSurvey: boolean;
  optOut: boolean;
  /** False when the thread only ever carried automation — surveying it measures nothing. */
  hasHumanMessage: boolean;
}

export interface INpsSchedulerSettings {
  enabled: boolean;
  triggerConversationEnabled: boolean;
  triggerConversationDelayHours: number;
  cooldownDays: number;
  samplingRate: number;
  sendWindowStartHour: number;
  sendWindowEndHour: number;
  maxBackfillDays: number;
  dailyCap: number;
}

export interface IEligibilityContext {
  now: Date;
  sentToday: number;
}

export type IEligibilityVerdict =
  | { eligible: true }
  | { eligible: false; reason: ISuppressionReason };

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * Deterministic FNV-1a hash of the conversation id, mapped to [0, 1).
 *
 * Sampling must never call random(): re-running the scheduler would re-roll
 * the dice and eventually survey someone the previous run had excluded, which
 * would quietly break both idempotency and the cooldown guarantee.
 */
function stableFraction(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash / 0x100000000;
}

export function evaluateEligibility(
  candidate: INpsCandidate,
  settings: INpsSchedulerSettings,
  ctx: IEligibilityContext,
): IEligibilityVerdict {
  const reject = (reason: ISuppressionReason): IEligibilityVerdict => ({
    eligible: false,
    reason,
  });

  if (!settings.enabled) return reject("disabled");
  if (!settings.triggerConversationEnabled) return reject("trigger_off");

  const nowMs = ctx.now.getTime();
  const closedMs = new Date(candidate.closedAt).getTime();

  if (nowMs - closedMs > settings.maxBackfillDays * DAY_MS) return reject("backfill");
  if (nowMs - closedMs < settings.triggerConversationDelayHours * HOUR_MS) return reject("delay");

  if (candidate.optOut) return reject("opt_out");
  if (!candidate.hasHumanMessage) return reject("no_human_message");
  if (candidate.hasActiveSurvey) return reject("active_survey");

  if (candidate.lastSurveyAt !== null) {
    const lastMs = new Date(candidate.lastSurveyAt).getTime();
    if (nowMs - lastMs < settings.cooldownDays * DAY_MS) return reject("cooldown");
  }

  const hour = ctx.now.getUTCHours();
  if (hour < settings.sendWindowStartHour || hour >= settings.sendWindowEndHour) {
    return reject("send_window");
  }

  if (ctx.sentToday >= settings.dailyCap) return reject("daily_cap");

  if (
    settings.samplingRate < 1 &&
    stableFraction(candidate.conversationId) >= settings.samplingRate
  ) {
    return reject("sampling");
  }

  return { eligible: true };
}

export interface IBatchDecision {
  accepted: INpsCandidate[];
  rejected: Array<{ candidate: INpsCandidate; reason: ISuppressionReason }>;
}

/**
 * Applies the decision to a whole batch, carrying the daily cap forward as it
 * accepts and refusing to survey the same phone twice in one tick — two open
 * conversations for one contact are still one person.
 *
 * Every rejection is returned rather than dropped, so the caller can report
 * what it suppressed and why. A tick that silently trims its own work reads as
 * "nothing was eligible" in the logs.
 */
export function decideSurveys(
  candidates: INpsCandidate[],
  settings: INpsSchedulerSettings,
  ctx: IEligibilityContext,
): IBatchDecision {
  const accepted: INpsCandidate[] = [];
  const rejected: IBatchDecision["rejected"] = [];
  const seenPhones = new Set<string>();
  let sentToday = ctx.sentToday;

  for (const candidate of candidates) {
    if (seenPhones.has(candidate.phoneDigits)) {
      rejected.push({ candidate, reason: "cooldown" });
      continue;
    }

    const verdict = evaluateEligibility(candidate, settings, { now: ctx.now, sentToday });
    if (verdict.eligible) {
      accepted.push(candidate);
      seenPhones.add(candidate.phoneDigits);
      sentToday += 1;
    } else {
      rejected.push({ candidate, reason: verdict.reason });
    }
  }

  return { accepted, rejected };
}
