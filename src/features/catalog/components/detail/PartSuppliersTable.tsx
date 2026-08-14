import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { formatBRL, formatDateBR } from "@/shared/utils/format";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { PartSupplierEntryForm } from "../form/PartSupplierEntryForm";
import { latestSupplier } from "../../utils/restock";
import type { IPartDraft } from "../../utils/draft";
import { PartChip } from "./PartChip";

const COPY = CATALOG_STRINGS.detail.suppliers;

export interface IPartSuppliersTableProps {
  part: IPart;
  editing?: boolean;
  draft?: IPartDraft;
  onDraftChange?: (patch: Partial<IPartDraft>) => void;
  /** Drop the card chrome — the counter layout already wraps the tab body. */
  headless?: boolean;
}

/**
 * Supplier stock-entry history as the row cards from the design kit
 * (`CatSuppliers`): who, which invoice, when — and the cost in the display face.
 */
export function PartSuppliersTable({
  part,
  editing = false,
  draft,
  onDraftChange,
  headless = false,
}: IPartSuppliersTableProps) {
  const suppliers = part.suppliers ?? [];
  const latest = latestSupplier(suppliers);

  return (
    <Shell headless={headless}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon icon="mdi:factory" size={18} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-tight text-foreground">{COPY.title}</h2>
        </div>
        {part.averageCost != null && (
          <span className="text-xs text-muted-foreground">
            {COPY.avgCost}:{" "}
            <span className="font-mono font-semibold text-foreground">
              {formatBRL(part.averageCost)}
            </span>
          </span>
        )}
      </div>

      {suppliers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{COPY.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {suppliers.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 rounded-[9px] border border-border bg-muted/30 px-3 py-2.5"
            >
              <span className="grid size-[34px] shrink-0 place-items-center rounded-md bg-muted">
                <Icon icon="mdi:factory" size={16} className="text-muted-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[13.5px] font-semibold text-foreground">
                    {s.name}
                  </span>
                  {latest?.id === s.id && (
                    <PartChip tone="success" size="sm">
                      {COPY.lastPurchase}
                    </PartChip>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {COPY.entryLine(
                    [
                      s.supplierCode ? `${COPY.code} ${s.supplierCode}` : null,
                      s.invoiceNumber ? `${COPY.invoice} ${s.invoiceNumber}` : null,
                      s.invoiceDate ? formatDateBR(s.invoiceDate) : null,
                      COPY.units(s.quantity),
                    ].filter((v): v is string => Boolean(v)),
                  )}
                </p>
              </div>
              <span className="shrink-0 font-display text-base font-bold tabular-nums text-foreground">
                {formatBRL(s.cost)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {editing && draft && onDraftChange && (
        <PartSupplierEntryForm
          value={draft.newSupplierEntry}
          onChange={(next) => onDraftChange({ newSupplierEntry: next })}
        />
      )}
    </Shell>
  );
}

function Shell({ headless, children }: { headless: boolean; children: React.ReactNode }) {
  if (headless) return <div>{children}</div>;
  return <div className="rounded-lg border border-border bg-card p-4">{children}</div>;
}
