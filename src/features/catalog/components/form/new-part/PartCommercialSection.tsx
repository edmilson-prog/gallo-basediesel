import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL, formatPercent } from "@/shared/utils/format";
import { CATALOG_STRINGS } from "../../../i18n/pt-BR";
import {
  PRICE_CHANNELS,
  buildPriceTables,
  marginHealth,
  marginOnPrice,
} from "../../../utils/pricing";
import { resolveStandardPrice } from "../../../engine/newPart";
import { PartChip } from "../../detail/PartChip";
import { NewPartField } from "./NewPartField";

const COPY = CATALOG_STRINGS.newPart.commercial;

const HEALTH_TEXT: Record<ReturnType<typeof marginHealth>, string> = {
  success: "text-severity-success",
  warning: "text-severity-warning",
  critical: "text-severity-critical",
};

interface IChannelRow {
  id: string;
  label: string;
  /** `null` renders an em dash — this channel has nothing to price from yet. */
  price: number | null;
  share: number | null;
}

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
 * The ladder is always on screen, dashes and all. Revealing it only after a
 * cost is typed would both shove the layout down and hide the one thing this
 * screen is trying to teach: a part is not born with *a* price, it is born
 * into five tables.
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
  const typedPrice = Number(directPrice) || 0;
  const price = resolveStandardPrice({
    unitCost: cost,
    markupPercent: markup,
    directPrice: typedPrice,
  });
  const margin = hasCost && price > 0 ? marginOnPrice(price, cost) : null;

  const rows: IChannelRow[] = hasCost
    ? buildPriceTables(cost, markup).map((table) => ({
        id: table.id,
        label: table.label,
        price: table.price,
        share: marginOnPrice(table.price, cost),
      }))
    : // Without a cost only the Padrão table exists, and only if it was typed —
      // the other four are offsets off a number nobody has given yet.
      PRICE_CHANNELS.map((channel) => ({
        id: channel.id,
        label: channel.label,
        price: channel.id === "padrao" && typedPrice > 0 ? typedPrice : null,
        share: null,
      }));

  return (
    <div className="space-y-4">
      <div className="grid gap-3.5 sm:grid-cols-[1fr_1fr_150px]">
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

        {/* Fixed width: this cell swaps a percentage for an em dash, and a
            column that resizes with its own content shoves the inputs around. */}
        <div className="min-w-0">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
            {COPY.marginLabel}
          </div>
          <span
            className={cn(
              "block font-display text-[26px] font-bold uppercase leading-none tabular-nums",
              margin != null ? HEALTH_TEXT[marginHealth(margin)] : "text-muted-foreground/50",
            )}
          >
            {margin != null ? formatPercent(margin, 0) : "—"}
          </span>
          <span className="mt-1.5 block text-[11px] leading-snug text-muted-foreground">
            {margin != null ? COPY.health[marginHealth(margin)] : COPY.marginUnknownHint}
          </span>
        </div>
      </div>

      <div className="border-t border-border pt-3.5">
        <div className="mb-2.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
          <Icon icon="mdi:table-large" size={13} className="shrink-0" aria-hidden />
          {COPY.ladderTitle}
        </div>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
          {rows.map((row) => {
            const isStandard = row.id === "padrao";
            return (
              <div key={row.id} className="bg-card px-3 py-2.5">
                <dt className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "truncate text-[10px] font-bold uppercase tracking-[0.1em]",
                      isStandard ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {row.label}
                  </span>
                  {isStandard && (
                    <PartChip tone="warning" size="sm" className="shrink-0 px-1.5 py-0">
                      {COPY.standardBadge}
                    </PartChip>
                  )}
                </dt>
                <dd>
                  <span
                    className={cn(
                      "mt-1.5 block truncate font-display text-[17px] font-bold leading-none tabular-nums",
                      row.price != null ? "text-foreground" : "text-muted-foreground/40",
                    )}
                  >
                    {row.price != null ? formatBRL(row.price) : "—"}
                  </span>
                  <span
                    className={cn(
                      "mt-1 block text-[10.5px] font-semibold tabular-nums",
                      row.share != null
                        ? HEALTH_TEXT[marginHealth(row.share)]
                        : "text-muted-foreground/40",
                    )}
                  >
                    {row.share != null ? formatPercent(row.share, 0) : "—"}
                  </span>
                </dd>
              </div>
            );
          })}
        </dl>
        {!hasCost && (
          <p className="mt-2 text-[11px] text-muted-foreground/70">{COPY.ladderNeedsCost}</p>
        )}
      </div>
    </div>
  );
}
