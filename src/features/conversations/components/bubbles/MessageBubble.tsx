import type { IMessage } from "@/shared/types";
import { TextBubble } from "./TextBubble";
import { ImageBubble } from "./ImageBubble";
import { AudioBubble } from "./AudioBubble";
import { DocumentBubble } from "./DocumentBubble";
import { LocationBubble } from "./LocationBubble";
import { ContactBubble } from "./ContactBubble";
import { SystemBubble } from "./SystemBubble";
import { TemplateBubble } from "./TemplateBubble";
import { ProductCardBubble } from "@/features/quick-send/components/ProductCardBubble";
import { PRODUCT_CARD_MARKER } from "@/features/quick-send/engine/productCardPayload";
import { LinkBubble, decodeLinkMarker } from "@/features/quick-send/components/LinkBubble";
import { useConversationLinks } from "@/features/quick-send/hooks/useConversationLinks";
import { TRACKABLE_LINK_MARKER } from "@/features/quick-send/engine/trackableLink";

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
  // Structured shares are discriminated by `mediaType`, which is authoritative —
  // resolve them BEFORE the text-marker heuristics below, so a contact whose
  // name happens to start with a marker (`[produto]`, `[template]`, …) can't be
  // hijacked into the wrong bubble.
  if (message.mediaType === "location") {
    return <LocationBubble message={message} onRetry={onRetry} />;
  }
  if (message.mediaType === "contact") {
    return <ContactBubble message={message} onRetry={onRetry} />;
  }
  if (
    message.text.startsWith(TEMPLATE_PREFIX) ||
    (message.provider === "meta" &&
      message.mediaType === undefined &&
      message.text.startsWith("📋 "))
  ) {
    return <TemplateBubble message={message} onRetry={onRetry} />;
  }
  if (message.text.startsWith(PRODUCT_CARD_MARKER)) {
    return <ProductCardBubble message={message} onRetry={onRetry} />;
  }
  if (message.text.startsWith(TRACKABLE_LINK_MARKER)) {
    return <LinkBubbleWithLiveData message={message} onRetry={onRetry} />;
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

/** Co-located wrapper so the hook only runs for link messages (Rules of Hooks). */
function LinkBubbleWithLiveData({
  message,
  onRetry,
}: {
  message: IMessage;
  onRetry?: () => void;
}) {
  const payload = decodeLinkMarker(message.text);
  const { byId } = useConversationLinks(message.conversationId);
  const link = payload ? (byId.get(payload.linkId) ?? null) : null;
  return <LinkBubble message={message} link={link} onRetry={onRetry} />;
}
