import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Icon } from "@/components/Icon";
import { PART_DETAIL_LAYOUTS, type PartDetailLayout } from "../../config/layout";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";

const COPY = CATALOG_STRINGS.detail.layout;

const ICONS: Record<PartDetailLayout, string> = {
  counter: "mdi:view-list-outline",
  panel: "mdi:view-grid-outline",
  sheet: "mdi:file-outline",
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
  disabled?: boolean;
}

/**
 * Segmented mode switch from the design kit (`CatActionHeader`): the three modes
 * sit inside a single inset well, with the active one carried by the brand fill.
 */
export function PartLayoutSwitcher({
  value,
  onChange,
  disabled = false,
}: IPartLayoutSwitcherProps) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(val) => {
        if (val) onChange(val as PartDetailLayout);
      }}
      size="sm"
      disabled={disabled}
      aria-label={COPY.ariaLabel}
      className="gap-1 rounded-[9px] border border-border bg-muted/40 p-1"
    >
      {PART_DETAIL_LAYOUTS.map((layout) => (
        <ToggleGroupItem
          key={layout}
          value={layout}
          aria-label={LABELS[layout]}
          title={HINTS[layout]}
          className="cursor-pointer rounded-md px-3 text-[12.5px] font-semibold text-muted-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          <Icon icon={ICONS[layout]} size={15} />
          <span className="ml-1 hidden sm:inline">{LABELS[layout]}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
