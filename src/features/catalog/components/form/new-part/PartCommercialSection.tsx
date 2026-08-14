import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL, formatPercent } from "@/shared/utils/format";
import { CATALOG_STRINGS } from "../../../i18n/pt-BR";
import { buildPriceTables, marginHealth, marginOnPrice } from "../../../utils/pricing";
import { resolveStandardPrice } from "../../../engine/newPart";
import { PartChip } from "../../detail/PartChip";
import { NewPartField } from "./NewPartField";

const COPY = CATALOG_STRINGS.newPart.commercial;

const HEALTH_TEXT: Record<ReturnType<typeof marginHealth>, string> = {
  success: "text-severity-success",
  warning: "text-severity-warning",
  critical: "text-severity-critical",
};

export interface IPartCommercialSectionProps {
  unitCost: string;
  markupPercent: string;
  directPrice: string;
  onCostChange: (next: string) => void;
  onMarkupChange: (next: string) => void;
  onDirectPriceChange: (next: string) => void;
  priceInvalid?: boolean;
}

/**
 * Cost + markup, and the five ERP tables the part is born into.
 *
 * The old form asked for a loose `unitPrice`, so every part started with a
 * price nobody could defend and a margin nobody could see. Here the invoice
 * cost drives the Padrão markup, the other four channels fall out of it
 * (`buildPriceTables`), and the margin on the sale price is stated in the same
 * breath — coloured by the thresholds the product detail already uses.
 *
 * Without a cost the price is still accepted, typed by hand, and the margin is
 * declared unknown rather than quietly shown as zero.
 */
export function PartCommercialSection({
  unitCost,
  markupPercent,
  directPrice,
  onCostChange,
  onMarkupChange,
  onDirectPriceChange,
  priceInvalid,
}: IPartCommercialSectionProps) {
  const cost = Number(unitCost) || 0;
  const markup = (Number(markupPercent) || 0) / 100;
  const hasCost = cost > 0;
  const price = resolveStandardPrice({
    unitCost: cost,
    markupPercent: markup,
    directPrice: Number(directPrice) || 0,
  });
  const margin = hasCost && price > 0 ? marginOnPrice(price, cost) : null;
  const tables = hasCost ? buildPriceTables(cost, markup) : [];

  return (
    <div className="space-y-4">
      <div className="grid gap-3.5 sm:grid-cols-[1fr_1fr_auto]">
        <NewPartField
          id="new-part-cost"
          label={COPY.costLabel}
          note={COPY.costNote}
          value={unitCost}
          onChange={onCostChange}
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          mono
          placeholder="98,40"
          adornment={<span className="text-[11px] font-bold text-muted-foreground">R$</span>}
        />

        {hasCost ? (
          <NewPartField
            id="new-part-markup"
            label={COPY.markupLabel}
            note={COPY.markupNote}
            value={markupPercent}
            onChange={onMarkupChange}
            type="number"
            inputMode="decimal"
            step="1"
            min="0"
            mono
            adornment={<span className="text-[11px] font-bold text-muted-foreground">%</span>}
          />
        ) : (
          <NewPartField
            id="new-part-direct-price"
            label={COPY.directPriceLabel}
            note={COPY.directPriceNote}
            value={directPrice}
            onChange={onDirectPriceChange}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            mono
            required
            invalid={priceInvalid}
            placeholder="189,90"
            adornment={<span className="text-[11px] font-bold text-muted-foreground">R$</span>}
          />
        )}

        <div className="min-w-0 sm:min-w-[160px]">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
            {COPY.marginLabel}
          </div>
          {margin != null ? (
            <div className="flex items-baseline gap-2">
              <span
                className={cn(
                  "font-display text-[26px] font-bold uppercase leading-none tabular-nums",
                  HEALTH_TEXT[marginHealth(margin)],
                )}
              >
                {formatPercent(margin, 0)}
              </span>
              <span className="text-[11.5px] text-muted-foreground">
                {COPY.health[marginHealth(margin)]}
              </span>
            </div>
          ) : (
            <div>
              <span className="font-display text-[19px] font-bold uppercase leading-none text-muted-foreground/60">
                {COPY.marginUnknown}
              </span>
              <p className="mt-1.5 text-[11px] text-muted-foreground/70">
                {COPY.marginUnknownHint}
              </p>
            </div>
          )}
        </div>
      </div>

      {tables.length > 0 && (
        <div className="animate-in fade-in slide-in-from-top-1 border-t border-border pt-3.5 duration-300">
          <div className="mb-2.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
            <Icon icon="mdi:table-large" size={13} className="shrink-0" aria-hidden />
            {COPY.ladderTitle}
          </div>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
            {tables.map((table) => {
              const share = marginOnPrice(table.price, cost);
              const isStandard = table.id === "padrao";
              return (
                <div key={table.id} className="bg-card px-3 py-2.5">
                  <dt className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "truncate text-[10px] font-bold uppercase tracking-[0.1em]",
                        isStandard ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {table.label}
                    </span>
                    {isStandard && (
                      <PartChip tone="warning" size="sm" className="shrink-0 px-1.5 py-0">
                        {COPY.standardBadge}
                      </PartChip>
                    )}
                  </dt>
                  <dd>
                    <span className="mt-1.5 block truncate font-display text-[17px] font-bold leading-none tabular-nums text-foreground">
                      {formatBRL(table.price)}
                    </span>
                    <span
                      className={cn(
                        "mt-1 block text-[10.5px] font-semibold tabular-nums",
                        HEALTH_TEXT[marginHealth(share)],
                      )}
                    >
                      {formatPercent(share, 0)}
                    </span>
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}
    </div>
  );
}
