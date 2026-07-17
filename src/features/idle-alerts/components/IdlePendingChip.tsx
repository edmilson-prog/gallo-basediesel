import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIdleSummary } from "../hooks/useIdleSummary";
import { IdlePendingSheet } from "./IdlePendingSheet";
import { totalPending, worstLevel } from "../engine/summaryStats";

/** TopBar chip — total pending count, colored by the WORST level present. */
export function IdlePendingChip() {
  const { summary } = useIdleSummary();
  const [open, setOpen] = useState(false);
  const total = summary ? totalPending(summary.counts) : 0;
  if (!summary || total === 0) return null;
  const worst = worstLevel(summary.counts);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`Minhas pendências: ${total} conversa${total === 1 ? "" : "s"} aguardando resposta`}
        className={cn(
          "gap-1.5 border",
          worst === 3 &&
            "border-severity-critical/50 bg-severity-critical/10 text-severity-critical",
          worst === 2 && "border-severity-warning/50 bg-severity-warning/10 text-severity-warning",
          worst === 1 && "border-border bg-muted/40 text-muted-foreground",
        )}
      >
        <Icon icon="mdi:timer-sand" size={16} />
        <span className="text-xs font-bold tabular-nums">{total}</span>
      </Button>
      <IdlePendingSheet open={open} onOpenChange={setOpen} summary={summary} />
    </>
  );
}
