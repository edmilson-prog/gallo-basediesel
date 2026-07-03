import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import type { PartLookupLayout } from "../engine/partLookupLayout";
import { PART_LOOKUP_STRINGS as S } from "../i18n/pt-BR";

const OPTIONS: { id: PartLookupLayout; label: string; hint: string }[] = [
  { id: "headline", label: S.layoutHeadline, hint: S.layoutHeadlineHint },
  { id: "dense", label: S.layoutDense, hint: S.layoutDenseHint },
  { id: "tabs", label: S.layoutTabs, hint: S.layoutTabsHint },
];

export interface ILayoutModePickerProps {
  layout: PartLookupLayout;
  onLayoutChange: (layout: PartLookupLayout) => void;
}

export function LayoutModePicker({ layout, onLayoutChange }: ILayoutModePickerProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={S.layoutTitle}>
          <Icon icon="mdi:view-dashboard-variant-outline" size={15} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">
          {S.layoutTitle}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={layout}
          onValueChange={(v) => onLayoutChange(v as PartLookupLayout)}
        >
          {OPTIONS.map((o) => (
            <DropdownMenuRadioItem key={o.id} value={o.id} className="flex-col items-start gap-0">
              <span className="text-sm">{o.label}</span>
              <span className="text-[11px] text-muted-foreground">{o.hint}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
