import { cn } from "@/lib/utils";

export interface ISupplierMetricProps {
  label: string;
  value: string;
  /** Rail-only: a small line under the value (e.g. the contact's phone). */
  sub?: string;
  /** `"lg"` — the rail's compact 2×2 card (default). `"sm"` — the sheet's denser 3×2 grid. */
  size?: "lg" | "sm";
}

/**
 * One label/value tile, shared by `SupplierRail`'s 2×2 card and
 * `SupplierSheet`'s 3×2 fact grid — same shape, only the value's type scale
 * differs between the two densities.
 */
export function SupplierMetric({ label, value, sub, size = "lg" }: ISupplierMetricProps) {
  return (
    <div className="min-w-0">
      <span className="block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "mt-1 block truncate font-bold text-foreground",
          size === "lg" ? "text-lg leading-none" : "text-sm",
        )}
      >
        {value}
      </span>
      {sub && (
        <span className="mt-1.5 block truncate text-[11px] text-muted-foreground">{sub}</span>
      )}
    </div>
  );
}
