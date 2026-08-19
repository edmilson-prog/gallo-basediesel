import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IPendingSupplier, ISupplier } from "@/shared/types";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { ScrollProgressBar } from "@/features/shell/components/ScrollProgressBar";
import { useSuppliersProvider } from "@/providers/data";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { useSuppliersList, type ISuppliersListFilters } from "../hooks/useSuppliersList";
import { useSuppliersStatsIndex } from "../hooks/useSuppliersStatsIndex";
import { useSupplierStats } from "../hooks/useSupplierStats";
import { supplierCompleteness } from "../engine/completeness";
import { SuppliersKpiStrip } from "../components/list/SuppliersKpiStrip";
import { SuppliersFiltersBar } from "../components/list/SuppliersFiltersBar";
import { SuppliersTable } from "../components/list/SuppliersTable";
import { SupplierRail } from "../components/list/SupplierRail";
import { SuppliersPendingQueue } from "../components/list/SuppliersPendingQueue";
import { SupplierSheet } from "../components/detail/SupplierSheet";
import { SupplierFormDialog } from "../components/detail/SupplierFormDialog";
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

/** What the CNPJ-first form dialog is currently open for — kept separate
 *  from `formOpen` so closing and reopening for a DIFFERENT target (e.g.
 *  "Cadastrar" on a second pending row right after the first) always
 *  re-triggers the dialog's own reset effect via the `open` transition,
 *  regardless of whether `supplier`/`initialCorporateName` happen to differ
 *  from the previous target. */
interface ISupplierFormTarget {
  /** `null` means cadastro. */
  supplier: ISupplier | null;
  /** Only meaningful when `supplier` is `null` — prefills "Razão social"
   *  from the pending queue's row. */
  initialCorporateName?: string;
}

export function SuppliersListPage() {
  const canCreate = usePermission("supplier", "create");
  const canEdit = usePermission("supplier", "edit");
  const provider = useSuppliersProvider();
  const { currentStoreId } = useCurrentStore();

  // --- Filtros e ordenação ---
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [sort, setSort] = useState<ISuppliersSort>({ by: "name", dir: "asc" });
  const [selectedId, setSelectedId] = useState<ID | null>(null);

  // --- Gaveta "Ficha completa" ---
  const [sheetOpen, setSheetOpen] = useState(false);

  // --- Diálogo de cadastro/edição, CNPJ primeiro ---
  const [formOpen, setFormOpen] = useState(false);
  const [formTarget, setFormTarget] = useState<ISupplierFormTarget>({ supplier: null });

  const openCreateForm = useCallback(() => {
    setFormTarget({ supplier: null });
    setFormOpen(true);
  }, []);

  const openEditForm = useCallback((target: ISupplier) => {
    setFormTarget({ supplier: target });
    setFormOpen(true);
  }, []);

  // O gesto central da fila: o nome já é conhecido, só falta o CNPJ — o
  // diálogo abre em modo cadastro com a razão social preenchida (o foco no
  // campo de CNPJ já é o comportamento padrão de `useSupplierDocumentField`
  // a cada abertura, então não precisa de sinalização extra aqui).
  const handleRegisterPending = useCallback((pending: IPendingSupplier) => {
    setFormTarget({ supplier: null, initialCorporateName: pending.displayName });
    setFormOpen(true);
  }, []);

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

  // A ficha lateral nunca fica vazia à toa: seleciona a primeira linha assim
  // que a lista (já filtrada/ordenada) chega e nada foi escolhido ainda — e
  // RE-seleciona quando o item escolhido sai de `tableRows` (filtro de
  // categoria/busca mudou), para a linha destacada na tabela nunca divergir
  // do fornecedor mostrado no rail. Uma seleção que CONTINUA presente na
  // lista filtrada não é tocada.
  useEffect(() => {
    if (selectedId !== null && tableRows.some((s) => s.id === selectedId)) return;
    const [first] = tableRows;
    if (first) setSelectedId(first.id);
  }, [selectedId, tableRows]);

  // Deriva da MESMA lista que a tabela renderiza (`tableRows`, já filtrada e
  // ordenada) — não de `list.visible` — para que a linha destacada na tabela
  // e o fornecedor mostrado no rail nunca divirjam. O fallback para a
  // primeira linha cobre o instante antes do efeito acima rodar.
  const selectedSupplier = useMemo(
    () => tableRows.find((s) => s.id === selectedId) ?? tableRows[0] ?? null,
    [tableRows, selectedId],
  );
  const selectedStats = selectedSupplier ? (statsIndex?.get(selectedSupplier.id) ?? null) : null;

  // A gaveta precisa que `stats` resolva mesmo quando as colunas "parts"/
  // "purchases" estão escondidas (senão o índice em lote acima nunca busca
  // nada e a gaveta fica "carregando" para sempre). Em vez de forçar o
  // índice inteiro por causa de UMA ficha, busca só o fornecedor selecionado
  // — e só quando o índice em lote ainda não tem esse id (evita refetch
  // duplicado quando as colunas já estão visíveis).
  const needsOwnStats = sheetOpen && selectedSupplier !== null && selectedStats === null;
  const { stats: singleSupplierStats } = useSupplierStats(
    selectedSupplier?.id ?? null,
    needsOwnStats,
  );
  const sheetStats = selectedStats ?? singleSupplierStats;

  // A tabela expõe seu próprio container rolável (scrollRef) — a linha de
  // progresso o recebe explicitamente, igual ao CatalogListPage.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

  const focusPendingQueue = useCallback(() => {
    document
      .getElementById(PENDING_QUEUE_ANCHOR_ID)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

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
                onCreate={openCreateForm}
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

          {/* Coluna da ficha lateral — rola por conta própria, independente
              da tabela; sem `DashboardLayout` não existe scroll de página
              para um `sticky` grudar nela. */}
          <div className="min-h-0 min-w-0 overflow-y-auto">
            <SupplierRail
              supplier={selectedSupplier}
              stats={selectedStats}
              canEdit={canEdit}
              onOpenSheet={() => setSheetOpen(true)}
              onEdit={() => selectedSupplier && openEditForm(selectedSupplier)}
            />
          </div>
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
              canCreate={canCreate}
              onRegister={handleRegisterPending}
            />
          </div>
        )}
      </div>

      <SupplierSheet
        supplier={selectedSupplier}
        stats={sheetStats}
        open={sheetOpen}
        canEdit={canEdit}
        onClose={() => setSheetOpen(false)}
        onEdit={() => {
          setSheetOpen(false);
          if (selectedSupplier) openEditForm(selectedSupplier);
        }}
      />

      <SupplierFormDialog
        open={formOpen}
        supplier={formTarget.supplier}
        initialCorporateName={formTarget.initialCorporateName}
        onClose={() => setFormOpen(false)}
        onSaved={(saved) => {
          setFormOpen(false);
          // A ficha lateral e a gaveta passam a refletir o fornecedor recém
          // salvo — sem isto, cadastrar a partir da fila deixaria a seleção
          // atual (potencialmente outro fornecedor) intocada, e o usuário
          // não veria o resultado do próprio "Cadastrar" que acabou de clicar.
          setSelectedId(saved.id);
        }}
      />
    </div>
  );
}
