import { useNavigate } from "@tanstack/react-router";
import type { IStorefrontConfig } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { PartImage } from "@/features/catalog";
import { formatBRL } from "@/shared/utils/format";
import { useFeaturedProducts, type IFeaturedProduct } from "../hooks/useFeaturedProducts";
import { STOREFRONT_STRINGS as S } from "../i18n/pt-BR";

export interface IStorefrontFeaturedProductsProps {
  config: IStorefrontConfig["featuredProducts"];
}

/**
 * Eight-card grid of featured products (PRD-060 RF-013–RF-016).
 *
 * Source defined by the `featuredProducts.mode` setting:
 * `manual` honors the curated list; `top-selling` ranks by quantity sold
 * over the last 90 days. Cards click through to the product page.
 */
export function StorefrontFeaturedProducts({ config }: IStorefrontFeaturedProductsProps) {
  const { products, isLoading, isError } = useFeaturedProducts(config);

  return (
    <section aria-label={S.featuredTitle} className="bg-card/40">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:py-16">
        <header className="mb-8 flex flex-col items-center gap-1 text-center">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {S.featuredTitle}
          </h2>
          <p className="text-sm text-muted-foreground">{S.featuredSubtitle}</p>
        </header>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-72 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center rounded-md border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
            <Icon icon="mdi:alert-circle-outline" size={18} className="mr-2" />
            Não foi possível carregar os destaques no momento.
          </div>
        ) : products.length === 0 ? (
          <div className="flex items-center justify-center rounded-md border border-border bg-muted/40 p-8 text-sm text-muted-foreground">
            {S.featuredEmpty}
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((product) => (
              <li key={product.id}>
                <FeaturedCard product={product} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function FeaturedCard({ product }: { product: IFeaturedProduct }) {
  const navigate = useNavigate();
  const oem = product.oemCodes?.[0];

  const badgeLabel =
    product.badge === "top-selling"
      ? S.featuredBadgeTopSelling
      : product.badge === "new"
        ? S.featuredBadgeNew
        : product.badge === "deal"
          ? S.featuredBadgeDeal
          : null;

  const badgeTone =
    product.badge === "top-selling"
      ? "bg-primary text-primary-foreground"
      : product.badge === "new"
        ? "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30"
        : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";

  return (
    <Card className="flex h-full flex-col gap-3 border-border bg-background p-4 transition-shadow hover:shadow-md">
      <div className="relative">
        <PartImage part={product} size="lg" className="h-32 w-full rounded-md" />
        {badgeLabel && (
          <Badge variant="outline" className={`absolute left-2 top-2 ${badgeTone}`}>
            {badgeLabel}
          </Badge>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {product.brand}
        </p>
        <h3 className="line-clamp-2 text-sm font-semibold text-foreground">{product.name}</h3>
        {oem && (
          <p className="text-xs text-muted-foreground">
            OEM: <span className="font-mono">{oem}</span>
          </p>
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        <p className="text-lg font-semibold text-primary">{formatBRL(product.unitPrice)}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            void navigate({
              to: "/loja/produto/$slug",
              params: { slug: product.id },
            })
          }
        >
          {S.featuredCardCta}
          <Icon icon="mdi:arrow-right" size={14} className="ml-1" />
        </Button>
      </div>
    </Card>
  );
}
