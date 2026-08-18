import type { ID, IKitItem, IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/shared/utils/format";
import { KIT_FAMILIES, getStockState, type KitFamily, type StockTone } from "../engine";
import { KitEditorPartLine } from "./KitEditorPartLine";

const STOCK_DOT: Record<StockTone, string> = {
  ok: "bg-severity-success",
  low: "bg-severity-warning",
  out: "bg-severity-critical",
};

export interface IKitSlotLine {
  item: IKitItem;
  part: IPart;
}

export interface IKitFamilySlotProps {
  family: KitFamily;
  /** Curation treats this family as mandatory for the kit's category. */
  required: boolean;
  lines: IKitSlotLine[];
  /** Compatible catalog parts of this family not yet in the composition. */
  candidates: IPart[];
  /** Named in the empty state — the family is missing *for this engine*. */
  engineLabel: string;
  onAdd: (partId: ID, isOptional: boolean) => void;
  onPatch: (partId: ID, patch: Partial<IKitItem>) => void;
  onRemove: (partId: ID) => void;
}

/**
 * One slot of the kit template: the family, what fills it, and the compatible
 * parts that could. The empty required slot is the whole point of direction A —
 * the structure states what is missing instead of leaving the curator to
 * remember that a filter kit needs oil and fuel.
 */
export function KitFamilySlot({
  family,
  required,
  lines,
  candidates,
  engineLabel,
  onAdd,
  onPatch,
  onRemove,
}: IKitFamilySlotProps) {
  const meta = KIT_FAMILIES[family];
  const empty = lines.length === 0;

  return (
    <section
      className={cn(
        "rounded-xl border bg-card px-4 py-3",
        empty && required ? "border-severity-warning/40" : "border-border",
      )}
    >
      <header className="flex flex-wrap items-center gap-2">
        <Icon
          icon={meta.icon}
          size={16}
          className={empty ? "text-muted-foreground/60" : "text-muted-foreground"}
        />
        <span
          className={cn(
            "text-sm font-semibold",
            empty ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {meta.label}
        </span>
        {required && (
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] uppercase",
              empty
                ? "border-severity-warning/40 text-severity-warning"
                : "border-severity-success/40 text-severity-success",
            )}
          >
            {empty ? "obrigatório" : "ok"}
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {lines.length > 0
            ? `${lines.length} ${lines.length === 1 ? "peça" : "peças"}`
            : `${candidates.length} ${candidates.length === 1 ? "compatível" : "compatíveis"} no catálogo`}
        </span>
      </header>

      {lines.map(({ item, part }) => (
        <KitEditorPartLine
          key={part.id}
          item={item}
          part={part}
          onPatch={(patch) => onPatch(part.id, patch)}
          onRemove={() => onRemove(part.id)}
        />
      ))}

      {candidates.length > 0 && (
        <div
          className={cn("flex flex-wrap items-center gap-2", lines.length > 0 ? "mt-2.5" : "mt-2")}
        >
          {empty && <span className="text-xs text-muted-foreground">Compatíveis:</span>}
          {candidates.map((part) => {
            const stock = getStockState(part);
            return (
              <button
                key={part.id}
                type="button"
                // The first part of a family is the base one; the next are suggestions.
                onClick={() => onAdd(part.id, lines.length > 0)}
                title={`${part.name} · ${formatBRL(part.unitPrice)} · ${stock.label}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon icon="mdi:plus" size={12} />
                {part.sku}
                <span className={cn("size-1.5 rounded-full", STOCK_DOT[stock.tone])} />
                <span className="text-muted-foreground">{formatBRL(part.unitPrice)}</span>
              </button>
            );
          })}
        </div>
      )}

      {empty && candidates.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          Nenhuma peça desta família listada para o {engineLabel}. Busque no catálogo abaixo.
        </p>
      )}
    </section>
  );
}
