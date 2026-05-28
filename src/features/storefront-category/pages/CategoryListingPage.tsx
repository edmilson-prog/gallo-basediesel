import { useMemo, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Icon } from "@/components/Icon";
import { ProductCard } from "@/features/storefront-search";
import { useSeoMeta } from "@/features/storefront/hooks/useSeoMeta";
import { useStorefrontSettings } from "@/features/storefront/hooks/useStorefrontSettings";
import { resolveCategorySlug, iconForSlug, nameForSlug } from "../data/slugs";
import type { ICategorySlugMapping } from "../data/slugs";
import { useCategoryFilters } from "../hooks/useCategoryFilters";
import type { CategorySort } from "../hooks/useCategoryFilters";
import { useCategoryResults } from "../hooks/useCategoryResults";
import { CategoryBreadcrumbs } from "../components/CategoryBreadcrumbs";
import { CategoryHeader } from "../components/CategoryHeader";
import { CategoryFilters } from "../components/CategoryFilters";
import { CategoryMobileFiltersSheet } from "../components/CategoryMobileFiltersSheet";
import { CategoryPagination } from "../components/CategoryPagination";
import { CategoryEmptyState } from "../components/CategoryEmptyState";
import { InvalidCategoryFallback } from "../components/InvalidCategoryFallback";
import { STOREFRONT_CATEGORY_STRINGS as S } from "../i18n/pt-BR";

const ROUTE_ID = "/loja/categoria/$slug" as const;

/**
 * `/loja/categoria/:slug` — public catalog listing for one category or
 * one of the curated special listings (PRD-062).
 *
 * Reuses `ProductCard` from PRD-061 and the storefront layout from PRD-060;
 * the responsibility of this page is to (1) resolve the URL slug, (2) wire
 * the URL-synced secondary filters, (3) compose the result grid and SEO.
 */
export function CategoryListingPage() {
  const { slug } = useParams({ from: ROUTE_ID });
  const mapping = useMemo(() => resolveCategorySlug(slug), [slug]);

  if (!mapping) {
    return <InvalidCategoryFallback slug={slug} />;
  }

  return <CategoryListingInner slug={slug} mapping={mapping} />;
}

function CategoryListingInner({ slug, mapping }: { slug: string; mapping: ICategorySlugMapping }) {
  const controller = useCategoryFilters();
  const { config } = useStorefrontSettings();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const categoryConfig = config.categories?.find((c) => c.slug === slug);
  const promotionPartIds = config.categories?.find((c) => c.slug === "promocoes")?.promotionPartIds;

  const results = useCategoryResults({
    mapping,
    filters: controller.state,
    promotionPartIds,
  });

  const label = nameForSlug(slug);
  const icon = iconForSlug(slug);
  const fallbackDescription =
    mapping.kind === "special" ? mapping.defaultDescription : S.headerDefaultDescription(label);
  const description = categoryConfig?.description?.trim() || fallbackDescription;

  // SEO meta — dynamic title per category.
  useSeoMeta({
    title:
      mapping.kind === "special"
        ? `${label} · GALLO PARTS`
        : `${label} para Caminhão — Volvo, Scania, Mercedes e mais · GALLO PARTS`,
    description,
  });

  const showPromotionsBanner =
    mapping.kind === "special" && mapping.special === "promotions" && results.scopeCount === 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 pb-24 sm:py-10 lg:pb-10">
      <CategoryBreadcrumbs label={label} />

      <CategoryHeader
        mapping={mapping}
        label={label}
        icon={icon}
        description={description}
        totalCount={results.totalCount}
        isLoading={results.isLoading}
        onOpenMobileFilters={() => setMobileFiltersOpen(true)}
        activeFilterCount={controller.activeCount}
      />

      {showPromotionsBanner && (
        <Card className="flex items-start gap-3 border-amber-500/40 bg-amber-500/10 p-4">
          <Icon
            icon="mdi:tag-multiple-outline"
            size={20}
            className="mt-0.5 text-amber-700 dark:text-amber-300"
            aria-hidden
          />
          <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-200">
            {S.promotionsEmptyBanner}
          </p>
        </Card>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {results.isLoading ? S.headerLoadingLabel : S.headerCountLabel(results.totalCount)}
        </p>
        <Select
          value={controller.state.sort}
          onValueChange={(v) => controller.setSort(v as CategorySort)}
        >
          <SelectTrigger className="min-w-[180px] bg-background" aria-label={S.sortLabel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="relevance">{S.sortRelevance}</SelectItem>
            <SelectItem value="price-asc">{S.sortPriceAsc}</SelectItem>
            <SelectItem value="price-desc">{S.sortPriceDesc}</SelectItem>
            <SelectItem value="top-selling">{S.sortTopSelling}</SelectItem>
            <SelectItem value="newest">{S.sortNewest}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <div className="hidden lg:block">
          <CategoryFilters
            controller={controller}
            mapping={mapping}
            scopeParts={results.scopeParts}
          />
        </div>

        <div className="space-y-4">
          {results.isError ? (
            <Card className="flex flex-col items-center gap-3 border-destructive/40 bg-destructive/10 p-6 text-sm">
              <Icon icon="mdi:alert-circle-outline" size={28} className="text-destructive" />
              <p className="text-destructive">Não conseguimos carregar os produtos no momento.</p>
              <Button variant="outline" size="sm" onClick={() => controller.reset()}>
                Tentar novamente
              </Button>
            </Card>
          ) : results.isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-72 w-full" />
              ))}
            </div>
          ) : results.pageItems.length === 0 ? (
            <CategoryEmptyState
              activeFilterCount={controller.activeCount}
              onClearFilters={controller.reset}
            />
          ) : (
            <>
              <ul
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                aria-label={label}
              >
                {results.pageItems.map((part) => (
                  <li key={part.id}>
                    <ProductCard part={part} />
                  </li>
                ))}
              </ul>
              <CategoryPagination
                page={Math.min(controller.state.page, results.pageCount)}
                pageCount={results.pageCount}
                onChange={controller.setPage}
              />
            </>
          )}
        </div>
      </div>

      <CategoryMobileFiltersSheet
        open={mobileFiltersOpen}
        onOpenChange={setMobileFiltersOpen}
        controller={controller}
        mapping={mapping}
        scopeParts={results.scopeParts}
        totalCount={results.totalCount}
      />
    </div>
  );
}
