import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ID, IFiscalNote, IPart, ItemLinkMode } from "@/shared/types";
import { computeItemEffect } from "../../engine/postEffects";
import { FISCAL_NOTES_STRINGS } from "../../i18n/pt-BR";

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qty = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

const LINK_STYLE: Record<ItemLinkMode, { label: string; className: string; icon: string }> = {
  auto: {
    label: "Vinculado pelo código",
    className: "border-severity-success/40 text-severity-success",
    icon: "mdi:link-variant",
  },
  ia: {
    label: "Sugestão da IA",
    className: "border-severity-info/40 text-severity-info",
    icon: "mdi:auto-fix",
  },
  novo: { label: "Produto novo", className: "border-primary/40 text-primary", icon: "mdi:plus" },
  pend: {
    label: "Sem vínculo",
    className: "border-severity-critical/40 text-severity-critical",
    icon: "mdi:link-variant-off",
  },
};

export interface INoteItemsTableProps {
  note: IFiscalNote;
  partsById: Map<ID, IPart>;
  readOnly: boolean;
  onOpenItem: (itemId: ID) => void;
}

export function NoteItemsTable({ note, partsById, readOnly, onOpenItem }: INoteItemsTableProps) {
  const s = FISCAL_NOTES_STRINGS.review;

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[820px] border-collapse">
        <thead>
          <tr className="border-b border-border [&>th:not(:last-child)]:border-r [&>th:not(:last-child)]:border-border/70">
            {[
              "Item da nota",
              "Qtd × unitário",
              "Vínculo no catálogo",
              "Estoque (convertido)",
              "",
            ].map((label, index) => (
              <th
                key={index}
                className="px-3 py-2 text-left font-semicond text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {note.items.map((item) => {
            const targetId =
              item.conversionMode === "frac" ? item.conversionTargetPartId : item.partId;
            const target = targetId ? partsById.get(targetId) : undefined;
            const effect = computeItemEffect(item, note, target);
            const link = LINK_STYLE[item.linkMode];

            return (
              <tr
                key={item.id}
                onClick={() => !readOnly && onOpenItem(item.id)}
                className={`border-b border-border last:border-b-0 ${
                  readOnly
                    ? ""
                    : "cursor-pointer transition-colors hover:bg-muted/40 motion-reduce:transition-none"
                }`}
              >
                <td className="max-w-[280px] px-3 py-2">
                  <p className="flex items-center gap-1.5 font-mono text-[11px] text-primary">
                    {item.supplierCode}
                    {item.alert && (
                      <Icon
                        icon="mdi:alert-outline"
                        size={13}
                        className="text-severity-warning"
                        aria-hidden
                      />
                    )}
                  </p>
                  <p className="truncate text-[12.5px] font-medium text-foreground">
                    {item.description}
                  </p>
                  <p className="text-[10.5px] text-muted-foreground">
                    NCM {item.ncm ?? "—"} · CFOP {item.cfop ?? "—"}
                  </p>
                </td>
                <td className="px-3 py-2 align-top">
                  <p className="text-[12.5px] tabular-nums text-muted-foreground">
                    {qty(item.quantity)} {item.unit} × {brl(item.unitValue)}
                  </p>
                  <p className="text-[12.5px] font-bold tabular-nums text-foreground">
                    {brl(item.totalValue)}
                  </p>
                </td>
                <td className="max-w-[220px] px-3 py-2 align-top">
                  <p className="truncate text-[12px] text-muted-foreground">
                    {target
                      ? `${target.sku} — ${target.name}`
                      : (item.newPartDraft?.name ?? "sem produto")}
                  </p>
                  <Badge
                    variant="outline"
                    className={`mt-1 ${item.confirmed ? "border-severity-success/40 text-severity-success" : link.className}`}
                  >
                    <Icon icon={item.confirmed ? "mdi:check" : link.icon} size={11} aria-hidden />
                    {item.confirmed ? "conferido" : link.label}
                    {!item.confirmed && item.aiConfidence ? ` · ${item.aiConfidence}%` : ""}
                  </Badge>
                </td>
                <td className="px-3 py-2 align-top">
                  {effect.stockQuantity !== null ? (
                    <>
                      <p className="text-[12.5px] tabular-nums text-foreground">
                        {item.conversionMode === "direto"
                          ? `${qty(effect.stockQuantity)} ${effect.stockUnit}`
                          : `${qty(item.quantity)} ${item.unit} → ${qty(effect.stockQuantity)} ${effect.stockUnit}`}
                      </p>
                      {effect.unitCost !== null && (
                        <p className="text-[11px] text-muted-foreground">
                          {brl(effect.unitCost)}/{effect.stockUnit} {s.withAllocation}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-[12px] text-severity-critical">{s.defineConversion}</p>
                  )}
                </td>
                <td className="px-3 py-2 text-right align-top">
                  {readOnly ? (
                    <Icon
                      icon="mdi:check"
                      size={16}
                      className="text-severity-success"
                      aria-label="conferido"
                    />
                  ) : (
                    <Button
                      size="sm"
                      variant={item.confirmed ? "outline" : "default"}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenItem(item.id);
                      }}
                    >
                      {item.confirmed ? s.review : s.resolve}
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
