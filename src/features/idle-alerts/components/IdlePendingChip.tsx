import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIdleSummary } from "../hooks/useIdleSummary";
import { IdlePendingSheet } from "./IdlePendingSheet";

/** TopBar chip — total pending count, colored by the WORST level present. */
export function IdlePendingChip() {
  const { summary } = useIdleSummary();
  const [open, setOpen] = useState(false);
  const total = summary
    ? summary.counts.level1 + summary.counts.level2 + summary.counts.level3
    : 0;
  if (!summary || total === 0) return null;
  const worst = summary.counts.level3 > 0 ? 3 : summary.counts.level2 > 0 ? 2 : 1;
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`Minhas pendências: ${total} conversas aguardando resposta`}
        className={cn(
          "gap-1.5 border",
          worst === 3 && "border-severity-critical/50 bg-severity-critical/10 text-severity-critical",
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
