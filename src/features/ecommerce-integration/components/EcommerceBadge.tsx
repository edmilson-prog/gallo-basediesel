import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

export interface IEcommerceBadgeProps {
  /** Compact variant renders the cart icon only (lists with little room). */
  compact?: boolean;
  className?: string;
}

/**
 * "🛒 E-commerce" marker used across the inbox, order list and conversation
 * header to distinguish e-com originated records (PRD-067 RF-015/016/017).
 */
export function EcommerceBadge({ compact = false, className }: IEcommerceBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 border-primary/40 bg-primary/10 text-primary",
        compact ? "px-1.5" : "",
        className,
      )}
      title="Origem: E-commerce"
    >
      <Icon icon="mdi:cart" size={12} aria-hidden />
      {!compact && "E-commerce"}
    </Badge>
  );
}
