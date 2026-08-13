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
 *
 * `shape="square"` is the detail page's branded variant from the CRM kit: a
 * rounded square with the initials in the brand accent instead of a circle
 * tinted by an id hash. It is opt-in precisely because the round, hashed
 * version is what the list and the (frozen) Atendimento fiche rely on to tell
 * rows apart at a glance.
 */
export function CustomerAvatar({
  display,
  className,
  iconSize = 22,
  shape = "circle",
}: {
  display: ICustomerDisplay;
  className?: string;
  iconSize?: number;
  shape?: "circle" | "square";
}) {
  const isSquare = shape === "square";
  return (
    <Avatar className={cn("h-12 w-12", isSquare && "rounded-lg border border-border", className)}>
      {display.avatarUrl && (
        <AvatarImage src={display.avatarUrl} alt={display.name} className="object-cover" />
      )}
      <AvatarFallback
        className={cn(
          "font-semibold",
          isSquare &&
            (display.isPhoneName
              ? "rounded-lg bg-muted/60 text-muted-foreground"
              : "rounded-lg bg-gradient-to-br from-muted to-muted/50 font-display font-extrabold uppercase tracking-[0.02em] text-primary"),
        )}
        style={isSquare ? undefined : { backgroundColor: display.bg, color: display.fg }}
        aria-hidden
      >
        {display.isPhoneName ? <Icon icon="mdi:account" size={iconSize} /> : display.initials}
      </AvatarFallback>
    </Avatar>
  );
}
