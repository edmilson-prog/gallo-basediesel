// src/features/media/components/MediaViewSwitcher.tsx
import { Icon } from "@/components/Icon";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { MediaViewMode } from "../hooks/useMediaViewMode";
import { MEDIA_STRINGS } from "../i18n/pt-BR";

interface IMediaViewSwitcherProps {
  mode: MediaViewMode;
  onChange: (mode: MediaViewMode) => void;
  className?: string;
}

const MODES: { value: MediaViewMode; icon: string; labelKey: keyof typeof MEDIA_STRINGS.viewMode }[] = [
  { value: "grade", icon: "mdi:view-grid-outline", labelKey: "grade" },
  { value: "cartoes", icon: "mdi:view-agenda-outline", labelKey: "cartoes" },
  { value: "tipo", icon: "mdi:format-list-group", labelKey: "tipo" },
];

/** Segmented control switching the gallery body layout. Persisted upstream (D-8..D-11). */
export function MediaViewSwitcher({ mode, onChange, className }: IMediaViewSwitcherProps) {
  return (
    <ToggleGroup
      type="single"
      value={mode}
      onValueChange={(v) => v && onChange(v as MediaViewMode)}
      className={cn("rounded-lg bg-muted/40 p-1", className)}
      aria-label={MEDIA_STRINGS.viewMode.label}
    >
      {MODES.map((m) => {
        const label = MEDIA_STRINGS.viewMode[m.labelKey];
        return (
          <Tooltip key={m.value}>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                value={m.value}
                aria-label={label}
                className={cn(
                  "h-8 w-8 rounded-md text-muted-foreground",
                  "data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm",
                  "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <Icon icon={m.icon} size={18} />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </ToggleGroup>
  );
}
