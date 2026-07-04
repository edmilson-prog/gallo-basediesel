/** A newer deploy is live when the remote build id is known and differs from ours. */
export function hasNewDeploy(localBuildId: string, remoteBuildId: string | null): boolean {
  if (!remoteBuildId) return false;
  return remoteBuildId !== localBuildId;
}

/** After the user dismisses the card, reopen it once the snooze window elapses. */
export function shouldReopenPrompt(
  dismissedAt: number | null,
  now: number,
  intervalMs: number,
): boolean {
  if (dismissedAt === null) return false;
  return now - dismissedAt >= intervalMs;
}

/**
 * Loop guard for the chunk-error auto-reload: only attempt a reload if we have
 * NOT already reloaded for this exact build. After a successful reload the build
 * id changes, so the stored value stops matching and the guard self-clears.
 */
export function shouldAttemptChunkReload(
  storedBuildId: string | null,
  currentBuildId: string,
): boolean {
  return storedBuildId !== currentBuildId;
}
