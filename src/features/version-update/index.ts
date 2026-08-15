export { initPreloadErrorHandler } from "./preloadErrorHandler";
export { isChunkLoadError } from "./engine/chunkError";
export { ChunkErrorScreen } from "./components/ChunkErrorScreen";
export { VersionUpdatePrompt } from "./components/VersionUpdatePrompt";
// Exposed so the atendimento PWA can wear its own skin over the same engine:
// one /version.json, one reload path, two very different screens.
export { useDeployWatcher } from "./hooks/useDeployWatcher";
export { shouldReopenPrompt } from "./engine/deployGate";
export { hardReload } from "./lib/hardReload";
