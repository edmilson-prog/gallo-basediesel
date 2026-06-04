import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

export function ModelNotCataloguedBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={`gap-1 text-muted-foreground ${className ?? ""}`}>
      <Icon icon="mdi:link-variant-off" size={14} />
      {VEHICLE_STRINGS.detail.notCatalogued.badge}
    </Badge>
  );
}
