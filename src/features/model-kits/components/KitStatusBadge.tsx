import type { ModelKitStatus } from "@/shared/types";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";

export interface IKitStatusBadgeProps {
  status: ModelKitStatus;
}

export function KitStatusBadge({ status }: IKitStatusBadgeProps) {
  if (status === "oficial") {
    return (
      <Badge className="border border-primary/30 bg-primary/15 text-primary hover:bg-primary/20">
        <Icon icon="mdi:check-decagram" size={14} className="mr-1" />
        Oficial
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Icon icon="mdi:pencil-ruler" size={14} />
      Rascunho
    </Badge>
  );
}
