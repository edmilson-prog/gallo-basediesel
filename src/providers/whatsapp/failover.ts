/**
 * Failover engine (PRD-120).
 *
 * Pure decision logic shared by the send pipeline (effective-account
 * resolution) and the health monitor (state transitions, auto-activate /
 * auto-restore). The SQL tick (`public.whatsapp_health_tick`) mirrors the
 * same thresholds — conscious drift, like the derived-notification rules.
 *
 * Runtime-agnostic file: relative imports only, Web APIs only.
 */

import { WhatsAppProviderError } from "./errors";
import type { IAccountRecord } from "./webhook/core";
import type { SendKind } from "./send/core";

export type AccountHealthState = "healthy" | "degraded" | "down" | "paused";
export type FailoverPolicy = "disabled" | "manual" | "automatic";

/** Failover-relevant slice of a whatsapp_accounts row (PRD-120 columns). */
export interface IFailoverAccountState {
  currentState: AccountHealthState;
  stateChangedAt: string | null;
  failoverPolicy: FailoverPolicy;
  failoverAccountId: string | null;
  isFailoverActive: boolean;
}

/** Account record extended with the PRD-120 failover columns. */
export type IFailoverAwareAccount = IAccountRecord & IFailoverAccountState;

/** Error-rate thresholds of RF-020 (share of failed calls, 0..1). */
export const ERROR_RATE_DEGRADED = 0.1;
export const ERROR_RATE_DOWN = 0.7;
/** Below this sample size the window is statistically meaningless (RNF-001). */
export const MIN_CALLS_FOR_EVALUATION = 5;
/** RF-031 — continuous healthy time before auto-restore. */
export const AUTO_RESTORE_AFTER_MS = 30 * 60_000;

export interface IStateEvaluationInput {
  /** Result of the engine healthCheck, when one was performed. */
  healthCheck?: "healthy" | "degraded" | "down";
  /** Calls observed in the evaluation window (integration_logs, 15min). */
  totalCalls: number;
  /** Failed calls (HTTP >= 400 or transport error) in the same window. */
  errorCalls: number;
  /** Current persisted state — kept when the window has no signal. */
  currentState: AccountHealthState;
}

/**
 * RF-020 state matrix. `paused` is sticky: it is set by Meta-specific events
 * (account paused) and only leaves via manual owner action — the evaluator
 * never transitions out of it.
 */
export function evaluateAccountState(input: IStateEvaluationInput): AccountHealthState {
  if (input.currentState === "paused") return "paused";

  const rate = input.totalCalls > 0 ? input.errorCalls / input.totalCalls : null;
  const hasSample = input.totalCalls >= MIN_CALLS_FOR_EVALUATION;

  if (input.healthCheck === "down") return "down";
  if (hasSample && rate !== null && rate >= ERROR_RATE_DOWN) return "down";
  if (input.healthCheck === "degraded") return "degraded";
  if (hasSample && rate !== null && rate >= ERROR_RATE_DEGRADED) return "degraded";
  if (input.healthCheck === "healthy" || hasSample) return "healthy";

  // No healthCheck and not enough traffic — keep whatever we knew.
  return input.currentState;
}

/** RF-030 — automatic activation condition. */
export function shouldAutoActivateFailover(account: IFailoverAccountState): boolean {
  return (
    account.failoverPolicy === "automatic" &&
    account.failoverAccountId !== null &&
    !account.isFailoverActive &&
    (account.currentState === "down" || account.currentState === "paused")
  );
}

/** RF-031 — auto-restore after >= 30min continuously healthy. */
export function shouldAutoRestoreFailover(account: IFailoverAccountState, nowMs: number): boolean {
  if (!account.isFailoverActive) return false;
  if (account.currentState !== "healthy") return false;
  if (!account.stateChangedAt) return false;
  const changed = Date.parse(account.stateChangedAt);
  if (!Number.isFinite(changed)) return false;
  return nowMs - changed >= AUTO_RESTORE_AFTER_MS;
}

export interface IResolvedSendAccount {
  account: IAccountRecord;
  /** True when the send was routed through the backup account. */
  usedFailover: boolean;
}

/**
 * RF-040 — effective account for an outbound send. When the primary has an
 * ACTIVE failover, the backup takes over for NEW sends; HSM templates (and
 * any Meta-only kind) require a Meta backup — otherwise the send bounces with
 * FAILOVER_INCOMPATIBLE (RF-041) instead of silently going out wrong.
 */
export function resolveEffectiveAccount(args: {
  primary: IFailoverAwareAccount;
  failover: IAccountRecord | null;
  kind: SendKind;
}): IResolvedSendAccount {
  const { primary, failover, kind } = args;
  if (!primary.isFailoverActive || !primary.failoverAccountId) {
    return { account: primary, usedFailover: false };
  }
  if (!failover) {
    // Misconfiguration (backup row gone) — fail open to the primary instead
    // of blocking the seller; the health dashboard surfaces the state.
    return { account: primary, usedFailover: false };
  }
  if (kind === "template" && failover.provider !== "meta") {
    throw new WhatsAppProviderError(
      "FAILOVER_INCOMPATIBLE",
      422,
      "Conta em failover, mas o provedor reserva não envia templates HSM. Aguarde a restauração ou contate o gestor.",
      { primaryAccountId: primary.id, failoverAccountId: failover.id, kind },
    );
  }
  return { account: failover, usedFailover: true };
}
