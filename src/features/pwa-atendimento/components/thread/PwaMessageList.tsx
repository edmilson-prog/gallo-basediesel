import { useEffect, useRef } from "react";
import type { IMessage } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { groupMessagesWithDaySeparators } from "@/features/conversations/utils/dayGroups";
import { PwaBubble } from "./PwaBubble";

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
  const lastCountRef = useRef(0);
  const rows = groupMessagesWithDaySeparators(messages);

  // Stick to the bottom when the thread grows at the end (new message or first
  // paint). Loading OLDER pages grows it at the top, so the count jumps by more
  // than a couple of rows — in that case leave the scroll position alone or the
  // user is thrown back to the bottom every time they reach for history.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const grewAtEnd = messages.length - lastCountRef.current <= 3;
    lastCountRef.current = messages.length;
    if (grewAtEnd) scroller.scrollTop = scroller.scrollHeight;
  }, [messages.length]);

  return (
    <div
      ref={scrollerRef}
      className="min-h-0 flex-1 overflow-auto overscroll-contain px-3 pb-4 pt-3"
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
