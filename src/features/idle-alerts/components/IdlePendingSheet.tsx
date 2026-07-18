import { useNavigate } from "@tanstack/react-router";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { IIdleSummary, IIdleConversationEntry } from "@/shared/types";
import { groupByLevel } from "../engine/groupByLevel";
import { formatElapsed } from "../engine/idleLevel";
import { useTimeTick } from "@/features/conversations/hooks/useTimeTick";

interface IIdlePendingSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: IIdleSummary;
}

/** Sheet lateral "Minhas pendências" — mockup B aprovado no brainstorm. */
export function IdlePendingSheet({ open, onOpenChange, summary }: IIdlePendingSheetProps) {
  const navigate = useNavigate();
  const now = useTimeTick(60_000);
  const groups = groupByLevel(summary.entries);
  const openConversation = (entry: IIdleConversationEntry) => {
    onOpenChange(false);
    // Route confirmed at src/routes/app.atendimento.$id.tsx — param is `id`, not `conversationId`.
    void navigate({
      to: "/app/atendimento/$id",
      params: { id: entry.conversationId },
    });
  };
  const reviewInSequence = () => {
    const first = summary.entries[0];
    if (first) openConversation(first);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Icon icon="mdi:timer-sand" size={18} />
            Minhas pendências
          </SheetTitle>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <LevelStat label="críticas" count={summary.counts.level3} tone="critical" />
            <LevelStat label="em alerta" count={summary.counts.level2} tone="warning" />
            <LevelStat label="atenção" count={summary.counts.level1} tone="muted" />
          </div>
        </SheetHeader>
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {[
            { entries: groups.critical, tone: "critical" as const },
            { entries: groups.alert, tone: "warning" as const },
            { entries: groups.attention, tone: "muted" as const },
          ].map(({ entries, tone }) =>
            entries.map((entry) => (
              <EntryCard
                key={entry.conversationId}
                entry={entry}
                tone={tone}
                onOpen={openConversation}
                now={now}
              />
            )),
          )}
          {summary.entries.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">
              Nenhuma conversa aguardando sua resposta. 🎉
            </p>
          )}
        </div>
        <div className="border-t border-border p-3">
          <Button className="w-full" onClick={reviewInSequence} disabled={summary.entries.length === 0}>
            Revisar em sequência
            <Icon icon="mdi:arrow-right" size={16} className="ml-2" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function LevelStat({ label, count, tone }: { label: string; count: number; tone: "critical" | "warning" | "muted" }) {
  return (
    <div
      className={cn(
        "rounded-md border p-2 text-center",
        tone === "critical" && "border-severity-critical/40 bg-severity-critical/5",
        tone === "warning" && "border-severity-warning/40 bg-severity-warning/5",
        tone === "muted" && "border-border bg-muted/30",
      )}
    >
      <div
        className={cn(
          "text-lg font-bold tabular-nums",
          tone === "critical" && "text-severity-critical",
          tone === "warning" && "text-severity-warning",
          tone === "muted" && "text-foreground",
        )}
      >
        {count}
      </div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function EntryCard({
  entry,
  tone,
  onOpen,
  now,
}: {
  entry: IIdleConversationEntry;
  tone: "critical" | "warning" | "muted";
  onOpen: (entry: IIdleConversationEntry) => void;
  now: Date;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      className={cn(
        "w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent",
        tone === "critical" && "border-severity-critical/35",
        tone === "warning" && "border-severity-warning/30",
        tone === "muted" && "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-foreground">{entry.contactName}</span>
        <span
          className={cn(
            "shrink-0 text-xs font-bold",
            tone === "critical" && "text-severity-critical",
            tone === "warning" && "text-severity-warning",
            tone === "muted" && "text-muted-foreground",
          )}
        >
          espera há {formatElapsed(entry.awaitingReplySince, now)}
        </span>
      </div>
      {entry.lastInboundPreview && (
        <p className="mt-1 truncate text-xs text-muted-foreground">
          “{entry.lastInboundPreview}”
        </p>
      )}
    </button>
  );
}
