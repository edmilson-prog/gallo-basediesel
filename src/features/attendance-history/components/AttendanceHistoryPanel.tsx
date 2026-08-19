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
import { useSellersProvider } from "@/providers/data";
import { STATUS_META } from "@/features/conversations/utils/conversationDisplay";
import { CONVERSATION_STRINGS } from "@/features/conversations/i18n/pt-BR";
import { formatRelativeTime } from "@/features/conversations/utils/formatRelativeTime";
import { useCustomerTimeline } from "../hooks/useCustomerTimeline";
import {
  buildCustomerTimeline,
  type TimelineFilter,
  type ITimelineCard,
  type ITimelineCardItem,
} from "../engine/customerTimeline";
import { describeEvent } from "../utils/eventDescription";
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

/**
 * Label for one folded-timeline item. Notes render their own body; lifecycle
 * events reuse `describeEvent` (the single source of truth for event
 * labels — it already accounts for `status` events that also carry a
 * `toSellerId`); deals render their monetary value.
 */
function describeItem(item: ITimelineCardItem, sellersById: Map<ID, ISeller>): string {
  if (item.kind === "nota") {
    return (item.source as ICustomerTimelineNote).body;
  }
  if (isDealSource(item.source)) {
    return S.dealLabel(item.source.total);
  }
  return describeEvent(item.source as IConversationActivityEvent, sellersById);
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
  return (
    <div className="rounded-md border border-border bg-card" data-testid="attendance-history-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
      >
        <span className="text-sm font-medium">{formatRelativeTime(card.createdAt)}</span>
        <span className="flex-1" />
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[9px]",
            STATUS_META[card.status].pillClass,
          )}
        >
          {CONVERSATION_STRINGS.statusLabel[card.status]}
        </span>
      </button>

      {card.preRegistro && (
        <p className="px-2.5 pb-1.5 text-[10px] text-severity-warning">{S.preRegistroWarning}</p>
      )}

      {!card.collapsed && open && (
        <div className="border-l border-border/60 px-2.5 pb-2.5 pl-4">
          {card.items.length === 0 ? (
            <p className="py-1 text-[11px] text-muted-foreground">{S.emptyFilter}</p>
          ) : (
            card.items.map((item) => (
              <div key={item.id} className="flex gap-2 py-1" data-testid="attendance-history-node">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                <div className="text-[11px]">
                  {item.kind === "conversa" ? (
                    <>
                      <strong>{S.messageCount(item.messageCount ?? 0)}</strong>
                      {item.preview ? (
                        <span className="block text-muted-foreground">{item.preview}</span>
                      ) : null}
                    </>
                  ) : (
                    <span>{describeItem(item, sellersById)}</span>
                  )}
                  <span className="block text-[10px] text-muted-foreground">
                    {formatRelativeTime(item.at)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
