import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { hardReload, shouldReopenPrompt, useDeployWatcher } from "@/features/version-update";
import { PWA_ATENDIMENTO_STRINGS as S } from "../i18n/pt-BR";

/** How long "Agora não" keeps the band away before it asks again. */
const REOPEN_INTERVAL_MS = 15 * 60_000;
/** How often we check whether that window has elapsed. */
const REOPEN_TICK_MS = 30_000;

interface IPwaUpdateBarProps {
  /** Hidden while the heads-up band owns the same slot at the top. */
  hidden?: boolean;
}

/**
 * "New version available" band for the atendimento app.
 *
 * Same engine as the CRM's own prompt — one `/version.json`, one build id, one
 * reload path — with a skin that belongs to this app. It matters more here than
 * on the web: an installed PWA is a window the attendant may leave open for
 * days, so without a nudge it can sit on a build from last week.
 *
 * The signal is the whole SPA's build id, not a per-feature one, so any
 * production deploy raises it. That is on purpose: this app shares its bundle
 * with the rest of the CRM, and a fix in shared code (data providers, auth, the
 * WhatsApp layer) reaches the attendant just as much as a change under
 * `features/pwa-atendimento`. A narrower filter would stay quiet exactly when a
 * shared fix shipped.
 */
export function PwaUpdateBar({ hidden = false }: IPwaUpdateBarProps) {
  const { updateReady } = useDeployWatcher();
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!updateReady || dismissedAt === null) return;
    const id = setInterval(() => {
      if (shouldReopenPrompt(dismissedAt, Date.now(), REOPEN_INTERVAL_MS)) setDismissedAt(null);
    }, REOPEN_TICK_MS);
    return () => clearInterval(id);
  }, [updateReady, dismissedAt]);

  if (!updateReady || hidden || dismissedAt !== null) return null;

  return (
    // Mesma correção da faixa de mensagem: `top-2` cru cai por cima do relógio
    // e da bateria do iPhone. Esta segue escura de propósito — assim as duas
    // faixas que dividem o slot do topo não se confundem uma com a outra.
    <div
      role="status"
      className="absolute inset-x-2 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[68] overflow-hidden rounded-lg bg-card shadow-lg ring-1 ring-inset ring-primary/40"
    >
      <div className="flex gap-3 px-3 pb-2.5 pt-3">
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md bg-primary/15">
          <Icon icon="mdi:cellphone-arrow-down" size={18} className="text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-primary">
            {S.update.eyebrow}
          </p>
          <p className="mt-1 text-sm font-extrabold text-foreground">{S.update.title}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{S.update.body}</p>
        </div>
      </div>
      <div className="flex border-t border-border">
        <button
          type="button"
          disabled={updating}
          onClick={() => {
            // The reload replaces the document, so this state only ever shows
            // during the cache purge that precedes it.
            setUpdating(true);
            void hardReload();
          }}
          className="min-h-[44px] flex-1 text-[13px] font-bold text-primary disabled:opacity-60"
        >
          {updating ? S.update.updating : S.update.accept}
        </button>
        <span className="w-px bg-border" aria-hidden />
        <button
          type="button"
          onClick={() => setDismissedAt(Date.now())}
          className="min-h-[44px] flex-1 text-[13px] font-bold text-muted-foreground"
        >
          {S.update.later}
        </button>
      </div>
    </div>
  );
}
