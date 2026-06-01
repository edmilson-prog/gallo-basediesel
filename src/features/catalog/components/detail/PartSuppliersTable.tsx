import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { formatBRL, formatDateBR } from "@/shared/utils/format";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";

const COPY = CATALOG_STRINGS.detail.suppliers;

export interface IPartSuppliersTableProps {
  part: IPart;
}

export function PartSuppliersTable({ part }: IPartSuppliersTableProps) {
  const suppliers = part.suppliers ?? [];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon icon="mdi:truck-delivery-outline" size={18} className="text-muted-foreground" />
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
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  {COPY.name}
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  {COPY.code}
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  {COPY.invoice}
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  {COPY.date}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {COPY.cost}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {COPY.qty}
                </th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 text-foreground">{s.name}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">
                    {s.supplierCode ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">
                    {s.invoiceNumber ?? "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {formatDateBR(s.invoiceDate)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">
                    {formatBRL(s.cost)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">
                    {s.quantity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
