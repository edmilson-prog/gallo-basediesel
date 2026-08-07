import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { formatWaitLabel } from "../engine/formatters";
import type { ISellerQueueEntry } from "../hooks/useSellerQueue";
import { SELLER_DASHBOARD_STRINGS as S } from "../i18n/pt-BR";

interface ISellerQueueCardProps {
  entries: ISellerQueueEntry[];
  total: number;
  isLoading: boolean;
  hasError: boolean;
  now?: Date;
}

export function SellerQueueCard({
  entries,
  total,
  isLoading,
  hasError,
  now = new Date(),
}: ISellerQueueCardProps) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon icon="mdi:format-list-checks" size={16} className="text-muted-foreground" />
          {S.queueTitle}
        </div>
        {!hasError && (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
            {total} {S.queueWaiting}
          </span>
        )}
      </div>
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : hasError ? (
        // Never claim "nobody is waiting" when the fetch failed — that reads as
        // an affirmative all-clear to a seller who may have a real backlog.
        <p className="py-4 text-center text-sm text-severity-critical">{S.queueError}</p>
      ) : entries.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{S.queueEmpty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => (
            <Link
              key={entry.conversationId}
              to="/app/atendimento/$id"
              params={{ id: entry.conversationId }}
              className="flex items-center gap-3 rounded-md border border-border bg-muted/20 px-3 py-2 hover:bg-muted/40"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{entry.contactName}</p>
                <p className="text-xs text-muted-foreground">
                  {S.queueWaitingSince} {formatWaitLabel(entry.waitingSince, now)}
                </p>
              </div>
              <Icon icon="mdi:arrow-right" size={16} className="text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
      <Link
        to="/app/atendimento"
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        <Icon icon="mdi:forum-outline" size={15} />
        {S.queueCta}
      </Link>
    </Card>
  );
}
