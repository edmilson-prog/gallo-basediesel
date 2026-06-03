import type { ModelKitCategory } from "@/shared/types";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";

const CATEGORY_CONFIG: Record<ModelKitCategory, { icon: string; label: string }> = {
  filtros: { icon: "mdi:air-filter", label: "filtros" },
  freios: { icon: "mdi:car-brake-alarm", label: "freios" },
  correia: { icon: "mdi:fan", label: "correia" },
  revisao: { icon: "mdi:wrench-clock", label: "revisão" },
  custom: { icon: "mdi:package-variant", label: "custom" },
};

export interface IKitCategoryBadgeProps {
  category: ModelKitCategory;
}

export function KitCategoryBadge({ category }: IKitCategoryBadgeProps) {
  const { icon, label } = CATEGORY_CONFIG[category];

  return (
    <Badge variant="secondary" className="gap-1">
      <Icon icon={icon} size={20} className="text-muted-foreground" />
      <span>{label}</span>
    </Badge>
  );
}
