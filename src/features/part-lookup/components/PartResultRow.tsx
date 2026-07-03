import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { priceText } from "../engine/partInsertText";

function stockClass(part: IPart): string {
  if (part.stockAvailable <= 0) return "text-severity-critical";
  if (part.stockAvailable <= part.stockMinimum) return "text-severity-warning";
  return "text-severity-success";
}

function stockLabel(part: IPart): string {
  if (part.stockAvailable <= 0) return "sem estoque";
  return `${part.stockAvailable} un`;
}

export interface IPartResultRowProps {
  part: IPart;
  active?: boolean;
  onSelect: (part: IPart) => void;
}

export function PartResultRow({ part, active, onSelect }: IPartResultRowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(part)}
      aria-pressed={active}
      className={`flex w-full items-center gap-3 rounded-md border px-2.5 py-2 text-left transition-colors ${
        active ? "border-primary bg-accent" : "border-border bg-card hover:bg-muted/60"
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon icon="mdi:cog-outline" size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{part.name}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {[`SKU ${part.sku}`, part.brand].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-bold tabular-nums text-primary">{priceText(part)}</span>
        <span className={`block text-[11px] font-semibold ${stockClass(part)}`}>
          {stockLabel(part)}
        </span>
      </span>
    </button>
  );
}
