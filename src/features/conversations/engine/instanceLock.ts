import type { IWhatsAppAccount } from "@/shared/types";

/** Why the conversation is locked — mirrors the non-"connected" account statuses. */
export type InstanceLockReason = "disconnected" | "pending";

export interface IInstanceLockResult {
  locked: boolean;
  reason?: InstanceLockReason;
}

/**
 * Whether a conversation must be locked to read-only because its WhatsApp
 * instance can't send or receive right now.
 *
 * Deliberately independent of `alertsMuted` — that flag only silences the
 * Owner-facing disconnect notifications (banner/TopBar/bell), it doesn't change
 * whether the channel actually works. A muted-but-disconnected account (the
 * common case: someone silenced the noise instead of fixing the instance) must
 * still lock the conversation, otherwise nothing else in the UI reflects reality.
 *
 * Fail-open: an account we couldn't resolve (still loading, or the fetch failed)
 * never locks — a transient load failure shouldn't read as a dead instance.
 */
export function deriveInstanceLock(
  account: Pick<IWhatsAppAccount, "status"> | null | undefined,
): IInstanceLockResult {
  if (!account) return { locked: false };
  if (account.status === "connected") return { locked: false };
  return { locked: true, reason: account.status };
}
