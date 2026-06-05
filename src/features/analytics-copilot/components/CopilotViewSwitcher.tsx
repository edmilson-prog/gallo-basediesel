import { Icon } from "@/components/Icon";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { CopilotViewMode } from "../hooks/useCopilotViewMode";

interface ICopilotViewSwitcherProps {
  mode: CopilotViewMode;
  onChange: (mode: CopilotViewMode) => void;
  className?: string;
}

const MODES: { value: CopilotViewMode; icon: string; label: string }[] = [
  { value: "foco", icon: "mdi:card-text-outline", label: "Modo Foco — coluna única" },
  { value: "historico", icon: "mdi:history", label: "Modo Histórico — conversas salvas" },
  { value: "split", icon: "mdi:view-split-vertical", label: "Modo Split — conversa e detalhe" },
];

/** Segmented control to switch view modes. Icons + tooltips; active item elevated. */
export function CopilotViewSwitcher({ mode, onChange, className }: ICopilotViewSwitcherProps) {
  return (
    <ToggleGroup
      type="single"
      value={mode}
      onValueChange={(v) => v && onChange(v as CopilotViewMode)}
      className={cn("rounded-lg bg-muted/40 p-1", className)}
      aria-label="Modo de visualização"
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
