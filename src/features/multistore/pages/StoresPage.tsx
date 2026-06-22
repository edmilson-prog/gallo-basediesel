import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { ID, IStore } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { recordAuditLogSync, useStoresProvider } from "@/providers/data";
import { Can } from "@/features/rbac/components/Can";
import { useAuth } from "@/features/auth/useAuth";
import { StoreBadge } from "../components/StoreBadge";
import { StoreFormSheet } from "../components/StoreFormSheet";
import { useCurrentStore } from "../hooks/useCurrentStore";

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

function StoreCard({
  row,
  onEdit,
  onToggleActive,
}: {
  row: IStoreRow;
  onEdit: (store: IStore) => void;
  onToggleActive: (store: IStore) => void;
}) {
  const { store, sellersCount, customersCount } = row;
  const inactive = store.isActive === false;
  return (
    <article
      className={`rounded-lg border border-border bg-card p-6 shadow-sm transition-opacity ${
        inactive ? "opacity-60" : ""
      }`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon icon="mdi:store" size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">{store.name}</h2>
              {inactive && (
                <Badge variant="outline" className="text-[10px] uppercase text-muted-foreground">
                  Inativa
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{store.address}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StoreBadge store={store} />
          <Can resource="store" action="edit">
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Editar ${store.name}`}
              onClick={() => onEdit(store)}
            >
              <Icon icon="mdi:pencil-outline" size={18} />
            </Button>
            {store.type !== "matriz" && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={inactive ? `Ativar ${store.name}` : `Desativar ${store.name}`}
                onClick={() => onToggleActive(store)}
              >
                <Icon
                  icon={inactive ? "mdi:store-check-outline" : "mdi:store-off-outline"}
                  size={18}
                />
              </Button>
            )}
          </Can>
        </div>
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
 * Stores listing at /app/configuracoes/lojas (PRD-007 + Bloco A1 da gestão
 * multi-loja Fase 2). Owner cria/edita/desativa filiais e parceiras; demais
 * papéis veem em modo leitura (os botões ficam atrás de `<Can store/edit>`).
 *
 * @see ../MultistoreProvider.tsx
 * @see docs/superpowers/specs/2026-06-19-bloco-a-gestao-lojas-design.md
 */
export function StoresPage() {
  const storesProvider = useStoresProvider();
  const { currentStoreId, refreshStores } = useCurrentStore();
  const { currentUser } = useAuth();
  const [rows, setRows] = useState<IStoreRow[] | null>(null);
  const [sheet, setSheet] = useState<{ open: boolean; store: IStore | null }>({
    open: false,
    store: null,
  });

  const load = useCallback(async () => {
    // One owner-aware RPC for all stores' counts (the per-store RLS would zero
    // out counts for any store other than the active one), instead of N+1 lists.
    const [stores, counts] = await Promise.all([
      storesProvider.list(),
      storesProvider.getMemberCounts().catch(() => []),
    ]);
    const countByStore = new Map(counts.map((c) => [c.storeId, c] as const));
    setRows(
      stores.map((store) => ({
        store,
        sellersCount: countByStore.get(store.id)?.sellersCount ?? 0,
        customersCount: countByStore.get(store.id)?.customersCount ?? 0,
      })),
    );
  }, [storesProvider]);

  useEffect(() => {
    let cancelled = false;
    void load().catch(() => {
      if (!cancelled) setRows([]);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const handleToggleActive = useCallback(
    async (store: IStore) => {
      const next = !(store.isActive ?? true);
      try {
        await storesProvider.setActive(store.id, next);
        recordAuditLogSync({
          storeId: currentStoreId ?? store.id,
          actorId: currentUser?.sellerId ?? currentUser?.id ?? "system",
          action: next ? "store.enable" : "store.disable",
          resource: "store",
          resourceId: store.id,
          after: { isActive: next },
        });
        toast.success(next ? `Loja "${store.name}" ativada.` : `Loja "${store.name}" desativada.`);
        await refreshStores();
        await load();
      } catch (err) {
        toast.error("Não foi possível alterar o status da loja", {
          description: (err as Error).message,
        });
      }
    },
    [storesProvider, refreshStores, load, currentStoreId, currentUser],
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Lojas</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Unidades operacionais da GALLO BASE DIESEL. Crie e gerencie filiais e parceiras; cada
            loja mantém seus próprios dados comerciais.
          </p>
        </div>
        <Can resource="store" action="create">
          <Button onClick={() => setSheet({ open: true, store: null })} className="gap-1.5">
            <Icon icon="mdi:plus" size={16} />
            Nova loja
          </Button>
        </Can>
      </header>

      <section className="space-y-4">
        {rows === null ? (
          <Skeleton className="h-44 w-full rounded-lg" />
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
            Nenhuma loja acessível para o usuário atual.
          </div>
        ) : (
          rows.map((row) => (
            <StoreCard
              key={row.store.id}
              row={row}
              onEdit={(store) => setSheet({ open: true, store })}
              onToggleActive={handleToggleActive}
            />
          ))
        )}
      </section>

      <StoreFormSheet
        store={sheet.store}
        open={sheet.open}
        onOpenChange={(open) => setSheet((prev) => ({ ...prev, open }))}
        onSaved={load}
      />
    </div>
  );
}
