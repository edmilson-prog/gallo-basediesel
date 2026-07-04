import { attemptGuardedChunkReload } from "./lib/hardReload";

/**
 * Registers a listener for Vite's `vite:preloadError`, fired when a dynamic
 * import (lazy route chunk) fails to load — typically because a newer deploy
 * removed the old chunk. Calling preventDefault stops Vite from throwing; we
 * recover by reloading onto the new build (loop-guarded). Call once at startup.
 */
export function initPreloadErrorHandler(): void {
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    attemptGuardedChunkReload();
  });
}
