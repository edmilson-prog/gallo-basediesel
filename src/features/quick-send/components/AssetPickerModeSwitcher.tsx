// src/features/quick-send/components/AssetPickerModeSwitcher.tsx
import { Icon } from "@/components/Icon";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { AssetPickerMode } from "../hooks/useAssetPickerMode";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

export interface IAssetPickerModeSwitcherProps {
  mode: AssetPickerMode;
  onChange: (m: AssetPickerMode) => void;
  className?: string;
}

const MODES: { value: AssetPickerMode; icon: string; label: string }[] = [
  { value: "palette", icon: "mdi:console-line", label: QUICK_SEND_STRINGS.picker.modePalette },
  { value: "grid", icon: "mdi:view-grid-outline", label: QUICK_SEND_STRINGS.picker.modeGrid },
  { value: "sheet", icon: "mdi:dock-right", label: QUICK_SEND_STRINGS.picker.modeSheet },
];

/** Segmented control switching the AssetPicker layout. Preference persisted upstream (D-2). */
export function AssetPickerModeSwitcher({ mode, onChange, className }: IAssetPickerModeSwitcherProps) {
  return (
    <ToggleGroup
      type="single"
      value={mode}
      onValueChange={(v) => v && onChange(v as AssetPickerMode)}
      className={cn("rounded-lg bg-muted/40 p-1", className)}
      aria-label={QUICK_SEND_STRINGS.picker.title}
    >
      {MODES.map((m) => (
        <Tooltip key={m.value}>
          <TooltipTrigger asChild>
            <ToggleGroupItem
              value={m.value}
              aria-label={m.label}
              className={cn(
                "h-8 w-8 rounded-md text-muted-foreground",
                "data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm",
                "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <Icon icon={m.icon} size={18} />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>{m.label}</TooltipContent>
        </Tooltip>
      ))}
    </ToggleGroup>
  );
}
