/**
 * When the app may show the soft ask for notification permission.
 *
 * Permission is capital: asking at the wrong moment burns the channel for good,
 * because the browser's "Block" is effectively irreversible from our side. So
 * the soft ask only appears while the browser is still undecided, and a refusal
 * buys silence for two weeks.
 */

export const PUSH_DECLINE_COOLDOWN_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface IPushOptInState {
  /** The browser's own permission state. */
  permission: NotificationPermission;
  /** ISO stamp of the last "Agora não", or null if never refused. */
  declinedAt: string | null;
  now: Date;
}

export function shouldOfferPush({ permission, declinedAt, now }: IPushOptInState): boolean {
  // Already answered by the browser — granted needs no ask, denied cannot be
  // undone by one.
  if (permission !== "default") return false;
  if (!declinedAt) return true;

  const declined = new Date(declinedAt).getTime();
  // A corrupt stamp must not silence the app forever.
  if (Number.isNaN(declined)) return true;

  return now.getTime() - declined >= PUSH_DECLINE_COOLDOWN_DAYS * DAY_MS;
}
