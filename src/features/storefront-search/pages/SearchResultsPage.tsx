import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePartsProvider } from "@/providers/data";
import { useSeoMeta } from "@/features/storefront";
import { useSearchFilters } from "../hooks/useSearchFilters";
import { useSearchResults } from "../hooks/useSearchResults";
import { ProductCard } from "../components/ProductCard";
import { SearchFilters } from "../components/SearchFilters";
import { SearchHeader } from "../components/SearchHeader";
import { SearchPagination } from "../components/SearchPagination";
import { EmptySearchState } from "../components/EmptySearchState";
import { MobileFiltersSheet } from "../components/MobileFiltersSheet";
import { STOREFRONT_SEARCH_STRINGS as S } from "../i18n/pt-BR";

const STORE_ID = "store-matriz";
const STALE_MS = 5 * 60 * 1000;

/**
 * `/loja/busca` — public catalog search (PRD-061).
 *
 * Owns the orchestration of the URL-synced filter controller, the search
 * engine over the catalog, and the responsive layout (sidebar on desktop /
 * drawer on mobile). Header + footer come from `LojaLayout`.
 */
export function SearchResultsPage() {
  const partsProvider = usePartsProvider();
  const controller = useSearchFilters();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const partsQuery = useQuery({
    queryKey: ["storefront-search", "parts-base"] as const,
    queryFn: async () => {
      const r = await partsProvider.list({ storeId: STORE_ID, pageSize: 2000 });
      return r.data;
    },
    staleTime: STALE_MS,
  });

  const parts = useMemo(() => partsQuery.data ?? [], [partsQuery.data]);
  const results = useSearchResults(controller.state);

  const vehicleBrandOptions = useMemo(() => {
    const set = new Set<string>();
    for (const part of parts) {
      for (const app of part.applications) set.add(app.vehicleBrand);
    }
    return [...set].sort();
  }, [parts]);

  // SEO: include the active query so shared links read well.
  useSeoMeta({
    title: controller.state.q
      ? `${controller.state.q} — Busca · GALLO PARTS`
      : "Busca avançada · GALLO PARTS",
    description:
      "Encontre peças pesadas para Volvo, Scania, Mercedes-Benz, Ford Cargo e Iveco. Filtre por veículo, categoria, fabricante e disponibilidade.",
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 pb-24 sm:py-10 lg:pb-10">
      <SearchHeader
        controller={controller}
        parts={parts}
        vehicleBrandOptions={vehicleBrandOptions}
        totalCount={results.totalCount}
        isLoading={partsQuery.isLoading || results.isLoading}
        onOpenMobileFilters={() => setMobileFiltersOpen(true)}
        activeFilterCount={controller.activeCount}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[18rem_1fr]">
        {/* Sidebar (desktop) */}
        <div className="hidden lg:block">
          <SearchFilters
            controller={controller}
            parts={parts}
            vehicleBrandOptions={vehicleBrandOptions}
          />
        </div>

        {/* Results */}
        <div className="space-y-4">
          {partsQuery.isError ? (
            <Card className="flex flex-col items-center gap-3 border-destructive/40 bg-destructive/10 p-6 text-sm">
              <Icon icon="mdi:alert-circle-outline" size={28} className="text-destructive" />
              <p className="text-destructive">Não conseguimos carregar os produtos no momento.</p>
              <Button variant="outline" size="sm" onClick={() => void partsQuery.refetch()}>
                Tentar novamente
              </Button>
            </Card>
          ) : partsQuery.isLoading || results.isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-72 w-full" />
              ))}
            </div>
          ) : results.pageItems.length === 0 ? (
            <EmptySearchState onClearFilters={controller.reset} />
          ) : (
            <>
              <ul
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                aria-label={S.pageTitle}
              >
                {results.pageItems.map((part) => (
                  <li key={part.id}>
                    <ProductCard part={part} />
                  </li>
                ))}
              </ul>
              <SearchPagination
                page={controller.state.page}
                pageCount={results.pageCount}
                onChange={controller.setPage}
              />
            </>
          )}
        </div>
      </div>

      <MobileFiltersSheet
        open={mobileFiltersOpen}
        onOpenChange={setMobileFiltersOpen}
        controller={controller}
        parts={parts}
        vehicleBrandOptions={vehicleBrandOptions}
        totalCount={results.totalCount}
      />
    </div>
  );
}
