import type { IPart } from "@/shared/types";
import { resolvePriceTables } from "@/features/catalog/utils/pricing";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function PriceChannelsTable({ part }: { part: IPart }) {
  const tables = resolvePriceTables(part);
  if (tables.length === 0) {
    return <p className="text-xs text-muted-foreground">Sem tabela de preços.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
      {tables.map((t) => (
        <div key={t.id} className="flex justify-between text-xs">
          <span className="text-muted-foreground">{t.label}</span>
          <span
            className={`font-semibold tabular-nums ${t.id === "padrao" ? "text-primary" : "text-foreground"}`}
          >
            {BRL.format(t.price)}
          </span>
        </div>
      ))}
    </div>
  );
}
