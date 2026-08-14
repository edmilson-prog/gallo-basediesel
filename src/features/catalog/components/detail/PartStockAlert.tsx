import { toast } from "sonner";
import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/shared/utils/format";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { buildRestockSummary, latestSupplier } from "../../utils/restock";

const COPY = CATALOG_STRINGS.detail.stockAlert;

export interface IPartStockAlertProps {
  part: IPart;
  className?: string;
}

/**
 * Actionable low-stock banner (design kit `CatStockAlert`). The CTA copies a
 * restock summary to the clipboard — there is no purchase-order module yet.
 */
export function PartStockAlert({ part, className }: IPartStockAlertProps) {
  if (!part.active || part.stockAvailable > part.stockMinimum) return null;

  const supplier = latestSupplier(part.suppliers);
  const cost = supplier?.cost ?? part.averageCost ?? part.unitCost;
  const title =
    part.stockAvailable <= 0
      ? COPY.titleZero(part.stockMinimum)
      : COPY.titleLow(part.stockAvailable, part.stockMinimum);

  const handleGenerateOrder = async () => {
    try {
      await navigator.clipboard.writeText(buildRestockSummary(part));
      toast.success(COPY.copied);
    } catch {
      toast.error(COPY.copyError);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3.5 rounded-xl border border-severity-critical/40 bg-severity-critical/10 px-[18px] py-[13px] sm:flex-row sm:items-center",
        className,
      )}
    >
      <span className="grid size-[34px] shrink-0 place-items-center rounded-[9px] bg-severity-critical/20">
        <Icon icon="mdi:alert" size={18} className="text-severity-critical" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-foreground">{title}</p>
        <p className="text-[12.5px] text-muted-foreground">
          {supplier ? COPY.lastSupplier(supplier.name, formatBRL(cost)) : COPY.noSupplier}
        </p>
      </div>
      <Button size="sm" className="shrink-0" onClick={() => void handleGenerateOrder()}>
        <Icon icon="mdi:cart-outline" size={15} />
        {COPY.cta}
      </Button>
    </div>
  );
}
