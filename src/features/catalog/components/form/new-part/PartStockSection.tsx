import { CATALOG_STRINGS } from "../../../i18n/pt-BR";
import { suggestedRestockQuantity } from "../../../utils/restock";
import { NewPartField } from "./NewPartField";

const COPY = CATALOG_STRINGS.newPart.stock;

export interface IPartStockSectionProps {
  stockAvailable: string;
  stockMinimum: string;
  onStockChange: (next: string) => void;
  onMinimumChange: (next: string) => void;
}

/**
 * Opening stock and the minimum, with the minimum's consequence spelled out.
 *
 * "Estoque mínimo" is the field that decides whether a part ever reaches the
 * restock queue, and the old form gave no clue about that — so it was left at
 * its default and the queue stayed thin. The hint quotes the real number the
 * list will suggest (`suggestedRestockQuantity`), not the rule in the abstract.
 */
export function PartStockSection({
  stockAvailable,
  stockMinimum,
  onStockChange,
  onMinimumChange,
}: IPartStockSectionProps) {
  const minimum = Number(stockMinimum) || 0;
  const available = Number(stockAvailable) || 0;

  return (
    <div className="grid gap-3.5 sm:grid-cols-2">
      <NewPartField
        id="new-part-stock"
        label={COPY.quantityLabel}
        note={COPY.quantityNote}
        value={stockAvailable}
        onChange={onStockChange}
        type="number"
        inputMode="numeric"
        min="0"
        mono
      />
      <NewPartField
        id="new-part-stock-min"
        label={COPY.minimumLabel}
        value={stockMinimum}
        onChange={onMinimumChange}
        type="number"
        inputMode="numeric"
        min="0"
        mono
      >
        <p className="mt-[7px] text-[11px] leading-snug text-muted-foreground">
          {minimum > 0
            ? COPY.minimumHint(suggestedRestockQuantity(available, minimum))
            : COPY.minimumZeroHint}
        </p>
      </NewPartField>
    </div>
  );
}
