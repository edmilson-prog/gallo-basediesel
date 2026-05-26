import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";

export function OrdersHeader({
  total,
  searchValue,
  onSearchChange,
}: {
  total: number;
  searchValue: string;
  onSearchChange: (q: string) => void;
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-border bg-card px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Pedidos</h1>
        <p className="text-xs text-muted-foreground">
          {total.toLocaleString("pt-BR")}{" "}
          {total === 1 ? "pedido" : "pedidos"} encontrado{total === 1 ? "" : "s"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative w-full md:w-72">
          <Icon
            icon="mdi:magnify"
            size={16}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            className="pl-8"
            placeholder="Buscar por número, NF ou rastreio…"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>
    </header>
  );
}
