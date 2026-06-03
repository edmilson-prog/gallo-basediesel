// src/features/model-kits/components/KitSuggestionBanner.tsx
import type { IVehicleModelKit } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";

interface KitSuggestionBannerProps {
  kit: IVehicleModelKit;
  vehicleLabel: string;
  onApply(): void;
  onDismiss(): void;
}

export function KitSuggestionBanner({
  kit,
  vehicleLabel,
  onApply,
  onDismiss,
}: KitSuggestionBannerProps) {
  return (
    <div
      role="region"
      aria-label="Sugestão de kit"
      className="rounded-lg border border-border bg-muted/50 p-3"
    >
      <div className="flex items-center gap-2">
        <Icon icon="mdi:truck-outline" size={16} className="shrink-0 text-muted-foreground" />
        <p className="flex-1 text-sm text-foreground">
          Este cliente tem um <span className="font-medium">{vehicleLabel}</span> — aplicar{" "}
          <span className="font-medium">{kit.name}</span>?
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="default" size="sm" onClick={onApply}>
            Aplicar
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
            Agora não
          </Button>
        </div>
      </div>
    </div>
  );
}
