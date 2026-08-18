import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ILinkCounts } from "../../engine/importNote";
import { FISCAL_NOTES_STRINGS } from "../../i18n/pt-BR";

export type ImportItemState = "processing" | "done" | "failed";

export interface IImportQueueEntry {
  id: string;
  filename: string;
  state: ImportItemState;
  error?: string;
  noteNumber?: string;
  supplierName?: string;
  supplierCreated?: boolean;
  counts?: ILinkCounts;
}

export interface IImportQueueItemProps {
  entry: IImportQueueEntry;
}

const ICON: Record<ImportItemState, string> = {
  processing: "mdi:loading",
  done: "mdi:check",
  failed: "mdi:alert-circle-outline",
};

export function ImportQueueItem({ entry }: IImportQueueItemProps) {
  const s = FISCAL_NOTES_STRINGS.import;
  const counts = entry.counts;

  return (
    <div className="border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
            entry.state === "done" && "bg-severity-success/15 text-severity-success",
            entry.state === "failed" && "bg-severity-critical/15 text-severity-critical",
            entry.state === "processing" && "bg-muted text-muted-foreground",
          )}
        >
          <Icon
            icon={ICON[entry.state]}
            size={16}
            className={entry.state === "processing" ? "motion-safe:animate-spin" : undefined}
            aria-hidden
          />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs text-foreground">{entry.filename}</p>
          {entry.state === "failed" && entry.error && (
            <p className="mt-0.5 text-[11.5px] text-severity-critical">{entry.error}</p>
          )}
          {entry.state === "done" && entry.supplierName && (
            <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
              NF {entry.noteNumber} · {entry.supplierName}
            </p>
          )}
        </div>

        {entry.state === "done" && (
          <span className="shrink-0 text-[11px] text-muted-foreground">{s.reviewPendingPhase}</span>
        )}
      </div>

      {entry.state === "done" && counts && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-11">
          <Badge
            variant="outline"
            className={
              entry.supplierCreated
                ? "border-primary/40 text-primary"
                : "border-severity-success/40 text-severity-success"
            }
          >
            {entry.supplierCreated ? s.supplierCreated : s.supplierLinked}
          </Badge>
          {counts.auto > 0 && (
            <Badge variant="outline" className="border-severity-success/40 text-severity-success">
              {s.linkedByCode(counts.auto)}
            </Badge>
          )}
          {counts.ia > 0 && (
            <Badge variant="outline" className="border-severity-info/40 text-severity-info">
              {s.suggestedByAi(counts.ia)}
            </Badge>
          )}
          {counts.pend > 0 && (
            <Badge variant="outline" className="border-severity-warning/40 text-severity-warning">
              {s.pending(counts.pend)}
            </Badge>
          )}
        </div>
      )}

      {entry.state === "done" && entry.supplierCreated && (
        <p className="mt-2 pl-11 text-[11px] text-muted-foreground">{s.createdFromXmlHint}</p>
      )}
    </div>
  );
}
