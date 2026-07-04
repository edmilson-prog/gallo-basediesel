import { shouldAttemptChunkReload } from "../engine/deployGate";
import { getLocalBuildId } from "./buildId";

/** sessionStorage key holding the build id of the last chunk-error auto-reload. */
const CHUNK_RELOAD_GUARD_KEY = "gallo-chunk-reload-attempt";

/**
 * Clears the Cache Storage (removes orphaned chunks cached by the static SW) and
 * reloads. The SW never caches navigation/HTML, so the reload always fetches a
 * fresh index.html pointing at the new hashed chunks. `location.reload(true)` is
 * obsolete/ignored — clearing caches + a normal reload is the practical
 * equivalent (every asset is content-hashed).
 */
export async function hardReload(): Promise<void> {
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // Cache clearing is best-effort — never block the reload.
  }
  window.location.reload();
}

/** True unless we already auto-reloaded for this exact build (loop guard). */
export function canGuardedChunkReload(): boolean {
  try {
    const stored = sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY);
    return shouldAttemptChunkReload(stored, getLocalBuildId());
  } catch {
    // sessionStorage unavailable → allow a single attempt.
    return true;
  }
}

/** Records this build as "attempted" then hard-reloads. */
export function commitGuardedChunkReload(): void {
  try {
    sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, getLocalBuildId());
  } catch {
    // ignore — proceed with the reload regardless.
  }
  void hardReload();
}

/**
 * Reloads onto the new build unless the guard already fired for this build.
 * Returns true if a reload was triggered, false if the caller should surface a
 * manual action instead.
 */
export function attemptGuardedChunkReload(): boolean {
  if (!canGuardedChunkReload()) return false;
  commitGuardedChunkReload();
  return true;
}
