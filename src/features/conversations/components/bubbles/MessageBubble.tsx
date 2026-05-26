import type { IMessage } from "@/shared/types";
import { TextBubble } from "./TextBubble";
import { ImageBubble } from "./ImageBubble";
import { AudioBubble } from "./AudioBubble";
import { DocumentBubble } from "./DocumentBubble";
import { SystemBubble } from "./SystemBubble";
import { TemplateBubble } from "./TemplateBubble";

export interface IMessageBubbleProps {
  message: IMessage;
  onRetry?: () => void;
}

const TEMPLATE_PREFIX = "[template]";

/**
 * Discriminates the right bubble component for a message based on
 * `authorType` (system) and `mediaType` (image / audio / document).
 * Plain text always falls through to `<TextBubble>` so templates and
 * normal outbound text don't diverge in look-and-feel.
 */
export function MessageBubble({ message, onRetry }: IMessageBubbleProps) {
  if (message.authorType === "system") {
    return <SystemBubble message={message} />;
  }
  if (
    message.text.startsWith(TEMPLATE_PREFIX) ||
    (message.provider === "meta" &&
      message.mediaType === undefined &&
      message.text.startsWith("📋 "))
  ) {
    return <TemplateBubble message={message} onRetry={onRetry} />;
  }
  if (message.mediaType === "image" || message.mediaType === "sticker") {
    return <ImageBubble message={message} onRetry={onRetry} />;
  }
  if (message.mediaType === "audio") {
    return <AudioBubble message={message} onRetry={onRetry} />;
  }
  if (message.mediaType === "document" || message.mediaType === "video") {
    return <DocumentBubble message={message} onRetry={onRetry} />;
  }
  return <TextBubble message={message} onRetry={onRetry} />;
}
