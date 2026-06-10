/**
 * Meta Cloud API 24h session-window math (PRD-117).
 *
 * Pure function — no I/O, no Date.now(): callers inject `nowMs` so the
 * boundary cases are unit-testable and the UI tick stays in control of
 * re-computation. `useMetaWindow` is the reactive wrapper.
 *
 * Rule (Meta): after the customer's last inbound message the business may
 * send free text for 24h; past that, only approved HSM templates (PRD-116).
 * Evolution has no equivalent restriction — the window never applies.
 */

export const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

export type MetaWindowState = "open-fresh" | "open-soon" | "open-closing" | "closed";

export interface ISessionWindowInput {
  /** Engine of the conversation's WhatsApp account. Only `meta` has a window. */
  provider: "meta" | "evolution" | "mock" | (string & {});
  /** Last `direction='in'` message timestamp (ISO). `null` = customer never wrote. */
  lastInboundAt: string | null;
  /** Reference clock in epoch ms — injected for purity. */
  nowMs: number;
}

export interface ISessionWindow {
  /** True only for Meta accounts — Evolution/mock have no 24h restriction. */
  applies: boolean;
  isOpen: boolean;
  state: MetaWindowState;
  /** Milliseconds remaining before the window closes. 0 when closed. */
  msRemaining: number;
  hoursLeft: number;
  minutesLeft: number;
  lastInboundAt: string | null;
  /** ISO timestamp at which the window closes. `null` when not applicable/closed without inbound. */
  closesAt: string | null;
  /** Convenience flag — whether free-text sending is allowed. */
  canSendFreeText: boolean;
}

export function pickWindowState(msRemaining: number): MetaWindowState {
  if (msRemaining <= 0) return "closed";
  const hours = msRemaining / 3_600_000;
  if (hours <= 1) return "open-closing";
  if (hours <= 12) return "open-soon";
  return "open-fresh";
}

export function computeSessionWindow(input: ISessionWindowInput): ISessionWindow {
  if (input.provider !== "meta") {
    return {
      applies: false,
      isOpen: true,
      state: "open-fresh",
      msRemaining: SESSION_WINDOW_MS,
      hoursLeft: 24,
      minutesLeft: 0,
      lastInboundAt: null,
      closesAt: null,
      canSendFreeText: true,
    };
  }

  // Meta conversation where the customer never wrote: the window never
  // opened — outbound-first contact requires an approved template.
  if (!input.lastInboundAt) {
    return {
      applies: true,
      isOpen: false,
      state: "closed",
      msRemaining: 0,
      hoursLeft: 0,
      minutesLeft: 0,
      lastInboundAt: null,
      closesAt: null,
      canSendFreeText: false,
    };
  }

  const closesAtMs = new Date(input.lastInboundAt).getTime() + SESSION_WINDOW_MS;
  const msRemaining = Math.max(0, closesAtMs - input.nowMs);
  const { hours, minutes } = formatRemaining(msRemaining);

  return {
    applies: true,
    isOpen: msRemaining > 0,
    state: pickWindowState(msRemaining),
    msRemaining,
    hoursLeft: hours,
    minutesLeft: minutes,
    lastInboundAt: input.lastInboundAt,
    closesAt: new Date(closesAtMs).toISOString(),
    canSendFreeText: msRemaining > 0,
  };
}

/** Minute-precision breakdown for the indicator ("8h 27min"). */
export function formatRemaining(msRemaining: number): { hours: number; minutes: number } {
  const totalMinutes = Math.max(0, Math.floor(msRemaining / 60_000));
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}
