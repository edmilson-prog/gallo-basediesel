import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Icon } from "@/components/Icon";
import {
  DETAIL_LAYOUTS,
  DETAIL_LAYOUT_HINTS,
  DETAIL_LAYOUT_ICONS,
  DETAIL_LAYOUT_LABELS,
  type DetailLayout,
} from "./config";

export interface IDetailLayoutSwitcherProps {
  value: DetailLayout;
  onChange: (layout: DetailLayout) => void;
}

/** Segmented control to switch a detail page's layout. Mirrors ListLayoutSwitcher. */
export function DetailLayoutSwitcher({ value, onChange }: IDetailLayoutSwitcherProps) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(val) => {
        if (val) onChange(val as DetailLayout);
      }}
      variant="outline"
      size="sm"
      aria-label="Escolher visualização da ficha"
    >
      {DETAIL_LAYOUTS.map((layout) => (
        <ToggleGroupItem
          key={layout}
          value={layout}
          aria-label={DETAIL_LAYOUT_LABELS[layout]}
          title={DETAIL_LAYOUT_HINTS[layout]}
        >
          <Icon icon={DETAIL_LAYOUT_ICONS[layout]} size={16} />
          <span className="ml-1 hidden sm:inline">{DETAIL_LAYOUT_LABELS[layout]}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
