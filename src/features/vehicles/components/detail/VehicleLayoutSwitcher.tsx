import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Icon } from "@/components/Icon";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";
import { VEHICLE_DETAIL_LAYOUTS, type VehicleDetailLayout } from "../../config/layout";

const COPY = VEHICLE_STRINGS.detail.layout;

const ICONS: Record<VehicleDetailLayout, string> = {
  prontuario: "mdi:clipboard-text-outline",
  health: "mdi:heart-pulse",
  rails: "mdi:view-split-vertical",
  bento: "mdi:view-grid-outline",
};

const LABELS: Record<VehicleDetailLayout, string> = {
  prontuario: COPY.prontuario,
  health: COPY.health,
  rails: COPY.rails,
  bento: COPY.bento,
};

const HINTS: Record<VehicleDetailLayout, string> = {
  prontuario: COPY.prontuarioHint,
  health: COPY.healthHint,
  rails: COPY.railsHint,
  bento: COPY.bentoHint,
};

export interface IVehicleLayoutSwitcherProps {
  value: VehicleDetailLayout;
  onChange: (layout: VehicleDetailLayout) => void;
}

export function VehicleLayoutSwitcher({ value, onChange }: IVehicleLayoutSwitcherProps) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(val) => {
        if (val) onChange(val as VehicleDetailLayout);
      }}
      variant="outline"
      size="sm"
      aria-label={COPY.ariaLabel}
    >
      {VEHICLE_DETAIL_LAYOUTS.map((layout) => (
        <ToggleGroupItem
          key={layout}
          value={layout}
          aria-label={LABELS[layout]}
          title={HINTS[layout]}
        >
          <Icon icon={ICONS[layout]} size={16} />
          <span className="ml-1 hidden sm:inline">{LABELS[layout]}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
