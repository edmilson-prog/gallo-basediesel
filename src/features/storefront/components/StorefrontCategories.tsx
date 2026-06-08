import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { PartCategory } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { usePartsProvider } from "@/providers/data";
import { getCategoryDescriptor } from "@/features/catalog";
import { STOREFRONT_STRINGS as S } from "../i18n/pt-BR";

export interface IStorefrontCategoriesProps {
  categories: PartCategory[];
}

const STALE_MS = 5 * 60 * 1000;

/**
 * Six-tile grid (responsive) listing the curated featured categories
 * (PRD-060 RF-010/011/012). Counts are pulled from the catalog provider so
 * empty categories don't surface here.
 */
export function StorefrontCategories({ categories }: IStorefrontCategoriesProps) {
  const partsProvider = usePartsProvider();
  const navigate = useNavigate();

  const partsQuery = useQuery({
    queryKey: ["storefront", "category-counts", "00000000-0000-0000-0000-000000000001"] as const,
    queryFn: async () => {
      const r = await partsProvider.list({ storeId: "00000000-0000-0000-0000-000000000001", pageSize: 2000 });
      return r.data;
    },
    staleTime: STALE_MS,
  });

  const countsByCategory = useMemo(() => {
    const map = new Map<PartCategory, number>();
    for (const part of partsQuery.data ?? []) {
      if (!part.category) continue;
      map.set(part.category, (map.get(part.category) ?? 0) + 1);
    }
    return map;
  }, [partsQuery.data]);

  if (categories.length === 0) return null;

  return (
    <section aria-label={S.categoriesTitle} className="bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:py-16">
        <header className="mb-8 flex flex-col items-center gap-1 text-center">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {S.categoriesTitle}
          </h2>
          <p className="text-sm text-muted-foreground">{S.categoriesSubtitle}</p>
        </header>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {categories.map((cat) => {
            const descriptor = getCategoryDescriptor(cat);
            if (!descriptor) return null;
            const count = countsByCategory.get(cat) ?? 0;
            return (
              <Card
                key={cat}
                role="button"
                tabIndex={0}
                onClick={() =>
                  void navigate({
                    to: "/loja/categoria/$slug",
                    params: { slug: cat },
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    void navigate({
                      to: "/loja/categoria/$slug",
                      params: { slug: cat },
                    });
                  }
                }}
                className="group flex cursor-pointer flex-col items-center gap-3 border-border bg-card p-5 text-center transition-shadow hover:border-primary/50 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span
                  className={`grid h-12 w-12 place-items-center rounded-full ${descriptor.tone}`}
                  aria-hidden
                >
                  <Icon icon={descriptor.icon} size={24} />
                </span>
                <span className="text-sm font-semibold text-foreground">{descriptor.label}</span>
                {partsQuery.isLoading ? (
                  <Skeleton className="h-3 w-16" />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {S.categoriesItemsLabel(count)}
                  </span>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
