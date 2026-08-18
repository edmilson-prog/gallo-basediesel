import type { IMessage } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { BubbleChrome, type IBubbleProps } from "./bubbleChrome";

/**
 * Placeholder for a message that reached us with no readable content — see
 * `isContentFreeMessage` for what produces these (WhatsApp protocol noise
 * persisted by older webhook builds).
 *
 * Deliberately keeps the full chrome (side, time, status) rather than hiding
 * the row: something WAS exchanged at that moment, and silently dropping it
 * would leave an unexplained gap in the thread. Follows the same visual
 * language as the "<media> indisponível" states.
 */
export function UnsupportedBubble({ message, onRetry, ...extras }: IBubbleProps) {
  return (
    <BubbleChrome message={message} onRetry={onRetry} {...extras}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon icon="mdi:message-off-outline" size={16} />
        <span className="text-xs italic">Mensagem não suportada</span>
      </div>
    </BubbleChrome>
  );
}
