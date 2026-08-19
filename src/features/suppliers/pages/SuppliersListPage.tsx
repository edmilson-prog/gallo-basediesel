import { useSuppliersList } from "../hooks/useSuppliersList";
import { SUPPLIERS_STRINGS } from "../i18n/pt-BR";

const COPY = SUPPLIERS_STRINGS;

/**
 * Deliberately minimal: this task only wires the sidebar entry, the route and
 * the list hook. The KPI strip, filters, table, pending queue, rail and the
 * CNPJ-first form land on top of this shell in the tasks that follow (see
 * .superpowers/sdd/2026-08-18-convergencia-fornecedor/task-5-brief.md and on).
 */
export function SuppliersListPage() {
  const list = useSuppliersList({ search: "", category: "all" });

  return (
    // Viewport-relative height (not `h-full`): a percentage height needs a
    // definite-height ancestor to resolve, and this route renders the page
    // unwrapped (no `DashboardLayout`) specifically so that ancestor chain
    // never exists — same contract CatalogListPage/VehiclesListPage use.
    <div className="flex h-[calc(100vh-4rem-var(--shell-banner-offset,0px))] min-h-0 flex-col bg-background md:h-[calc(100vh-6rem-var(--shell-banner-offset,0px))]">
      <header className="border-b border-border/40 bg-background/85 shadow-lg shadow-foreground/5 backdrop-blur-2xl backdrop-saturate-[1.8] supports-[backdrop-filter]:bg-background/50">
        <div className="mx-auto w-full max-w-[1360px] px-6 py-5">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-foreground">
            {COPY.page.title}
          </h1>
          <p className="mt-2 max-w-[760px] text-sm text-muted-foreground">
            {COPY.page.description}
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1360px] px-6 py-4">
          {list.isLoading && (
            <p className="text-sm text-muted-foreground">Carregando fornecedores…</p>
          )}

          {!list.isLoading && list.error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive">{COPY.error.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{COPY.error.description}</p>
            </div>
          )}

          {!list.isLoading && !list.error && list.visible.length === 0 && (
            <p className="text-sm text-muted-foreground">{COPY.empty.list}</p>
          )}

          {!list.isLoading && !list.error && list.visible.length > 0 && (
            <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
              {list.visible.map((supplier) => (
                <li key={supplier.id} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium text-foreground">
                    {supplier.corporateName}
                  </span>
                  <span className="text-sm text-muted-foreground">{supplier.cnpj}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
