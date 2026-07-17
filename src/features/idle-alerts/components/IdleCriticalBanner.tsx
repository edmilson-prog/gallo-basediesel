import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useIdleSummary } from "../hooks/useIdleSummary";
import { IdlePendingSheet } from "./IdlePendingSheet";

/** Fixed critical strip under the TopBar while level-3 conversations exist. */
export function IdleCriticalBanner() {
  const { summary } = useIdleSummary();
  const [open, setOpen] = useState(false);
  const critical = summary?.counts.level3 ?? 0;
  if (!summary || critical === 0) return null;
  return (
    <>
      <div className="sticky top-16 z-20 flex items-center justify-between gap-3 border-b border-severity-critical/40 bg-severity-critical/10 px-4 py-2">
        <p className="text-xs font-semibold text-severity-critical">
          <Icon icon="mdi:alert-octagon" size={14} className="mr-1.5 inline-block" />
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
      </div>
      <IdlePendingSheet open={open} onOpenChange={setOpen} summary={summary} />
    </>
  );
}
