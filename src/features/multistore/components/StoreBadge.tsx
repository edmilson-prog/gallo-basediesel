import { cn } from "@/lib/utils";
import type { IStore, StoreType } from "@/shared/types";

const TYPE_LABELS: Record<StoreType, string> = {
  matriz: "Matriz",
  filial: "Filial",
  parceira: "Parceira",
};

/**
 * Tailwind classes per store type, anchored to the platform design tokens.
 * Stays on semantic tokens so the look adapts across the four themes
 * (`diesel`, `parts`, `service`, `industrial`) and the light/dark modes.
 */
const TYPE_CLASSES: Record<StoreType, string> = {
  matriz: "bg-primary/10 text-primary border-primary/30",
  filial: "bg-accent text-accent-foreground border-border",
  parceira: "bg-muted text-muted-foreground border-border",
};

export interface IStoreBadgeProps {
  store: Pick<IStore, "type">;
  className?: string;
}

/**
 * Compact pill displaying the store type — used inside `<StoreSwitcher>` and
 * any future cross-store list (Fase 2 — Visão Executiva).
 *
 * @see ./StoreSwitcher.tsx
 */
export function StoreBadge({ store, className }: IStoreBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        TYPE_CLASSES[store.type],
        className,
      )}
    >
      {TYPE_LABELS[store.type]}
    </span>
  );
}
