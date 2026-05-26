import { useEffect, useMemo, useRef, useState } from "react";
import type { IConversation, IMessage } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { groupMessagesWithDaySeparators } from "../utils/dayGroups";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";
import { MessageBubble } from "./bubbles/MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { useTypingSimulation } from "../hooks/useTypingSimulation";
import { useConversationContext } from "../hooks/ConversationContext";

export interface IMessageListProps {
  conversation: IConversation;
}

const SCROLL_BOTTOM_THRESHOLD = 80;

export function MessageList({ conversation }: IMessageListProps) {
  const { messages: msg } = useConversationContext();
  const { messages, isLoading, hasMore, loadMore, isLoadingMore, retry } = msg;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const lastIdRef = useRef<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const typing = useTypingSimulation(conversation);

  const rows = useMemo(() => groupMessagesWithDaySeparators(messages), [messages]);

  // Scroll-to-bottom on first load and whenever a new message arrives
  // while the user is already pinned at the bottom.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;
    if (lastIdRef.current === last.id) return;
    const wasAtBottom = lastIdRef.current === null ? true : isAtBottom;
    lastIdRef.current = last.id;
    if (wasAtBottom) {
      requestAnimationFrame(() => {
        const node = containerRef.current;
        if (node) node.scrollTop = node.scrollHeight;
      });
    }
  }, [messages, isAtBottom]);

  // Scroll-up sentinel to fetch older messages.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isLoadingMore) {
          const prevHeight = container.scrollHeight;
          loadMore().then(() => {
            requestAnimationFrame(() => {
              const delta = container.scrollHeight - prevHeight;
              if (delta > 0) container.scrollTop = delta;
            });
          });
        }
      },
      { root: container, rootMargin: "80px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadMore]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const distance = target.scrollHeight - target.scrollTop - target.clientHeight;
    setIsAtBottom(distance <= SCROLL_BOTTOM_THRESHOLD);
  };

  const handleRetry = (message: IMessage) => {
    void retry(message);
  };

  if (isLoading && messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        <Icon icon="mdi:loading" className="mr-2 animate-spin" size={14} />
        {CONVERSATION_STRINGS.loading}
      </div>
    );
  }

  if (!isLoading && messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon icon="mdi:message-text-outline" size={22} />
        </div>
        <p className="text-sm font-medium text-foreground">
          {CONVERSATION_STRINGS.newConversation.title}
        </p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {CONVERSATION_STRINGS.newConversation.description}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex h-full flex-col gap-1 overflow-y-auto px-4 py-4"
      role="log"
      aria-live="polite"
      aria-label="Histórico de mensagens"
    >
      <div ref={sentinelRef} aria-hidden="true" />
      {isLoadingMore && (
        <div className="flex items-center justify-center py-2 text-[11px] text-muted-foreground">
          <Icon icon="mdi:loading" className="mr-1.5 animate-spin" size={12} />
          {CONVERSATION_STRINGS.loading}
        </div>
      )}
      {rows.map((row) => {
        if (row.kind === "day") {
          return (
            <div key={row.id} className="my-2 flex items-center justify-center">
              <span className="rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground">
                {row.label}
              </span>
            </div>
          );
        }
        return (
          <MessageBubble
            key={row.id}
            message={row.message}
            onRetry={() => handleRetry(row.message)}
          />
        );
      })}
      {typing && <TypingIndicator />}
      <div aria-hidden="true" />
    </div>
  );
}
