import type { IMessage } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { coordStr, decodeLocation } from "@/providers/whatsapp/contentFormat";
import { BubbleChrome, type IBubbleProps } from "./bubbleChrome";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";

/**
 * Bubble for a shared WhatsApp location. The coordinates/name are decoded from
 * the message `text` (the canonical encoding owned by
 * `@/providers/whatsapp/contentFormat`); when coordinates are present the card
 * links out to Google Maps. A location carries no binary media, so there is
 * nothing to sign or download here.
 */
export function LocationBubble({ message, onRetry, ...extras }: IBubbleProps) {
  const { name, lat, lng } = decodeLocation(message.text);
  const hasCoords = typeof lat === "number" && typeof lng === "number";
  // coordStr (not `${lat}`) so sub-1e-6 coords don't render as `5e-7` in the
  // Maps link or on screen — mirrors the no-exponential invariant of the encode.
  const coords = hasCoords ? `${coordStr(lat)},${coordStr(lng)}` : null;
  const mapHref = coords ? `https://www.google.com/maps?q=${coords}` : null;

  return (
    <BubbleChrome message={message} onRetry={onRetry} {...extras}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon icon="mdi:map-marker" size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-muted-foreground">
            {CONVERSATION_STRINGS.location.label}
          </p>
          <p className="truncate text-sm font-medium text-foreground">
            {name || (coords ? coords.replace(",", ", ") : CONVERSATION_STRINGS.location.noCoords)}
          </p>
          {mapHref && (
            <a
              href={mapHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <Icon icon="mdi:open-in-new" size={13} />
              {CONVERSATION_STRINGS.location.openMap}
            </a>
          )}
        </div>
      </div>
    </BubbleChrome>
  );
}
