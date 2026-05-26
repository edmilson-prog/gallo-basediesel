import type { CarteiraTransferType } from "@/shared/types";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { transferTypeBadgeVariant, transferTypeIcon, transferTypeLabel } from "../utils/formatters";

export interface ITransferTypeBadgeProps {
  type: CarteiraTransferType;
  compact?: boolean;
}

export function TransferTypeBadge({ type, compact = false }: ITransferTypeBadgeProps) {
  return (
    <Badge variant={transferTypeBadgeVariant(type)} className="gap-1.5">
      <Icon icon={transferTypeIcon(type)} size={12} />
      {compact ? type.replace("permanent_", "perm. ") : transferTypeLabel(type)}
    </Badge>
  );
}
