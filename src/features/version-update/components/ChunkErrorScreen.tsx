import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { canGuardedChunkReload, commitGuardedChunkReload, hardReload } from "../lib/hardReload";
import { VERSION_UPDATE_I18N } from "../i18n/pt-BR";

/** Short pause so the message is visible and error reporting flushes before reload. */
const AUTO_RELOAD_DELAY_MS = 3000;

/**
 * Shown by the root error boundary when a lazy chunk failed to load (a newer
 * deploy removed it). Auto-reloads onto the new build after a short delay unless
 * the loop guard already fired for this build — in which case it offers a manual
 * button only (the reload did not fix it, so we don't loop).
 */
export function ChunkErrorScreen() {
  const i18n = VERSION_UPDATE_I18N.chunkError;
  const [autoReloading] = useState(() => canGuardedChunkReload());

  useEffect(() => {
    if (!autoReloading) return;
    const timer = setTimeout(() => commitGuardedChunkReload(), AUTO_RELOAD_DELAY_MS);
    return () => clearTimeout(timer);
  }, [autoReloading]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-info/10">
          <Icon icon="mdi:rocket-launch-outline" size={24} className="text-info" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{i18n.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{i18n.body}</p>
        <div className="mt-6">
          <button
            onClick={() => void hardReload()}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {i18n.accept}
          </button>
        </div>
        {autoReloading && (
          <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon icon="mdi:reload" size={14} className="animate-spin motion-reduce:hidden" />
            {i18n.autoReloading}
          </p>
        )}
      </div>
    </div>
  );
}
