import type { IMessage, ITrackableLink } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { BubbleChrome } from "@/features/conversations/components/bubbles/bubbleChrome";
import { TRACKABLE_LINK_MARKER, type ILinkPayload } from "../engine/trackableLink";
import { LinkOpenIndicator } from "./LinkOpenIndicator";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

export type { ILinkPayload };

/** Parse `[link]<json>` from message text. Null on malformed → caller degrades. */
export function decodeLinkMarker(text: string): ILinkPayload | null {
  if (!text.startsWith(TRACKABLE_LINK_MARKER)) return null;
  const json = text.slice(TRACKABLE_LINK_MARKER.length);
  try {
    const parsed = JSON.parse(json) as ILinkPayload;
    if (!parsed || typeof parsed.linkId !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface ILinkBubbleProps {
  message: IMessage;
  /** Live link record (for opens/lastOpenedAt); resolved by linkId. */
  link?: ITrackableLink | null;
  onRetry?: () => void;
}

/**
 * Trackable-link bubble (D-8). Renders inside BubbleChrome (irmão visual de
 * DocumentBubble) so it shares the same alignment, status row, and SDR styling.
 * Shows the link label + shortRef and, when a live ITrackableLink is available,
 * the ambient LinkOpenIndicator. Degrades to a plain link row when the marker
 * can't be decoded.
 */
export function LinkBubble({ message, link, onRetry }: ILinkBubbleProps) {
  const s = QUICK_SEND_STRINGS.link;
  const payload = decodeLinkMarker(message.text);

  return (
    <BubbleChrome message={message} onRetry={onRetry}>
      <div className="flex items-start gap-2">
        <Icon icon="mdi:link-variant" size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">
            {payload?.label ?? message.text}
          </p>
          {payload?.shortRef && (
            <p className="truncate text-[11px] text-muted-foreground">{payload.shortRef}</p>
          )}
          <p className="mt-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            <Icon icon="mdi:radar" size={10} aria-hidden />
            {s.trackableNote}
          </p>
          {link && <LinkOpenIndicator link={link} />}
        </div>
      </div>
    </BubbleChrome>
  );
}
