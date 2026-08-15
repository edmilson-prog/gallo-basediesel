import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useIdleSummary } from "../hooks/useIdleSummary";
import { IdlePendingSheet } from "./IdlePendingSheet";

/**
 * Critical strip shown while level-3 idle conversations exist. Mounted
 * stacked inside `<AlertBannerStack>` (shared sticky anchor with the other
 * operational banners, after WhatsAppDisconnectedBanner and
 * OutsideHoursBanner) — a WhatsApp outage is the likely CAUSE of a critical
 * idle backlog, so it takes visual priority; this banner and the chip/
 * notifications keep nagging meanwhile.
 *
 * The X dismisses it for the current page session only: the state lives in
 * this component (kept mounted by AppLayout across SPA navigation) and is
 * deliberately NOT persisted — a reload brings the alert back, so a stale
 * backlog can never stay hidden for good. The chip and the notifications
 * keep signalling either way.
 */
export function IdleCriticalBanner() {
  const { summary } = useIdleSummary();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const critical = summary?.counts.level3 ?? 0;
  if (!summary || critical === 0 || dismissed) return null;
  return (
    <>
      <div
        className="flex items-center gap-3 border-b border-severity-critical/40 bg-severity-critical/10 px-4 py-2"
        role="alert"
      >
        <p className="min-w-0 flex-1 text-xs font-semibold text-severity-critical">
          <Icon icon="mdi:alert-octagon" size={14} className="mr-1.5 inline-block" aria-hidden />
          Você tem {critical} conversa{critical === 1 ? "" : "s"} aguardando resposta há vários
          dias
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 text-xs font-bold text-primary underline-offset-4 hover:underline"
        >
          Revisar agora →
        </button>
        <button
          type="button"
          aria-label="Fechar aviso"
          title="Fechar aviso (reaparece ao recarregar a página)"
          className="shrink-0 rounded p-1 text-severity-critical transition-colors hover:bg-severity-critical/15"
          onClick={() => {
            setOpen(false);
            setDismissed(true);
          }}
        >
          <Icon icon="mdi:close" size={14} aria-hidden />
        </button>
      </div>
      <IdlePendingSheet open={open} onOpenChange={setOpen} summary={summary} />
    </>
  );
}
