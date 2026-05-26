import type { IMessage } from "@/shared/types";
import { BubbleChrome } from "./bubbleChrome";

export function TextBubble({ message, onRetry }: { message: IMessage; onRetry?: () => void }) {
  return (
    <BubbleChrome message={message} onRetry={onRetry}>
      <p className="whitespace-pre-wrap break-words">{message.text || " "}</p>
    </BubbleChrome>
  );
}
