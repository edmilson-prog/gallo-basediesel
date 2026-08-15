import { toast } from "sonner";
import type { IMessage } from "@/shared/types";
import { Icon } from "@/components/Icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";
import { canReplyTo } from "../../engine/replyRef";

export interface IBubbleActionsMenuProps {
  message: IMessage;
  /** Ausente quando a tela não oferece resposta (nenhum ReplyDraftProvider). */
  onReply?: () => void;
}

/**
 * Chevron discreto no canto da bolha, revelado no hover/foco.
 *
 * Fica no canto superior, fora da área de conteúdo, para não competir com o
 * clique da mídia (lightbox, play de áudio). Some por completo quando não há
 * nenhuma ação disponível — um menu vazio é pior que menu nenhum.
 */
export function BubbleActionsMenu({ message, onReply }: IBubbleActionsMenuProps) {
  const showReply = Boolean(onReply) && canReplyTo(message);
  const text = message.text.trim();
  const showCopy = text.length > 0;
  if (!showReply && !showCopy) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(CONVERSATION_STRINGS.reply.copied);
    } catch {
      toast.error(CONVERSATION_STRINGS.actionFailed);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={CONVERSATION_STRINGS.reply.bubbleActions}
        className="absolute right-1 top-1 z-10 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted focus-visible:opacity-100 group-hover/bubble:opacity-100 data-[state=open]:opacity-100"
      >
        <Icon icon="mdi:chevron-down" size={14} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {showReply && (
          <DropdownMenuItem onSelect={onReply}>
            <Icon icon="mdi:reply" size={14} className="mr-2" />
            {CONVERSATION_STRINGS.reply.action}
          </DropdownMenuItem>
        )}
        {showCopy && (
          <DropdownMenuItem onSelect={() => void copy()}>
            <Icon icon="mdi:content-copy" size={14} className="mr-2" />
            {CONVERSATION_STRINGS.reply.copyText}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
