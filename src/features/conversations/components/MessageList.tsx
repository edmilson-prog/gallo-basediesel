import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { IConversation, IMessage, IWhatsAppAccount } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { getActiveDataSource, useSellersProvider } from "@/providers/data";
import { buildThreadRows } from "../utils/dayGroups";
import { useConversationNotes } from "../hooks/useConversationNotes";
import {
  filterNotes,
  DEFAULT_NOTES_CONSULT,
  type NotesConsultMode,
} from "../engine/notesConsult";
import { NoteChatItem } from "./notes/NoteChatItem";
import { NotesConsultBar } from "./notes/NotesConsultBar";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";
import { MessageBubble } from "./bubbles/MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { useTypingSimulation } from "../hooks/useTypingSimulation";
import { useConversationContext } from "../hooks/ConversationContext";
import { SEND_ERROR_MESSAGES, useMessageSend } from "../hooks/useMessageSend";
import { useSeedSignedMediaUrls } from "../hooks/useSeedSignedMediaUrls";

export interface IMessageListProps {
  conversation: IConversation;
  whatsappAccount?: IWhatsAppAccount | null;
}

const SCROLL_BOTTOM_THRESHOLD = 80;

export function MessageList({ conversation, whatsappAccount = null }: IMessageListProps) {
  const { messages: msg } = useConversationContext();
  const { messages, isLoading, hasMore, loadMore, isLoadingMore, retry, isPlaceholder } = msg;
  // Batch-sign all media of the loaded thread in one request and seed the
  // per-bubble cache, so images/audio/docs render without N separate signs.
  useSeedSignedMediaUrls(messages.map((m) => m.mediaUrl));
  const sendHook = useMessageSend(conversation, whatsappAccount);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const lastIdRef = useRef<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const typing = useTypingSimulation(conversation);
  const notesState = useConversationNotes(conversation.id, conversation.storeId);
  const sellersProvider = useSellersProvider();
  const { data: sellers = [] } = useQuery({
    queryKey: ["sellers", "mention", conversation.storeId],
    queryFn: () => sellersProvider.list({ storeId: conversation.storeId, active: true }),
    staleTime: 5 * 60_000,
  });

  // --- Notes consult bar (3 switchable modes: index / only / highlight) ---
  const [consultOpen, setConsultOpen] = useState(false);
  const [consultMode, setConsultMode] = useState<NotesConsultMode>("index");
  const [consultState, setConsultState] = useState(DEFAULT_NOTES_CONSULT);
  const [flashNoteId, setFlashNoteId] = useState<string | null>(null);
  const [highlightCursor, setHighlightCursor] = useState(0);

  const matched = useMemo(
    () => filterNotes(notesState.notes, consultState, notesState.currentSellerId),
    [notesState.notes, consultState, notesState.currentSellerId],
  );
  const matchedIds = useMemo(() => new Set(matched.map((n) => n.id)), [matched]);
  const isFiltering = consultState.query.trim() !== "" || consultState.scope !== "all";

  const rows = useMemo(() => {
    if (consultOpen && consultMode === "only") return buildThreadRows([], matched);
    return buildThreadRows(messages, notesState.notes);
  }, [consultOpen, consultMode, matched, messages, notesState.notes]);

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

  // A freshly created note lands at the bottom (newest); keep it in view when
  // the user is already pinned to the bottom — mirrors the message behavior.
  const noteCount = notesState.notes.length;
  useEffect(() => {
    if (!isAtBottom) return;
    requestAnimationFrame(() => {
      const node = containerRef.current;
      if (node) node.scrollTop = node.scrollHeight;
    });
  }, [noteCount, isAtBottom]);

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

  // Scroll a note into view (index jump / highlight nav) and flash it briefly.
  const jumpToNote = useCallback((noteId: string) => {
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-note-id="${noteId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashNoteId(noteId);
  }, []);

  useEffect(() => {
    if (!flashNoteId) return;
    const t = setTimeout(() => setFlashNoteId(null), 1600);
    return () => clearTimeout(t);
  }, [flashNoteId]);

  const goToMatch = useCallback(
    (index: number) => {
      if (matched.length === 0) return;
      const next = ((index % matched.length) + matched.length) % matched.length;
      const target = matched[next];
      if (!target) return;
      setHighlightCursor(next);
      jumpToNote(target.id);
    },
    [matched, jumpToNote],
  );

  const handleRetry = (message: IMessage) => {
    // PRD-118 RF-040 (supabase): retry = NEW message through the real send
    // pipeline; the failed bubble stays for audit. Mock keeps the Fase-1
    // status dance on the same message.
    if (getActiveDataSource() === "supabase") {
      void sendHook
        .send({
          text: message.text,
          mediaType: message.mediaType,
          mediaUrl: message.mediaUrl,
          retryOfMessageId: message.id,
        })
        .catch((err: unknown) => {
          // The hook already toasts per code; the silent codes get a manual one
          // here (no template picker / staff dialog exists in the list context).
          const code = err instanceof Error ? err.message : "";
          const friendly = SEND_ERROR_MESSAGES[code];
          if (friendly) toast.error(friendly);
        });
      return;
    }
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

  if (!isLoading && messages.length === 0 && notesState.notes.length === 0) {
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
    <div data-tour="message-list" className="flex h-full flex-col">
      {notesState.notes.length > 0 && (
        <NotesConsultBar
          total={notesState.notes.length}
          matched={matched}
          sellers={sellers}
          open={consultOpen}
          onOpenChange={setConsultOpen}
          mode={consultMode}
          onModeChange={setConsultMode}
          query={consultState.query}
          onQueryChange={(query) => {
            setConsultState((s) => ({ ...s, query }));
            setHighlightCursor(0);
          }}
          scope={consultState.scope}
          onScopeChange={(scope) => {
            setConsultState((s) => ({ ...s, scope }));
            setHighlightCursor(0);
          }}
          cursor={highlightCursor}
          onPrev={() => goToMatch(highlightCursor - 1)}
          onNext={() => goToMatch(highlightCursor + 1)}
          onJump={jumpToNote}
        />
      )}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={cn(
          "flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-4 transition-opacity",
          // While the previous conversation's cache is shown during a switch,
          // dim it so it doesn't read as the current thread (keepPreviousData).
          isPlaceholder && "pointer-events-none opacity-50",
        )}
        role="log"
        aria-live="polite"
        aria-label="Histórico de mensagens"
        aria-busy={isPlaceholder}
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
          if (row.kind === "note") {
            return (
              <NoteChatItem
                key={row.id}
                note={row.note}
                sellers={sellers}
                currentSellerId={notesState.currentSellerId}
                isStaff={notesState.isStaff}
                busy={notesState.isMutating}
                flash={flashNoteId === row.note.id}
                matched={consultMode === "highlight" && isFiltering && matchedIds.has(row.note.id)}
                onUpdate={notesState.updateNote}
                onRemove={notesState.removeNote}
              />
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
    </div>
  );
}
