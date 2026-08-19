import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  ID,
  ISeller,
  IConversationActivityEvent,
  ICustomerTimelineNote,
  ICustomerTimelineDeal,
} from "@/shared/types";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { useSellersProvider } from "@/providers/data";
import { STATUS_META, CHANNEL_META } from "@/features/conversations/utils/conversationDisplay";
import { CONVERSATION_STRINGS } from "@/features/conversations/i18n/pt-BR";
import { formatRelativeTime } from "@/features/conversations/utils/formatRelativeTime";
import { useCustomerTimeline } from "../hooks/useCustomerTimeline";
import {
  buildCustomerTimeline,
  type TimelineFilter,
  type ITimelineCard,
  type ITimelineCardItem,
} from "../engine/customerTimeline";
import { formatDuration } from "../utils/formatDuration";
import { actorLabel, describeEvent } from "../utils/eventDescription";
import { ATTENDANCE_HISTORY_STRINGS as S } from "../i18n/pt-BR";

export interface IAttendanceHistoryPanelProps {
  customerId: ID;
}

const FILTERS: { id: TimelineFilter; label: string }[] = [
  { id: "tudo", label: S.filters.all },
  { id: "conversa", label: S.filters.conversation },
  { id: "nota", label: S.filters.note },
  { id: "historico", label: S.filters.history },
];

/** A deal (quote/order) item is told apart from a lifecycle event by shape: it carries `total`, never `type`. */
function isDealSource(source: unknown): source is ICustomerTimelineDeal {
  return typeof source === "object" && source !== null && "total" in source;
}

/** A lifecycle event is told apart from a deal by shape: it carries `type`, never `total`. */
function isEventSource(source: unknown): source is IConversationActivityEvent {
  return typeof source === "object" && source !== null && "type" in source;
}

/**
 * Folded per-conversation attendance timeline (spec
 * 2026-08-18-historico-atendimento-camadas): a filter bar above a card per
 * conversation. Filtering narrows a card's contents but never removes the
 * card (rule 1); the aggregated-message item collapses every message in a
 * conversation into one row (rule 2); a `preRegistro` card always shows the
 * warning and folds only when it holds no event whatsoever (rule 3).
 */
export function AttendanceHistoryPanel({ customerId }: IAttendanceHistoryPanelProps) {
  const [filter, setFilter] = useState<TimelineFilter>("tudo");
  // Explicit user overrides of the open/closed state, keyed by conversation id.
  // Absent from the map means "use the default" (the most recent card starts open).
  const [openOverrides, setOpenOverrides] = useState<Map<ID, boolean>>(new Map());

  const { data, isLoading, isError } = useCustomerTimeline(customerId);
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

  const cards = useMemo(
    () => (data ? buildCustomerTimeline(data, filter) : []),
    [data, filter],
  );

  function toggle(conversationId: ID) {
    setOpenOverrides((prev) => {
      const next = new Map(prev);
      const current = next.has(conversationId)
        ? next.get(conversationId)!
        : cards.findIndex((c) => c.conversationId === conversationId) === 0;
      next.set(conversationId, !current);
      return next;
    });
  }

  function isOpen(conversationId: ID, index: number): boolean {
    return openOverrides.has(conversationId) ? openOverrides.get(conversationId)! : index === 0;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
      <div className="flex shrink-0 gap-1 px-1 pb-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
              filter === f.id
                ? "border-primary bg-primary text-primary-foreground font-medium"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {isLoading && <p className="p-2 text-sm text-muted-foreground">{S.loading}</p>}
        {isError && <p className="p-2 text-sm text-destructive">{S.error}</p>}
        {!isLoading && !isError && cards.length === 0 && (
          <p className="p-2 text-sm text-muted-foreground">{S.empty}</p>
        )}
        {cards.map((card, index) => (
          <TimelineCard
            key={card.conversationId}
            card={card}
            open={isOpen(card.conversationId, index)}
            onToggle={() => toggle(card.conversationId)}
            sellersById={sellersById}
          />
        ))}
      </div>
    </div>
  );
}

function TimelineCard({
  card,
  open,
  onToggle,
  sellersById,
}: {
  card: ITimelineCard;
  open: boolean;
  onToggle: () => void;
  sellersById: Map<ID, ISeller>;
}) {
  const channelMeta = CHANNEL_META[card.channel];
  // The trail (item rail) is hidden either while folded by the user or while
  // `collapsed` forces it shut (rule 3) — in both cases show the compact
  // count+duration summary instead, same information the old hybrid layout
  // gave on a folded card.
  const trailVisible = !card.collapsed && open;
  const duration = formatDuration(
    card.summary.durationMs ?? Date.now() - Date.parse(card.createdAt),
  );

  return (
    <div className="rounded-md border border-border bg-card" data-testid="attendance-history-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
      >
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Icon icon={channelMeta.icon} size={14} className="shrink-0 text-muted-foreground" />
          {formatRelativeTime(card.createdAt)}
        </span>
        <span className="flex-1" />
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[9px]",
            STATUS_META[card.status].pillClass,
          )}
        >
          {CONVERSATION_STRINGS.statusLabel[card.status]}
        </span>
        <Icon
          icon={open ? "mdi:chevron-up" : "mdi:chevron-down"}
          size={14}
          className="shrink-0 text-muted-foreground"
        />
      </button>

      {card.preRegistro && (
        <p className="px-2.5 pb-1.5 text-[10px] text-severity-warning">{S.preRegistroWarning}</p>
      )}

      {!trailVisible && (
        <p className="px-2.5 pb-2 text-[11px] text-muted-foreground">
          {S.cardSummary(card.summary.itemCount, duration)}
        </p>
      )}

      {trailVisible && (
        <div className="border-l border-border/60 px-2.5 pb-2.5 pl-4">
          {card.items.length === 0 ? (
            <p className="py-1 text-[11px] text-muted-foreground">{S.emptyFilter}</p>
          ) : (
            card.items.map((item) => (
              <TimelineItemRow key={item.id} item={item} sellersById={sellersById} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function TimelineItemRow({
  item,
  sellersById,
}: {
  item: ITimelineCardItem;
  sellersById: Map<ID, ISeller>;
}) {
  return (
    <div className="flex gap-2 py-1" data-testid="attendance-history-node">
      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
      <div className="text-[11px]">
        {item.kind === "conversa" && (
          <>
            <strong>{S.messageCount(item.messageCount ?? 0)}</strong>
            {item.preview ? (
              <span className="block text-muted-foreground">{item.preview}</span>
            ) : null}
          </>
        )}
        {item.kind === "nota" && <span>{(item.source as ICustomerTimelineNote).body}</span>}
        {item.kind === "historico" && isEventSource(item.source) && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "font-medium",
                actorLabel(item.source, sellersById).isSystem
                  ? "text-severity-success"
                  : "text-foreground",
              )}
            >
              {actorLabel(item.source, sellersById).label}
            </span>
            <span className="text-muted-foreground">{describeEvent(item.source, sellersById)}</span>
            {item.source.type === "reopen" && (
              <span className="rounded-full bg-severity-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-severity-warning">
                {S.reopenTag}
              </span>
            )}
          </div>
        )}
        {item.kind === "historico" && isDealSource(item.source) && (
          <span>{S.dealLabel(item.source.total)}</span>
        )}
        <span className="block text-[10px] text-muted-foreground">
          {formatRelativeTime(item.at)}
        </span>
      </div>
    </div>
  );
}
