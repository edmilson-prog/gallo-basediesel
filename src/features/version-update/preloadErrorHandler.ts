import { attemptGuardedChunkReload } from "./lib/hardReload";

/**
 * Registers a listener for Vite's `vite:preloadError`, fired when a dynamic
 * import (lazy route chunk) fails to load — typically because a newer deploy
 * removed the old chunk. We recover by reloading onto the new build
 * (loop-guarded). `preventDefault` is only called when the reload actually
 * happens; when the loop guard blocks it (persistent failure), we let Vite's
 * default re-throw happen so the root error boundary catches a real error and
 * renders `ChunkErrorScreen` with a manual action — instead of the import
 * silently resolving to `undefined`. Call once at startup.
 */
export function initPreloadErrorHandler(): void {
  window.addEventListener("vite:preloadError", (event) => {
    // Suppress Vite's re-throw only when we are actually reloading onto the new
    // build. When the loop guard blocks (persistent failure), let the import keep
    // rejecting so the root error boundary catches a real chunk error and renders
    // ChunkErrorScreen with a manual action instead of resolving to undefined.
    if (attemptGuardedChunkReload()) {
      event.preventDefault();
    }
  });
}
