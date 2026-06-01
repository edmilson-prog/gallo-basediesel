import { toast } from "sonner";
import type { CopilotPlacement } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { COPILOT_PLACEMENTS } from "../config";
import { useCopilotSettings } from "../hooks/useCopilotSettings";
import { COPILOT_STRINGS } from "../i18n/pt-BR";

const PLACEMENT_ICONS: Record<CopilotPlacement, string> = {
  strip: "mdi:dock-bottom",
  card: "mdi:card-text-outline",
  tab: "mdi:tab",
};

const strings = COPILOT_STRINGS.settings;

/**
 * Radio-group selector for the Copilot placement variant. Persists instantly
 * via `useCopilotSettings` (localStorage) and confirms with a toast — no save
 * button, mirroring the theme switcher's instant-apply behaviour.
 */
export function CopilotPlacementField() {
  const { placement, setPlacement } = useCopilotSettings();

  const handleChange = (value: string) => {
    setPlacement(value as CopilotPlacement);
    toast.success(strings.saved, { icon: <Icon icon="mdi:check" size={16} /> });
  };

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">{strings.placementLabel}</legend>
      <RadioGroup value={placement} onValueChange={handleChange} className="gap-3">
        {COPILOT_PLACEMENTS.map((value) => {
          const meta = strings.placements[value];
          const selected = value === placement;
          const id = `copilot-placement-${value}`;
          return (
            <Label
              key={value}
              htmlFor={id}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-4 font-normal transition-colors",
                selected ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50",
              )}
            >
              <RadioGroupItem id={id} value={value} className="mt-0.5" />
              <Icon
                icon={PLACEMENT_ICONS[value]}
                size={20}
                className={cn(
                  "mt-0.5 shrink-0",
                  selected ? "text-primary" : "text-muted-foreground",
                )}
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium leading-none text-foreground">
                  {meta.label}
                </span>
                <span className="block text-xs text-muted-foreground">{meta.description}</span>
              </span>
            </Label>
          );
        })}
      </RadioGroup>
    </fieldset>
  );
}
