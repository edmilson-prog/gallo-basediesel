import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { IConversationDisplay } from "../utils/conversationDisplay";

/**
 * Contact avatar for the inbox surfaces. Renders the synced WhatsApp profile
 * photo when present; otherwise a stable colored fallback — a generic person
 * icon for unsaved, number-only contacts (avoids a useless "+5"), or initials
 * for real names. Radix `AvatarImage` falls back on its own when the photo is
 * absent or fails to load, so no manual error handling is needed.
 */
export function ContactAvatar({
  display,
  className,
  iconSize = 18,
}: {
  display: IConversationDisplay;
  className?: string;
  iconSize?: number;
}) {
  const bg = `hsl(${display.hue} 70% 88%)`;
  const fg = `hsl(${display.hue} 60% 28%)`;
  return (
    <Avatar className={cn("h-10 w-10", className)}>
      {display.avatarUrl && (
        <AvatarImage src={display.avatarUrl} alt={display.name} className="object-cover" />
      )}
      <AvatarFallback
        className="font-semibold"
        style={{ backgroundColor: bg, color: fg }}
        aria-hidden
      >
        {display.isPhoneName ? <Icon icon="mdi:account" size={iconSize} /> : display.initials}
      </AvatarFallback>
    </Avatar>
  );
}
