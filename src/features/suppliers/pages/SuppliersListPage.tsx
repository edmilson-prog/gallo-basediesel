import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IPendingSupplier } from "@/shared/types";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { ScrollProgressBar } from "@/features/shell/components/ScrollProgressBar";
import { useSuppliersProvider } from "@/providers/data";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { useSuppliersList, type ISuppliersListFilters } from "../hooks/useSuppliersList";
import { useSuppliersStatsIndex } from "../hooks/useSuppliersStatsIndex";
import { supplierCompleteness } from "../engine/completeness";
import { SuppliersKpiStrip } from "../components/list/SuppliersKpiStrip";
import { SuppliersFiltersBar } from "../components/list/SuppliersFiltersBar";
import { SuppliersTable } from "../components/list/SuppliersTable";
import { SuppliersPendingQueue } from "../components/list/SuppliersPendingQueue";
import {
  OPTIONAL_COLUMNS,
  readVisibleOptional,
  writeVisibleOptional,
  type OptionalColumn,
} from "../utils/columns";
import type { ISuppliersSort } from "../utils/sort";
import { SUPPLIERS_STRINGS } from "../i18n/pt-BR";

const COPY = SUPPLIERS_STRINGS;

/** Anchor the KPI's "Pendentes de cadastro" cell scrolls to — the queue is a
 *  permanent section, never a hidden tab, so there is nothing to filter into,
 *  only to bring on screen. */
const PENDING_QUEUE_ANCHOR_ID = "suppliers-pending-queue";

/**
 * The rail (Task 6), the sheet and the CNPJ-first form dialog (Task 7) are
 * not built here — this page reserves the rail's grid column and passes a
 * no-op for every callback that would otherwise open one of them.
 */
export function SuppliersListPage() {
  const canCreate = usePermission("supplier", "create");
  const provider = useSuppliersProvider();
  const { currentStoreId } = useCurrentStore();

  // --- Filtros e ordenação ---
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [sort, setSort] = useState<ISuppliersSort>({ by: "name", dir: "asc" });
  const [selectedId, setSelectedId] = useState<ID | null>(null);

  // --- Colunas visíveis (persistidas) ---
  const [visibleColumns, setVisibleColumns] = useState<Set<OptionalColumn>>(
    () => new Set(readVisibleOptional()),
  );

  const toggleColumn = useCallback((id: OptionalColumn) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeVisibleOptional(OPTIONAL_COLUMNS.filter((c) => next.has(c)));
      return next;
    });
  }, []);

  const showAllColumns = useCallback(() => {
    const next = new Set(OPTIONAL_COLUMNS);
    writeVisibleOptional(OPTIONAL_COLUMNS);
    setVisibleColumns(next);
  }, []);

  const filters: ISuppliersListFilters = useMemo(() => ({ search, category }), [search, category]);
  const list = useSuppliersList(filters);

  // KPIs e chips de categoria descrevem a BASE (todos os ativos, sem o filtro
  // de busca/categoria), nunca a página filtrada — por isso usam `list.all`.
  const statsEnabled = visibleColumns.has("parts") || visibleColumns.has("purchases");
  const statsIds = useMemo(() => list.all.map((s) => s.id), [list.all]);
  const { index: statsIndex } = useSuppliersStatsIndex(statsIds, statsEnabled);

  // Nomes soltos em `parts.supplier` sem cadastro correspondente — a fila de
  // enriquecimento. `pending` fica `null` enquanto a busca não resolveu
  // (carregando OU falhou): nunca renderiza um "0" fabricado no lugar do
  // valor real.
  const pendingQuery = useQuery({
    queryKey: ["suppliers", "pending", currentStoreId] as const,
    // Non-null assertion is safe: `enabled` below keeps this from running
    // before a store is selected (same pattern as
    // `useConversationTagsHeaderMode`/`useInboxPinsLimit`).
    queryFn: () => provider.pendingFromCatalog(currentStoreId!),
    enabled: currentStoreId !== null,
    staleTime: 60_000,
  });
  const pending = pendingQuery.data ?? null;
  const pendingHasError = Boolean(pendingQuery.error);
  // The whole section — heading, border, padding — disappears together with
  // an empty resolved queue; loading and error states still render (as a
  // skeleton / an error message inside `SuppliersPendingQueue`), so only a
  // confirmed "zero pending" collapses the wrapper, never a fetch in flight.
  const showPendingSection = pendingHasError || pending === null || pending.length > 0;

  const tableRows = useMemo(() => {
    const sorted = [...list.visible];
    sorted.sort((a, b) => {
      let diff = 0;
      switch (sort.by) {
        case "name":
          diff = a.corporateName.localeCompare(b.corporateName, "pt-BR");
          break;
        case "parts":
          diff =
            (statsIndex?.get(a.id)?.linkedParts ?? -1) - (statsIndex?.get(b.id)?.linkedParts ?? -1);
          break;
        case "purchases":
          diff =
            (statsIndex?.get(a.id)?.purchasesLast12Months ?? -1) -
            (statsIndex?.get(b.id)?.purchasesLast12Months ?? -1);
          break;
        case "completeness":
          diff = supplierCompleteness(a).percent - supplierCompleteness(b).percent;
          break;
      }
      return sort.dir === "asc" ? diff : -diff;
    });
    return sorted;
  }, [list.visible, sort, statsIndex]);

  // A tabela expõe seu próprio container rolável (scrollRef) — a linha de
  // progresso o recebe explicitamente, igual ao CatalogListPage.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

  const focusPendingQueue = useCallback(() => {
    document
      .getElementById(PENDING_QUEUE_ANCHOR_ID)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Task 7 liga isto ao `SupplierFormDialog`, aberto com a razão social
  // preenchida a partir do nome pendente. Nenhum diálogo existe ainda.
  const handleRegisterPending = useCallback((_pending: IPendingSupplier) => {}, []);

  return (
    // Viewport-relative height (not `h-full`): a percentage height needs a
    // definite-height ancestor to resolve, and this route renders the page
    // unwrapped (no `DashboardLayout`) specifically so that ancestor chain
    // never exists — same contract CatalogListPage/VehiclesListPage use.
    <div className="flex h-[calc(100vh-4rem-var(--shell-banner-offset,0px))] min-h-0 flex-col bg-background md:h-[calc(100vh-6rem-var(--shell-banner-offset,0px))]">
      {/* Bloco fixo — a linha de progresso acompanha sua borda inferior. */}
      <div className="relative">
        <header className="border-b border-border/40 bg-background/85 shadow-lg shadow-foreground/5 backdrop-blur-2xl backdrop-saturate-[1.8] supports-[backdrop-filter]:bg-background/50">
          <div className="mx-auto w-full max-w-[1360px] px-6 py-5">
            <h1 className="text-2xl font-bold uppercase tracking-tight text-foreground">
              {COPY.page.title}
            </h1>
            <p className="mt-2 max-w-[760px] text-sm text-muted-foreground">
              {COPY.page.description}
            </p>

            <div className="mt-4">
              <SuppliersKpiStrip
                suppliers={list.all}
                statsIndex={statsIndex}
                pendingCount={pending ? pending.length : null}
                onFocusPending={focusPendingQueue}
                hasError={Boolean(list.error)}
              />

              <SuppliersFiltersBar
                suppliers={list.all}
                category={category}
                onCategoryChange={setCategory}
                search={search}
                onSearchChange={setSearch}
                sort={sort}
                onSortChange={setSort}
                canCreate={canCreate}
                onCreate={() => {
                  // Task 7 liga isto ao `SupplierFormDialog`.
                }}
                hasError={Boolean(list.error)}
              />
            </div>
          </div>
        </header>

        <ScrollProgressBar container={scrollEl} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          className="mx-auto grid w-full min-h-0 max-w-[1360px] flex-1 gap-4 px-6 pt-4"
          style={{ gridTemplateColumns: "minmax(0,1fr) 366px" }}
        >
          <div className="min-h-0 min-w-0">
            <SuppliersTable
              suppliers={tableRows}
              statsIndex={statsIndex}
              isLoading={list.isLoading}
              loadError={Boolean(list.error)}
              onRetry={list.refetch}
              selectedId={selectedId}
              onSelect={setSelectedId}
              visibleColumns={visibleColumns}
              onToggleColumn={toggleColumn}
              onShowAllColumns={showAllColumns}
              sort={sort}
              onSortChange={setSort}
              scrollRef={setScrollEl}
            />
          </div>

          {/* Coluna reservada para a ficha lateral (Task 6) — vazia de
              propósito nesta tarefa. */}
          <div className="min-h-0 min-w-0" />
        </div>

        {/* A fila fica ABAIXO da tabela, nunca atrás de uma aba: os dois
            conjuntos — cadastrados e pendentes — ficam visíveis ao mesmo
            tempo, porque a tese da tela é a distância entre eles. A seção
            inteira (borda, título, espaçamento) some junto quando a fila
            está confirmadamente vazia — não só a lista interna. */}
        {showPendingSection && (
          <div
            id={PENDING_QUEUE_ANCHOR_ID}
            className="mx-auto w-full max-w-[1360px] shrink-0 border-t border-border/60 px-6 pb-4 pt-4"
          >
            <SuppliersPendingQueue
              items={pending}
              hasError={pendingHasError}
              onRegister={handleRegisterPending}
            />
          </div>
        )}
      </div>
    </div>
  );
}
