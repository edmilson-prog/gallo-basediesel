import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

export interface IAdSourceBadgeProps {
  /** Compact variant renders the icon only (lists with little room). */
  compact?: boolean;
  className?: string;
  /** Ad creative headline, shown in the native tooltip when present. */
  headline?: string;
}

/**
 * "📢 Anúncio" marker for conversations that began (or most recently
 * resumed) via a WhatsApp ad/post referral (contextInfo.externalAdReplyInfo).
 * Mirrors the EcommerceBadge pattern exactly.
 */
export function AdSourceBadge({ compact = false, className, headline }: IAdSourceBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        compact ? "px-1.5" : "",
        className,
      )}
      title={headline ? `Origem: Anúncio · ${headline}` : "Origem: Anúncio"}
    >
      <Icon icon="mdi:bullhorn-outline" size={12} aria-hidden />
      {!compact && "Anúncio"}
    </Badge>
  );
}
