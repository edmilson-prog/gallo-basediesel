import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Icon } from "@/components/Icon";
import { VEHICLE_STRINGS } from "../../../i18n/pt-BR";
import { type CompatiblePartsView } from "../../../config/compatibleParts";

const COPY = VEHICLE_STRINGS.detail.compatibleV2.modes;

const ICONS: Record<CompatiblePartsView, string> = {
  curadoria: "mdi:source-branch",
  catalogo: "mdi:format-list-bulleted",
  kit: "mdi:package-variant-closed",
};

const LABELS: Record<CompatiblePartsView, string> = {
  curadoria: COPY.curadoria,
  catalogo: COPY.catalogo,
  kit: COPY.kit,
};

export interface ICompatiblePartsModeToggleProps {
  value: CompatiblePartsView;
  onChange: (v: CompatiblePartsView) => void;
}

export function CompatiblePartsModeToggle({ value, onChange }: ICompatiblePartsModeToggleProps) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => {
        if (v) onChange(v as CompatiblePartsView);
      }}
      className="bg-muted rounded-md p-0.5"
      size="sm"
      aria-label="Modo de visualização de peças"
    >
      {(["curadoria", "catalogo", "kit"] as const).map((view) => (
        <ToggleGroupItem
          key={view}
          value={view}
          aria-label={LABELS[view]}
          className="data-[state=on]:bg-background"
        >
          <Icon icon={ICONS[view]} size={16} />
          <span className="hidden sm:inline">{LABELS[view]}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
