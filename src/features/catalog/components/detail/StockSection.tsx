import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { StockBadge } from "../StockBadge";
import { Section } from "./ApplicationsSection";

export interface IStockSectionProps {
  part: IPart;
}

export function StockSection({ part }: IStockSectionProps) {
  return (
    <Section title={CATALOG_STRINGS.detail.sections.stock} icon="mdi:warehouse">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold text-foreground">{part.stockAvailable}</span>
            <span className="text-xs text-muted-foreground">unidades</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {CATALOG_STRINGS.detail.stock.minimum}: <span className="font-medium text-foreground">{part.stockMinimum}</span>
          </p>
        </div>
        <StockBadge part={part} />
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
        <Icon icon="mdi:information-outline" size={14} className="mt-0.5 shrink-0" />
        <p>{CATALOG_STRINGS.detail.stock.dintecNote}</p>
      </div>
    </Section>
  );
}
