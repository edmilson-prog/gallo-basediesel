export type IdlePhase = "active" | "warning" | "expired";

export interface IIdleStatus {
  phase: IdlePhase;
  /** ms until the warning opens (0 once in warning/expired). */
  msUntilWarning: number;
  /** ms until logout (0 when expired). */
  msUntilLogout: number;
}

/**
 * Pure phase computation for the idle timer. `lastActivityAt`/`now` are epoch ms.
 * A future `lastActivityAt` (clock skew) is clamped to "no time elapsed".
 */
export function computeIdlePhase(
  lastActivityAt: number,
  now: number,
  idleMs: number,
  warningMs: number,
): IIdleStatus {
  const elapsed = Math.max(0, now - lastActivityAt);
  const warnAt = idleMs - warningMs;
  const msUntilWarning = Math.max(0, warnAt - elapsed);
  const msUntilLogout = Math.max(0, idleMs - elapsed);
  let phase: IdlePhase = "active";
  if (elapsed >= idleMs) phase = "expired";
  else if (elapsed >= warnAt) phase = "warning";
  return { phase, msUntilWarning, msUntilLogout };
}
