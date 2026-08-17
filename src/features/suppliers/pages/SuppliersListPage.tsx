import { useCallback, useMemo, useState } from "react";
import type { ID, SupplierCategory } from "@/shared/types";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { ScrollProgressBar } from "@/features/shell/components/ScrollProgressBar";
import { useSuppliersList, type ISuppliersListFilters } from "../hooks/useSuppliersList";
import { useSuppliersStatsIndex } from "../hooks/useSuppliersStatsIndex";
import { supplierCompleteness } from "../engine/completeness";
import { SuppliersKpiStrip } from "../components/list/SuppliersKpiStrip";
import { SuppliersFiltersBar, type ISuppliersSort } from "../components/list/SuppliersFiltersBar";
import { SuppliersTable } from "../components/list/SuppliersTable";
import {
  OPTIONAL_COLUMNS,
  readVisibleOptional,
  writeVisibleOptional,
  type OptionalColumn,
} from "../utils/columns";
import { SUPPLIERS_STRINGS } from "../i18n/pt-BR";

const COPY = SUPPLIERS_STRINGS;

export function SuppliersListPage() {
  const canCreate = usePermission("supplier", "create");

  // --- Filtros e ordenação ---
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<SupplierCategory | "all">("all");
  const [sort, setSort] = useState<ISuppliersSort>({ by: "name", dir: "asc" });
  const [missingDocumentOnly, setMissingDocumentOnly] = useState(false);
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

  // KPIs e chips de categoria descrevem a BASE (todos os ~126, sem o filtro de
  // busca/documento), nunca a página filtrada — por isso usam `list.all`.
  const statsEnabled = visibleColumns.has("parts") || visibleColumns.has("purchases");
  const statsIds = useMemo(() => list.all.map((s) => s.id), [list.all]);
  const { index: statsIndex } = useSuppliersStatsIndex(statsIds, statsEnabled);

  const tableRows = useMemo(() => {
    const base = missingDocumentOnly ? list.visible.filter((s) => !s.document) : list.visible;
    const sorted = [...base];
    sorted.sort((a, b) => {
      let diff = 0;
      switch (sort.by) {
        case "name":
          diff = a.name.localeCompare(b.name, "pt-BR");
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
  }, [list.visible, missingDocumentOnly, sort, statsIndex]);

  // A tabela expõe seu próprio container rolável (scrollRef) — a linha de
  // progresso o recebe explicitamente, igual ao CatalogListPage.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

  return (
    // Viewport-relative height (not `h-full`): the route wraps this page in
    // `DashboardLayout`, an auto-height padding wrapper, so a percentage
    // height would never resolve — the internal `overflow-hidden`/`overflow-auto`
    // split below needs a REAL bounded height to actually scroll internally
    // (same trick CatalogListPage/VehiclesListPage use, which render unwrapped).
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
                onFilterMissingDocument={() => setMissingDocumentOnly((v) => !v)}
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
                // O diálogo de cadastro chega na Task 8 — o botão fica
                // reservado (mesmo espírito da coluna do rail, Task 7).
                onCreate={() => {}}
              />
            </div>
          </div>
        </header>

        <ScrollProgressBar container={scrollEl} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          className="mx-auto grid w-full min-h-0 max-w-[1360px] flex-1 gap-4 px-6 py-4"
          style={{ gridTemplateColumns: "minmax(0,1fr) 366px" }}
        >
          <div className="min-h-0 min-w-0">
            <SuppliersTable
              suppliers={tableRows}
              statsIndex={statsIndex}
              isLoading={list.isLoading}
              selectedId={selectedId}
              onSelect={setSelectedId}
              visibleColumns={visibleColumns}
              onToggleColumn={toggleColumn}
              onShowAllColumns={showAllColumns}
              scrollRef={setScrollEl}
            />
          </div>

          {/* Coluna reservada para a ficha lateral (SupplierRail, Task 7). */}
          <div className="min-h-0" />
        </div>
      </div>
    </div>
  );
}
