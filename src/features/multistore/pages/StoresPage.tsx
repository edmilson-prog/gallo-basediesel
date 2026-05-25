import { useEffect, useState } from "react";
import type { ICustomer, ID, ISeller, IStore } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCustomersProvider, useSellersProvider, useStoresProvider } from "@/providers/data";
import { StoreBadge } from "../components/StoreBadge";

interface IStoreRow {
  store: IStore;
  sellersCount: number;
  customersCount: number;
}

const DIVISION_LABELS: Record<string, string> = {
  parts: "Peças",
  service: "Serviço",
  industrial: "Industrial",
};

function StoreCard({ row }: { row: IStoreRow }) {
  const { store, sellersCount, customersCount } = row;
  return (
    <article className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon icon="mdi:store" size={24} />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">{store.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{store.address}</p>
          </div>
        </div>
        <StoreBadge store={store} />
      </header>

      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">CNPJ</dt>
          <dd className="mt-1 font-medium text-foreground">{store.cnpj}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Divisões ativas</dt>
          <dd className="mt-1 flex flex-wrap gap-1">
            {store.activeDivisions.map((d) => (
              <Badge key={d} variant="secondary" className="text-[10px] uppercase">
                {DIVISION_LABELS[d] ?? d}
              </Badge>
            ))}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Vendedores</dt>
          <dd className="mt-1 font-medium text-foreground">{sellersCount}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Clientes</dt>
          <dd className="mt-1 font-medium text-foreground">{customersCount}</dd>
        </div>
      </dl>
    </article>
  );
}

/**
 * Read-only stores listing accessible at /app/configuracoes/lojas (PRD-007).
 *
 * On the MVP only the matriz exists, so the page renders a single card.
 * Filial/parceira CRUD is explicitly out of scope until Fase 2 — surfaced
 * to the user as a discreet hint below the card.
 *
 * @see ../MultistoreProvider.tsx
 */
export function StoresPage() {
  const storesProvider = useStoresProvider();
  const sellersProvider = useSellersProvider();
  const customersProvider = useCustomersProvider();
  const [rows, setRows] = useState<IStoreRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const stores = await storesProvider.list();
      const enriched = await Promise.all(
        stores.map(async (store): Promise<IStoreRow> => {
          const [sellers, customersResult] = await Promise.all([
            sellersProvider.list({ storeId: store.id }).catch(() => [] as ISeller[]),
            customersProvider.list({ storeId: store.id, pageSize: 1 }).catch(() => ({
              data: [] as ICustomer[],
              total: 0,
              page: 1,
              pageSize: 1,
            })),
          ]);
          return {
            store,
            sellersCount: sellers.filter((s) => storeMatches(s.storeId, store.id)).length,
            customersCount: customersResult.total,
          };
        }),
      );
      if (!cancelled) setRows(enriched);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [storesProvider, sellersProvider, customersProvider]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Lojas</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Unidades operacionais da GALLO BASE DIESEL. A modelagem multi-loja está pronta para
            receber filiais e parceiras na Fase 2 — no MVP apenas a matriz está ativa.
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 px-2.5 py-1">
          <Icon icon="mdi:lock-outline" size={14} />
          Somente leitura · gestão na Fase 2
        </Badge>
      </header>

      <section className="space-y-4">
        {rows === null ? (
          <Skeleton className="h-44 w-full rounded-lg" />
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
            Nenhuma loja acessível para o usuário atual.
          </div>
        ) : (
          rows.map((row) => <StoreCard key={row.store.id} row={row} />)
        )}

        <div className="flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <Icon icon="mdi:information-outline" size={14} className="mt-0.5" />
          <p>
            <strong className="font-medium text-foreground">Fase 2:</strong> criação de filiais e
            parceiras, transferência de clientes/vendedores entre lojas e consolidação cross-store
            ficam disponíveis quando a primeira filial entrar em produção.
          </p>
        </div>
      </section>
    </div>
  );
}

function storeMatches(sellerStoreId: ID, storeId: ID): boolean {
  return sellerStoreId === storeId;
}
