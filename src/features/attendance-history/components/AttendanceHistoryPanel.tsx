import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useSellersProvider } from "@/providers/data";
import { STATUS_META, CHANNEL_META } from "@/features/conversations/utils/conversationDisplay";
import { CONVERSATION_STRINGS } from "@/features/conversations/i18n/pt-BR";
import { formatRelativeTime } from "@/features/conversations/utils/formatRelativeTime";
import { useCustomerActivity } from "../hooks/useCustomerActivity";
import {
  buildAttendanceTimeline,
  type IConversationTimeline,
  type ITimelineNode,
} from "../engine/attendanceTimeline";
import { formatDuration } from "../utils/formatDuration";
import { actorLabel, describeEvent, sellerName } from "../utils/eventDescription";
import { ATTENDANCE_HISTORY_STRINGS as S } from "../i18n/pt-BR";

export interface IAttendanceHistoryPanelProps {
  customerId: ID;
  /** When provided, the panel renders as a toggleable side sheet (conversation
   *  rail). When omitted, it renders inline as plain content (customer fiche
   *  "Histórico" tab — mirrors the "Mídias" tab pattern). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Per-conversation attendance history, hybrid layout (spec
 * 2026-07-03-attendance-close-and-history): a collapsible card per
 * conversation (most-recent expanded), a connected rail of transitions
 * inside, and a one-line collapsed summary.
 */
export function AttendanceHistoryPanel({
  customerId,
  open,
  onOpenChange,
}: IAttendanceHistoryPanelProps) {
  const { data, isLoading, isError } = useCustomerActivity(customerId);
  const sellersProvider = useSellersProvider();
  const sellersQuery = useQuery({
    queryKey: ["attendance-history-sellers"],
    queryFn: () => sellersProvider.list(),
    staleTime: 60_000,
  });

  const sellersById = useMemo(() => {
    const map = new Map<ID, ISeller>();
    for (const seller of sellersQuery.data ?? []) map.set(seller.id, seller);
    return map;
  }, [sellersQuery.data]);

  const timelines = useMemo(() => buildAttendanceTimeline(data ?? []), [data]);

  const body = (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
      {isLoading && <p className="p-2 text-sm text-muted-foreground">{S.loading}</p>}
      {isError && <p className="p-2 text-sm text-destructive">{S.error}</p>}
      {!isLoading && !isError && timelines.length === 0 && (
        <p className="p-2 text-sm text-muted-foreground">{S.empty}</p>
      )}
      {timelines.map((timeline, index) => (
        <ConversationTimelineCard
          key={timeline.conversationId}
          timeline={timeline}
          sellersById={sellersById}
          defaultOpen={index === 0}
        />
      ))}
    </div>
  );

  if (onOpenChange) {
    return (
      <Sheet open={open ?? false} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="text-sm font-semibold">{S.panelTitle}</SheetTitle>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return body;
}

function ConversationTimelineCard({
  timeline,
  sellersById,
  defaultOpen,
}: {
  timeline: IConversationTimeline;
  sellersById: Map<ID, ISeller>;
  defaultOpen: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const statusMeta = STATUS_META[timeline.currentStatus];
  const channelMeta = CHANNEL_META[timeline.channel];
  const isTerminal =
    timeline.currentStatus === "resolvida" || timeline.currentStatus === "arquivada";
  const ownerName = timeline.summary.finalSellerId
    ? sellerName(timeline.summary.finalSellerId, sellersById)
    : null;
  const duration = formatDuration(timeline.summary.totalDurationMs);
  const summaryLine = ownerName
    ? S.summaryWithOwner(timeline.summary.eventCount, duration, ownerName)
    : isTerminal
      ? S.summaryClosedNoOwner(timeline.summary.eventCount, duration)
      : S.summaryNoOwner(timeline.summary.eventCount, duration);

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="rounded-lg border border-border bg-card"
      data-testid="attendance-history-card"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Icon icon={channelMeta.icon} size={16} className="shrink-0 text-muted-foreground" />
            {formatRelativeTime(timeline.createdAt)}
          </span>
          <span className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusMeta.pillClass}`}
            >
              {CONVERSATION_STRINGS.statusLabel[timeline.currentStatus]}
            </span>
            <Icon icon={isOpen ? "mdi:chevron-up" : "mdi:chevron-down"} size={16} />
          </span>
        </button>
      </CollapsibleTrigger>
      {!isOpen && <p className="px-3 pb-2 text-xs text-muted-foreground">{summaryLine}</p>}
      <CollapsibleContent>
        <div className="flex flex-col px-3 pb-3">
          {timeline.nodes.map((node, index) => (
            <TimelineNodeRow
              key={node.event.id}
              node={node}
              isLast={index === timeline.nodes.length - 1}
              sellersById={sellersById}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function TimelineNodeRow({
  node,
  isLast,
  sellersById,
}: {
  node: ITimelineNode;
  isLast: boolean;
  sellersById: Map<ID, ISeller>;
}) {
  const { event } = node;
  const actor = actorLabel(event, sellersById);
  const statusMeta = event.toStatus ? STATUS_META[event.toStatus] : null;

  return (
    <div className="relative flex gap-3" data-testid="attendance-history-node">
      <div className="flex flex-col items-center">
        <span
          className={`mt-1 h-2.5 w-2.5 rounded-full ${statusMeta?.dotClass ?? "bg-muted-foreground/40"}`}
        />
        {!isLast && <span className="w-px flex-1 bg-border" />}
      </div>
      <div className="flex-1 pb-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span
            className={
              actor.isSystem ? "font-medium text-severity-success" : "font-medium text-foreground"
            }
          >
            {actor.label}
          </span>
          <span className="text-muted-foreground">{describeEvent(event, sellersById)}</span>
          {event.type === "reopen" && (
            <span className="rounded-full bg-severity-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-severity-warning">
              {S.reopenTag}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{formatRelativeTime(event.createdAt)}</span>
          {node.durationMs != null && (
            <>
              <span aria-hidden>·</span>
              <span>{formatDuration(node.durationMs)}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
