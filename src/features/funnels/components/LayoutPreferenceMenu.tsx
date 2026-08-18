import { Icon } from "@/components/Icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { FUNNEL_LAYOUTS, type FunnelLayout } from "../engine/resolveLayout";
import { COPY } from "../i18n/pt-BR";

const LAYOUT_ICON: Record<FunnelLayout, string> = {
  rail: "mdi:view-split-vertical",
  header: "mdi:chevron-down-box-outline",
  tabs: "mdi:tab",
};

export interface ILayoutPreferenceMenuProps {
  value: FunnelLayout;
  onChange: (l: FunnelLayout) => void;
  /** Rendered inside a narrow rail/tab strip: icon-only trigger. */
  compact?: boolean;
}

/**
 * The pattern switch, mounted INSIDE each selector.
 *
 * Spec 6.5 allows exactly two homes for this control: here, where the eye
 * already is when someone thinks "I'd like this differently", and Settings →
 * Appearance. Never a third ToggleGroup in the page header — two "mode"
 * controls side by side, one changing content and the other navigation, is
 * the confusion the spec set out to avoid.
 */
export function LayoutPreferenceMenu({ value, onChange, compact }: ILayoutPreferenceMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={compact ? "h-7 w-7 p-0" : "h-8 w-full justify-start gap-2 px-2"}
          aria-label={COPY.layoutMenu}
        >
          <Icon icon="mdi:dots-vertical" size={16} className="text-muted-foreground" />
          {!compact && <span className="text-xs">{COPY.layoutMenu}</span>}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(v) => onChange(v as FunnelLayout)}
        >
          {FUNNEL_LAYOUTS.map((l) => (
            <DropdownMenuRadioItem key={l} value={l} className="gap-2">
              <Icon icon={LAYOUT_ICON[l]} size={14} className="text-muted-foreground" aria-hidden />
              {COPY.layoutOptions[l]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
