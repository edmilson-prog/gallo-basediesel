import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useSeoMeta } from "@/features/storefront/hooks/useSeoMeta";
import { STOREFRONT_PRODUCT_STRINGS as S } from "../i18n/pt-BR";

export interface IProductNotFoundProps {
  /** Raw slug typed in the URL — surfaced for context only. */
  slug: string;
}

/**
 * 404-style fallback rendered when the URL id doesn't match an existing
 * `IPart` (PRD-063 RF-029). Owns its own SEO so search engines don't index
 * an arbitrary 200 response on missing products.
 */
export function ProductNotFound({ slug }: IProductNotFoundProps) {
  useSeoMeta({
    title: "Produto não encontrado · GALLO PARTS",
    description:
      "A peça solicitada não está disponível em nosso catálogo. Veja outras peças na loja GALLO PARTS.",
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
      <Card className="flex flex-col items-center gap-4 border-dashed border-border bg-muted/30 p-10 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-primary">
          <Icon icon="mdi:cube-off-outline" size={32} aria-hidden />
        </span>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">{S.notFoundTitle}</h1>
          <p className="max-w-md text-sm text-muted-foreground">{S.notFoundDescription}</p>
          {slug.length > 0 && (
            <p className="text-xs text-muted-foreground">
              ID solicitado:{" "}
              <span className="font-mono text-foreground/80">/loja/produto/{slug}</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button asChild variant="outline">
            <Link to="/loja">
              <Icon icon="mdi:arrow-left" size={14} className="mr-1" aria-hidden />
              {S.notFoundBackToStore}
            </Link>
          </Button>
          <Button asChild>
            <Link to="/loja/busca">
              <Icon icon="mdi:magnify" size={14} className="mr-1" aria-hidden />
              {S.notFoundSearchCta}
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
