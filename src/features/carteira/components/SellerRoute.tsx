import type { ID, ISeller } from "@/shared/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Icon } from "@/components/Icon";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0] ?? "?";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  return ((first[0] ?? "?") + (last[0] ?? "?")).toUpperCase();
}

export interface ISellerRouteProps {
  fromSellerId: ID;
  toSellerId: ID;
  sellersById: Map<ID, ISeller>;
  compact?: boolean;
}

export function SellerRoute({ fromSellerId, toSellerId, sellersById, compact }: ISellerRouteProps) {
  const from = sellersById.get(fromSellerId);
  const to = sellersById.get(toSellerId);
  const fromName = from?.fullName ?? fromSellerId;
  const toName = to?.fullName ?? toSellerId;

  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="flex items-center gap-2">
        <Avatar className="h-7 w-7">
          <AvatarFallback className="bg-muted text-[10px] font-semibold text-foreground">
            {initials(fromName)}
          </AvatarFallback>
        </Avatar>
        <span className={compact ? "text-xs" : "text-sm"}>{fromName}</span>
      </div>
      <Icon icon="mdi:arrow-right" size={14} className="text-muted-foreground" />
      <div className="flex items-center gap-2">
        <Avatar className="h-7 w-7">
          <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
            {initials(toName)}
          </AvatarFallback>
        </Avatar>
        <span className={compact ? "text-xs font-medium" : "text-sm font-medium"}>{toName}</span>
      </div>
    </div>
  );
}
