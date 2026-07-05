import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useSellersProvider } from "@/providers/data";
import { useConversationNotes } from "../../hooks/useConversationNotes";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";
import { NoteComposer } from "./NoteComposer";

const S = CONVERSATION_STRINGS.conversationNotes;

interface IProps {
  conversationId: ID;
  storeId: ID;
  assignedSellerId?: ID;
  /** Origin instance — feeds the @mention auto-add instance gate. */
  whatsappAccountId?: ID | null;
  onClose: () => void;
}

/**
 * Unfolds above the message field when the notes icon is toggled. Writing here
 * creates an internal note (appears in the thread, never sent to the customer).
 * Amber "sticky-note" styling matches {@link NoteChatItem}.
 */
export function InlineNoteComposer({
  conversationId,
  storeId,
  assignedSellerId,
  whatsappAccountId,
  onClose,
}: IProps) {
  const notes = useConversationNotes(conversationId, storeId, assignedSellerId, whatsappAccountId);
  const sellersProvider = useSellersProvider();
  const { data: sellers = [] } = useQuery({
    queryKey: ["sellers", "mention", storeId],
    queryFn: () => sellersProvider.list({ storeId, active: true }),
    enabled: Boolean(storeId),
    staleTime: 5 * 60_000,
  });

  return (
    <div className="mx-3 mb-2 rounded-lg border border-severity-warning/40 bg-severity-warning/10 px-3 py-2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Icon icon="mdi:lock-outline" size={13} className="text-severity-warning" aria-hidden />
        <span className="text-xs font-semibold text-severity-warning">{S.composerTitle}</span>
        <span className="truncate text-[11px] text-muted-foreground">· {S.composerHint}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-6 w-6 shrink-0 p-0"
          aria-label={S.close}
          onClick={onClose}
        >
          <Icon icon="mdi:close" size={14} />
        </Button>
      </div>
      <NoteComposer
        sellers={sellers}
        submitLabel={S.submit}
        autoFocus
        busy={notes.isMutating}
        onSubmit={(content, mentions) => notes.createNote(content, mentions)}
      />
    </div>
  );
}
