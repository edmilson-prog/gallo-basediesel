import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Icon } from "@/components/Icon";
import { PART_DETAIL_LAYOUTS, type PartDetailLayout } from "../../config/layout";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";

const COPY = CATALOG_STRINGS.detail.layout;

const ICONS: Record<PartDetailLayout, string> = {
  counter: "mdi:view-split-vertical",
  panel: "mdi:view-grid-outline",
  sheet: "mdi:file-document-outline",
};

const LABELS: Record<PartDetailLayout, string> = {
  counter: COPY.counter,
  panel: COPY.panel,
  sheet: COPY.sheet,
};

const HINTS: Record<PartDetailLayout, string> = {
  counter: COPY.counterHint,
  panel: COPY.panelHint,
  sheet: COPY.sheetHint,
};

export interface IPartLayoutSwitcherProps {
  value: PartDetailLayout;
  onChange: (layout: PartDetailLayout) => void;
}

export function PartLayoutSwitcher({ value, onChange }: IPartLayoutSwitcherProps) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(val) => {
        if (val) onChange(val as PartDetailLayout);
      }}
      variant="outline"
      size="sm"
      aria-label={COPY.ariaLabel}
    >
      {PART_DETAIL_LAYOUTS.map((layout) => (
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
