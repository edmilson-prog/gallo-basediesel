import { useEffect, useRef } from "react";
import type { ID, IMessage } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { groupMessagesWithDaySeparators } from "@/features/conversations/utils/dayGroups";
import { resolveThreadStick } from "../../engine/threadAutoScroll";
import { PwaBubble } from "./PwaBubble";

/** Within this many pixels of the end the user counts as "at the bottom". */
const SCROLL_BOTTOM_THRESHOLD = 80;

interface IPwaMessageListProps {
  messages: IMessage[];
  isLoading: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadOlder: () => void;
  /** Channel + phone caption shown above the first day separator. */
  originLabel: string;
}

export function PwaMessageList({
  messages,
  isLoading,
  hasMore,
  isLoadingMore,
  onLoadOlder,
  originLabel,
}: IPwaMessageListProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const lastIdRef = useRef<ID | null>(null);
  const atBottomRef = useRef(true);
  const rows = groupMessagesWithDaySeparators(messages);

  // Stick to the bottom on the first loaded page and whenever a new message
  // lands while the user is already at the bottom. Tracking the LAST id (not
  // the row count) is what tells the growth direction apart: older pages grow
  // the thread at the top and never change it, so reaching for history never
  // throws the user back down (resolveThreadStick — same semantics as the
  // desktop MessageList).
  useEffect(() => {
    const last = messages[messages.length - 1];
    const decision = resolveThreadStick(lastIdRef.current, last?.id ?? null, atBottomRef.current);
    lastIdRef.current = decision.lastId;
    if (!decision.stick) return;
    requestAnimationFrame(() => {
      const scroller = scrollerRef.current;
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    });
  }, [messages]);

  return (
    <div
      ref={scrollerRef}
      className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 pb-4 pt-3"
      onScroll={(event) => {
        const target = event.currentTarget;
        const distance = target.scrollHeight - target.scrollTop - target.clientHeight;
        atBottomRef.current = distance <= SCROLL_BOTTOM_THRESHOLD;
      }}
    >
      <p className="mb-3 flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        <span className="h-px flex-1 bg-border" aria-hidden />
        {originLabel}
        <span className="h-px flex-1 bg-border" aria-hidden />
      </p>

      {isLoading && messages.length === 0 && (
        <p
          aria-busy="true"
          className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground"
        >
          <Icon icon="mdi:loading" size={16} className="animate-spin" />
          Carregando mensagens…
        </p>
      )}

      {hasMore && (
        <div className="flex justify-center pb-2">
          <button
            type="button"
            onClick={onLoadOlder}
            disabled={isLoadingMore}
            className="min-h-[44px] px-3 text-[12px] font-bold text-primary disabled:opacity-50"
          >
            {isLoadingMore ? "Carregando…" : "Ver mensagens anteriores"}
          </button>
        </div>
      )}

      {rows.map((row) =>
        row.kind === "day" ? (
          <div key={row.id} className="my-2 flex justify-center">
            <span className="rounded-sm bg-foreground/[0.05] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground ring-1 ring-inset ring-border">
              {row.label}
            </span>
          </div>
        ) : (
          <PwaBubble key={row.id} message={row.message} />
        ),
      )}
    </div>
  );
}
