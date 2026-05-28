import { Link } from "@tanstack/react-router";
import type { PartCategory } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { getCategoryLabel } from "@/features/catalog";
import { CATEGORY_TO_SLUG } from "@/features/storefront-category/data/slugs";
import { STOREFRONT_PRODUCT_STRINGS as S } from "../i18n/pt-BR";

export interface IProductBreadcrumbsProps {
  category: PartCategory | undefined;
  productName: string;
}

/**
 * Home > [Categoria] > [Produto] trail. Mobile collapses to a single back
 * link pointing at the category (or the storefront when missing).
 */
export function ProductBreadcrumbs({ category, productName }: IProductBreadcrumbsProps) {
  const categoryLabel = category ? getCategoryLabel(category) : null;
  const categorySlug = category ? (CATEGORY_TO_SLUG.get(category) ?? null) : null;

  return (
    <nav aria-label="Trilha de navegação" className="text-sm text-muted-foreground">
      {/* Mobile back link */}
      <Link
        to={categorySlug ? "/loja/categoria/$slug" : "/loja"}
        params={categorySlug ? { slug: categorySlug } : undefined}
        className="inline-flex items-center gap-1 text-primary hover:underline sm:hidden"
      >
        <Icon icon="mdi:chevron-left" size={14} aria-hidden />
        {categoryLabel ?? S.breadcrumbStore}
      </Link>

      {/* Desktop full trail */}
      <ol className="hidden items-center gap-2 sm:flex">
        <li>
          <Link to="/loja" className="text-primary hover:underline">
            {S.breadcrumbHome}
          </Link>
        </li>
        {categoryLabel && categorySlug && (
          <>
            <li aria-hidden>
              <Icon icon="mdi:chevron-right" size={14} />
            </li>
            <li>
              <Link
                to="/loja/categoria/$slug"
                params={{ slug: categorySlug }}
                className="text-primary hover:underline"
              >
                {categoryLabel}
              </Link>
            </li>
          </>
        )}
        <li aria-hidden>
          <Icon icon="mdi:chevron-right" size={14} />
        </li>
        <li aria-current="page" className="line-clamp-1 max-w-[28rem] font-medium text-foreground">
          {productName}
        </li>
      </ol>
    </nav>
  );
}
