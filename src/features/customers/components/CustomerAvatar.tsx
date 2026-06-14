import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { ICustomerDisplay } from "../utils/customerDisplay";

/**
 * Customer avatar — renders the synced WhatsApp profile photo when present;
 * otherwise a stable colored fallback: a generic person icon for unsaved,
 * number-only contacts (avoids a useless "+5"), or initials for real names.
 * Mirrors the inbox `ContactAvatar` for the customer surfaces (profile header,
 * detail header, list). Radix `AvatarImage` falls back on its own when the
 * photo is absent or fails to load, so no manual error handling is needed.
 */
export function CustomerAvatar({
  display,
  className,
  iconSize = 22,
}: {
  display: ICustomerDisplay;
  className?: string;
  iconSize?: number;
}) {
  return (
    <Avatar className={cn("h-12 w-12", className)}>
      {display.avatarUrl && (
        <AvatarImage src={display.avatarUrl} alt={display.name} className="object-cover" />
      )}
      <AvatarFallback
        className="font-semibold"
        style={{ backgroundColor: display.bg, color: display.fg }}
        aria-hidden
      >
        {display.isPhoneName ? <Icon icon="mdi:account" size={iconSize} /> : display.initials}
      </AvatarFallback>
    </Avatar>
  );
}
