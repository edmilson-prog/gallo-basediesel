import { DEFAULT_SESSION_TIMEOUT, type ISessionTimeoutSettings } from "@/shared/types";

/** Resolved, runtime-ready timeout values (milliseconds) + sound. */
export interface IResolvedSessionTimeout {
  enabled: boolean;
  idleMs: number;
  warningMs: number;
  soundEnabled: boolean;
  soundVolume: number;
}

/** Replaces non-positive/NaN numbers with the default. */
function sanitize(cfg: ISessionTimeoutSettings): { idleMinutes: number; warningSeconds: number } {
  const idleMinutes =
    Number.isFinite(cfg.idleMinutes) && cfg.idleMinutes > 0
      ? cfg.idleMinutes
      : DEFAULT_SESSION_TIMEOUT.idleMinutes;
  const warningSeconds =
    Number.isFinite(cfg.warningSeconds) && cfg.warningSeconds > 0
      ? cfg.warningSeconds
      : DEFAULT_SESSION_TIMEOUT.warningSeconds;
  return { idleMinutes, warningSeconds };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SESSION_TIMEOUT.soundVolume;
  return Math.min(1, Math.max(0, n));
}

/**
 * Resolves the effective idle-timeout config for a user. The same precedence
 * (per-user override, authoritative when present → global → default) applies to
 * every field, including sound — so the orchestrator reads one resolved object.
 */
export function resolveSessionTimeout(
  global: ISessionTimeoutSettings | undefined,
  override: ISessionTimeoutSettings | null | undefined,
): IResolvedSessionTimeout {
  const effective = override ?? global ?? DEFAULT_SESSION_TIMEOUT;
  if (!effective.enabled) {
    return { enabled: false, idleMs: 0, warningMs: 0, soundEnabled: false, soundVolume: 0 };
  }
  const { idleMinutes, warningSeconds } = sanitize(effective);
  const idleMs = idleMinutes * 60_000;
  let warningMs = warningSeconds * 1_000;
  if (warningMs >= idleMs) {
    warningMs = Math.max(1_000, idleMs - 1_000);
  }
  return {
    enabled: true,
    idleMs,
    warningMs,
    soundEnabled: effective.soundEnabled,
    soundVolume: clamp01(effective.soundVolume),
  };
}
