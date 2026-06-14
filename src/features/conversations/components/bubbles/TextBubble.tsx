import type { IMessage } from "@/shared/types";
import { BubbleChrome } from "./bubbleChrome";
import { WhatsAppText } from "./WhatsAppText";

export function TextBubble({ message, onRetry }: { message: IMessage; onRetry?: () => void }) {
  return (
    <BubbleChrome message={message} onRetry={onRetry}>
      <WhatsAppText text={message.text || " "} className="whitespace-pre-wrap break-words" />
    </BubbleChrome>
  );
}
