import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { StockBadge } from "../StockBadge";

const COPY = CATALOG_STRINGS.detail.logistics;

export interface IPartLogisticsCardProps {
  part: IPart;
}

export function PartLogisticsCard({ part }: IPartLogisticsCardProps) {
  const hasData =
    part.weightKg != null ||
    part.storageLocation ||
    part.boxQuantity != null ||
    part.fractionable != null ||
    part.unitOfMeasure;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon icon="mdi:package-variant-closed" size={18} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-tight text-foreground">{COPY.title}</h2>
        </div>
        <StockBadge part={part} />
      </div>
      {hasData ? (
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <Field
            label={COPY.weight}
            value={
              part.weightKg != null ? `${part.weightKg.toLocaleString("pt-BR")} kg` : undefined
            }
          />
          <Field label={COPY.location} value={part.storageLocation} mono />
          <Field
            label={COPY.boxQty}
            value={part.boxQuantity != null ? String(part.boxQuantity) : undefined}
          />
          <Field
            label={COPY.fractionable}
            value={part.fractionable != null ? (part.fractionable ? COPY.yes : COPY.no) : undefined}
          />
          <Field label={COPY.unit} value={part.unitOfMeasure} />
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">{COPY.empty}</p>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="rounded-md bg-muted/40 px-2.5 py-1.5">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-foreground" : "text-foreground"}>{value ?? "—"}</dd>
    </div>
  );
}
