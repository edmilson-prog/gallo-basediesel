import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useDeployWatcher } from "../hooks/useDeployWatcher";
import { hardReload } from "../lib/hardReload";
import { shouldReopenPrompt } from "../engine/deployGate";
import { VERSION_UPDATE_I18N } from "../i18n/pt-BR";

/** How long the card stays minimized before it reopens itself. */
const REOPEN_INTERVAL_MS = 15 * 60_000;
/** How often we check whether the snooze window has elapsed. */
const REOPEN_TICK_MS = 30_000;

/**
 * Floating "new version available" prompt. Renders nothing until the deploy
 * watcher flags an update. Dismissible: "Agora não" minimizes it to a persistent
 * badge (never disappears) and the card reopens itself after REOPEN_INTERVAL_MS.
 * "Atualizar agora" hard-reloads onto the new build.
 */
export function VersionUpdatePrompt() {
  const { updateReady } = useDeployWatcher();
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const i18n = VERSION_UPDATE_I18N.prompt;

  useEffect(() => {
    if (!updateReady || dismissedAt === null) return;
    const id = setInterval(() => {
      if (shouldReopenPrompt(dismissedAt, Date.now(), REOPEN_INTERVAL_MS)) {
        setDismissedAt(null);
      }
    }, REOPEN_TICK_MS);
    return () => clearInterval(id);
  }, [updateReady, dismissedAt]);

  if (!updateReady) return null;

  if (dismissedAt !== null) {
    return (
      <button
        type="button"
        onClick={() => setDismissedAt(null)}
        aria-label={i18n.badgeAria}
        className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-lg outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="relative flex h-2.5 w-2.5" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-info/60 motion-reduce:hidden" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-info" />
        </span>
        {i18n.badgeLabel}
      </button>
    );
  }

  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-50 w-[320px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-4 shadow-xl"
    >
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-info/10">
          <Icon icon="mdi:rocket-launch-outline" size={20} className="text-info" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{i18n.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{i18n.body}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" className="flex-1" onClick={() => void hardReload()}>
          {i18n.accept}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setDismissedAt(Date.now())}>
          {i18n.dismiss}
        </Button>
      </div>
    </div>
  );
}
