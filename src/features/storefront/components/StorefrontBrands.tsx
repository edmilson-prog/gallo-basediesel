import { useNavigate } from "@tanstack/react-router";
import type { IStorefrontBrand } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { STOREFRONT_STRINGS as S } from "../i18n/pt-BR";

export interface IStorefrontBrandsProps {
  brands: IStorefrontBrand[];
}

/**
 * Brand strip below the hero — 5 logos (Iconify placeholders on the MVP).
 * Clicking a brand routes to `/loja/busca?marca=<slug>` (PRD-061 will filter).
 */
export function StorefrontBrands({ brands }: IStorefrontBrandsProps) {
  const navigate = useNavigate();
  if (brands.length === 0) return null;
  return (
    <section aria-label={S.brandsTitle} className="border-y border-border bg-card/50">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <header className="mb-6 text-center">
          <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {S.brandsTitle}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{S.brandsSubtitle}</p>
        </header>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {brands.map((brand) => (
            <li key={brand.slug}>
              <button
                type="button"
                onClick={() => void navigate({ to: "/loja/busca", search: { marca: brand.slug } })}
                className="group flex h-24 w-full flex-col items-center justify-center gap-2 rounded-md border border-border bg-background px-4 transition-colors hover:border-primary/60 hover:bg-primary/5"
              >
                <Icon
                  icon={brand.icon}
                  size={32}
                  className="text-muted-foreground transition-colors group-hover:text-primary"
                  aria-hidden
                />
                <span className="text-sm font-medium text-foreground">{brand.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
