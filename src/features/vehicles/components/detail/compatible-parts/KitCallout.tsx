import type { IVehicleModelKit, IPart, ID } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { KitStatusBadge } from "@/features/model-kits/components/KitStatusBadge";
import { KitCategoryBadge } from "@/features/model-kits/components/KitCategoryBadge";
import { KitItemsPreview } from "@/features/model-kits/components/KitItemsPreview";
import { VEHICLE_STRINGS } from "../../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.detail.compatibleV2;

export interface IKitCalloutProps {
  kit: IVehicleModelKit;
  partsById: Map<ID, IPart>;
  onSeeKit: () => void;
}

export function KitCallout({ kit, partsById, onSeeKit }: IKitCalloutProps) {
  return (
    <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/10 p-3">
      {/* Line 1: icon + label + status badge + category badge */}
      <div className="flex flex-wrap items-center gap-2">
        <Icon icon="mdi:check-decagram" size={18} className="text-primary" />
        <span className="text-sm font-medium text-foreground">{COPY.kitCallout}</span>
        <KitStatusBadge status="oficial" />
        <KitCategoryBadge category={kit.category} />
      </div>

      {/* Line 2: items preview (left) + see-kit action (right) */}
      <div className="flex items-end justify-between gap-3">
        <KitItemsPreview items={kit.items} partsById={partsById} />
        <Button variant="ghost" size="sm" onClick={onSeeKit}>
          <Icon icon="mdi:arrow-right" size={14} />
          {COPY.seeKit}
        </Button>
      </div>
    </div>
  );
}
