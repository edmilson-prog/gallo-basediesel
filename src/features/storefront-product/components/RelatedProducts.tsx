import type { IPart } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "@/features/storefront-search";
import { useRelatedProducts } from "../hooks/useRelatedProducts";
import { STOREFRONT_PRODUCT_STRINGS as S } from "../i18n/pt-BR";

export interface IRelatedProductsProps {
  part: IPart;
}

/**
 * 4-up grid below the product detail page — reuses `ProductCard` from
 * PRD-061 so the visual contract stays in one place (PRD-063 RF-016/018).
 */
export function RelatedProducts({ part }: IRelatedProductsProps) {
  const { related, isLoading } = useRelatedProducts(part);

  if (!isLoading && related.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4" aria-label={S.relatedTitle}>
      <header className="space-y-0.5">
        <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {S.relatedTitle}
        </h2>
        <p className="text-sm text-muted-foreground">{S.relatedSubtitle}</p>
      </header>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-72 w-full" />
          ))}
        </div>
      ) : related.length === 0 ? (
        <Card className="border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          {S.relatedEmpty}
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {related.map((rp) => (
            <li key={rp.id}>
              <ProductCard part={rp} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
