import type { IMessage } from "@/shared/types";
import { BubbleChrome, type IBubbleProps } from "./bubbleChrome";
import { WhatsAppText } from "./WhatsAppText";

export function TextBubble({ message, onRetry, ...extras }: IBubbleProps) {
  return (
    <BubbleChrome message={message} onRetry={onRetry} {...extras}>
      <WhatsAppText text={message.text || " "} className="whitespace-pre-wrap break-words" />
    </BubbleChrome>
  );
}
