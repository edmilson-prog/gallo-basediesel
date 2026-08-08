import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ID, IConversation, IMessage } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatRelativeTimeBR } from "@/shared/utils/format";
import { useMessagesProvider } from "@/providers/data/hooks/useMessagesProvider";
import { LEADS_STRINGS } from "../../i18n/pt-BR";

const COPY = LEADS_STRINGS.detail.conversation;

/** Enough to read what was asked without turning the card into an inbox. */
const PAGE_SIZE = 12;

export interface ILeadConversationCardProps {
  conversation: IConversation | null;
  isLoading: boolean;
  /** Reports the loaded messages up, so the timeline can summarise them. */
  onMessages?: (messages: IMessage[]) => void;
}

/**
 * The conversation, in the lead's own page.
 *
 * The old tab printed "WHATSAPP · em_andamento · há 3 h" — the metadata of the
 * relationship with none of its content. What the customer actually asked for
 * was the one thing the screen never showed, and it is the thing that decides
 * what to do next.
 *
 * Read-only by design: sending lives in the Atendimento, which owns the
 * 24h window, the templates, the instance routing and the realtime state. A
 * second composer here would be a second implementation of all of it.
 */
export function LeadConversationCard({
  conversation,
  isLoading,
  onMessages,
}: ILeadConversationCardProps) {
  const navigate = useNavigate();
  const messagesProvider = useMessagesProvider();

  const messagesQuery = useQuery({
    queryKey: ["lead-conversation-messages", conversation?.id] as const,
    enabled: Boolean(conversation?.id),
    staleTime: 30_000,
    queryFn: async () => {
      const page = await messagesProvider.list({
        conversationId: conversation!.id as ID,
        pageSize: PAGE_SIZE,
        orderDir: "desc",
      });
      // Newest-first off the wire so the page holds the LAST N, then reversed
      // for reading. Asking ascending would give the first twelve messages of a
      // year-old thread.
      const ordered = [...page.data].reverse();
      onMessages?.(ordered);
      return { messages: ordered, total: page.total };
    },
  });

  if (isLoading) {
    return (
      <section className="rounded-lg border border-border bg-card px-4 py-6 text-center text-xs text-muted-foreground">
        {COPY.loading}
      </section>
    );
  }

  if (!conversation) {
    return (
      <section className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
        {COPY.empty}
      </section>
    );
  }

  const messages = messagesQuery.data?.messages ?? [];
  const total = messagesQuery.data?.total ?? 0;
  const hidden = Math.max(0, total - messages.length);

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Icon icon="mdi:whatsapp" size={14} className="text-severity-success" aria-hidden />
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {COPY.title}
        </h2>
        <span className="text-[11px] text-muted-foreground">
          · {formatRelativeTimeBR(conversation.lastMessageAt)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 gap-1.5 text-xs"
          onClick={() =>
            void navigate({ to: "/app/atendimento/$id", params: { id: conversation.id } })
          }
        >
          <Icon icon="mdi:open-in-new" size={13} aria-hidden />
          {COPY.open}
        </Button>
      </header>

      <div className="flex max-h-72 flex-col gap-2 overflow-y-auto px-4 py-3">
        {hidden > 0 && (
          <p className="text-center text-[11px] text-muted-foreground">{COPY.more(hidden)}</p>
        )}
        {messagesQuery.isLoading ? (
          <p className="py-4 text-center text-xs text-muted-foreground">{COPY.loading}</p>
        ) : (
          messages.map((message) => <Bubble key={message.id} message={message} />)
        )}
      </div>

      <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        {COPY.replyHint}
      </p>
    </section>
  );
}

function Bubble({ message }: { message: IMessage }) {
  const outbound = message.direction === "out";
  // `text` is empty on media-only messages, which is most of what a parts
  // conversation carries — a blank bubble would read as a rendering failure.
  const body = message.text.trim() || (message.mediaUrl ? `[${COPY.media}]` : `[${COPY.system}]`);

  return (
    <div className={cn("flex flex-col gap-0.5", outbound ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[86%] text-pretty rounded-lg px-3 py-2 text-sm leading-snug",
          outbound
            ? "rounded-tr-sm bg-severity-success/15 text-foreground"
            : "rounded-tl-sm bg-muted text-foreground",
        )}
      >
        {body}
      </div>
      <span className="text-[10px] text-muted-foreground">
        {formatRelativeTimeBR(message.sentAt)}
      </span>
    </div>
  );
}
