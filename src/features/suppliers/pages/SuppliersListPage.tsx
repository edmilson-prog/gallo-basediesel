import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useSuppliersList, type ISuppliersListFilters } from "../hooks/useSuppliersList";
import { SUPPLIERS_STRINGS } from "../i18n/pt-BR";

const COPY = SUPPLIERS_STRINGS;

export function SuppliersListPage() {
  const [filters] = useState<ISuppliersListFilters>({ search: "", category: "all" });
  const { visible, isLoading } = useSuppliersList(filters);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="sticky top-0 z-20 border-b border-border/40 bg-background/85 shadow-lg shadow-foreground/5 backdrop-blur-2xl backdrop-saturate-[1.8] supports-[backdrop-filter]:bg-background/50">
        <div className="mx-auto w-full max-w-[1360px] px-6 py-5">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-foreground">
            {COPY.page.title}
          </h1>
          <p className="mt-2 max-w-[760px] text-sm text-muted-foreground">
            {COPY.page.description}
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1360px] flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">{COPY.empty.list}</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {visible.map((supplier) => (
              <li key={supplier.id} className="px-4 py-3 text-sm text-foreground">
                {supplier.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
