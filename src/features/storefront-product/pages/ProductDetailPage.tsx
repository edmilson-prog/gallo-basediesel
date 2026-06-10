import { useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { IPart } from "@/shared/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useStorefrontProvider } from "@/providers/data";
import { useSeoMeta } from "@/features/storefront/hooks/useSeoMeta";
import { getCategoryLabel } from "@/features/catalog";
import { formatBRL } from "@/shared/utils/format";
import { ProductBreadcrumbs } from "../components/ProductBreadcrumbs";
import { ProductGallery } from "../components/ProductGallery";
import { ProductInfo } from "../components/ProductInfo";
import { ProductTabs } from "../components/ProductTabs";
import { RelatedProducts } from "../components/RelatedProducts";
import { StickyMobileBar } from "../components/StickyMobileBar";
import { ProductNotFound } from "../components/ProductNotFound";

const ROUTE_ID = "/loja/produto/$slug" as const;
const STALE_MS = 5 * 60 * 1000;

/**
 * `/loja/produto/:slug` — public product detail page (PRD-063).
 *
 * The URL param is named `slug` for SEO parity with the existing route but
 * carries the `IPart.id` directly. A real human-readable slug overlay is
 * scheduled for Fase 2 alongside the SSR/edge rendering work.
 */
export function ProductDetailPage() {
  const { slug } = useParams({ from: ROUTE_ID });
  const storefrontProvider = useStorefrontProvider();

  const partQuery = useQuery({
    queryKey: ["storefront-product", "part", slug] as const,
    queryFn: () => storefrontProvider.getPart(slug),
    staleTime: STALE_MS,
    retry: false,
  });

  return (
    <ProductDetailBody
      slug={slug}
      isLoading={partQuery.isLoading}
      isError={partQuery.isError}
      part={partQuery.data ?? null}
    />
  );
}

interface IProductDetailBodyProps {
  slug: string;
  isLoading: boolean;
  isError: boolean;
  part: IPart | null;
}

function ProductDetailBody({ slug, isLoading, isError, part }: IProductDetailBodyProps) {
  // SEO is set unconditionally when we have a part — the hook is a no-op on
  // the not-found path because we render an early return there.
  const categoryLabel = part ? getCategoryLabel(part.category) : null;
  const oem = part?.oemCodes?.[0];
  const seoTitle = part
    ? oem
      ? `${part.name} — Cód. ${oem} · GALLO PARTS`
      : `${part.name} · GALLO PARTS`
    : "Carregando produto…";
  const seoDescription = part
    ? [
        categoryLabel ? `${categoryLabel} ${part.isOriginal ? "original" : "equivalente"}.` : null,
        part.applications.length > 0
          ? `Compatível com ${truncateBrands(part.applications.map((a) => a.vehicleBrand))}.`
          : null,
        part.stockAvailable > 0 ? "Pronta entrega." : "Indisponível no momento.",
        formatBRL(part.unitPrice) + ".",
      ]
        .filter(Boolean)
        .join(" ")
    : undefined;

  useSeoMeta({ title: seoTitle, description: seoDescription });

  if (isLoading) {
    return <DetailSkeleton />;
  }

  if (isError || !part) {
    return <ProductNotFound slug={slug} />;
  }

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 pb-32 sm:py-10 lg:pb-10">
        <ProductBreadcrumbs category={part.category} productName={part.name} />

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div>
            <ProductGallery part={part} />
          </div>
          <div>
            <ProductInfo part={part} />
          </div>
        </div>

        <Separator />

        <ProductTabs part={part} />

        <Separator />

        <RelatedProducts part={part} />
      </div>

      <StickyMobileBar part={part} />
    </>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:py-10">
      <Skeleton className="h-4 w-48" />
      <div className="grid gap-8 lg:grid-cols-2">
        <Skeleton className="aspect-square w-full" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="mt-6 h-10 w-32" />
          <Skeleton className="mt-4 h-12 w-full max-w-md" />
        </div>
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function truncateBrands(brands: string[]): string {
  const unique = [...new Set(brands)];
  if (unique.length <= 3) return unique.join(", ");
  return `${unique.slice(0, 3).join(", ")} e mais`;
}
