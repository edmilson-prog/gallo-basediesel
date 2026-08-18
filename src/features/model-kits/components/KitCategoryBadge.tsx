import type { ModelKitCategory } from "@/shared/types";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { KIT_CATEGORY_CONFIG } from "../engine";

export interface IKitCategoryBadgeProps {
  category: ModelKitCategory;
}

export function KitCategoryBadge({ category }: IKitCategoryBadgeProps) {
  const { icon, label } = KIT_CATEGORY_CONFIG[category];

  return (
    <Badge variant="secondary" className="gap-1">
      <Icon icon={icon} size={20} className="text-muted-foreground" />
      <span>{label}</span>
    </Badge>
  );
}
