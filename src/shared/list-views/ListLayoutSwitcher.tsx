import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Icon } from "@/components/Icon";
import {
  LIST_LAYOUTS,
  LIST_LAYOUT_HINTS,
  LIST_LAYOUT_ICONS,
  LIST_LAYOUT_LABELS,
  type ListLayout,
} from "./config";

export interface IListLayoutSwitcherProps {
  value: ListLayout;
  onChange: (layout: ListLayout) => void;
}

/** Segmented control to switch a list page's layout. Mirrors VehicleLayoutSwitcher. */
export function ListLayoutSwitcher({ value, onChange }: IListLayoutSwitcherProps) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(val) => {
        if (val) onChange(val as ListLayout);
      }}
      variant="outline"
      size="sm"
      aria-label="Escolher visualização da lista"
    >
      {LIST_LAYOUTS.map((layout) => (
        <ToggleGroupItem
          key={layout}
          value={layout}
          aria-label={LIST_LAYOUT_LABELS[layout]}
          title={LIST_LAYOUT_HINTS[layout]}
        >
          <Icon icon={LIST_LAYOUT_ICONS[layout]} size={16} />
          <span className="ml-1 hidden sm:inline">{LIST_LAYOUT_LABELS[layout]}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
