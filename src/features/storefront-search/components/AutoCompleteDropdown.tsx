import { useNavigate } from "@tanstack/react-router";
import type { AutoCompleteSuggestion } from "../hooks/useAutoComplete";
import { Icon } from "@/components/Icon";
import { PartImage } from "@/features/catalog";
import { formatBRL } from "@/shared/utils/format";
import { STOREFRONT_SEARCH_STRINGS as S } from "../i18n/pt-BR";

export interface IAutoCompleteDropdownProps {
  open: boolean;
  query: string;
  suggestions: AutoCompleteSuggestion[];
  onSelectCategory: (slug: string) => void;
  onSelectBrand: (brand: string) => void;
  onSelectProduct: () => void;
  onClose: () => void;
}

export function AutoCompleteDropdown({
  open,
  query,
  suggestions,
  onSelectCategory,
  onSelectBrand,
  onSelectProduct,
  onClose,
}: IAutoCompleteDropdownProps) {
  const navigate = useNavigate();
  if (!open || query.trim().length < 2) return null;

  const products = suggestions.filter((s) => s.kind === "product");
  const categories = suggestions.filter((s) => s.kind === "category");
  const brands = suggestions.filter((s) => s.kind === "brand");

  if (suggestions.length === 0) {
    return (
      <div className="absolute left-0 right-0 top-full z-30 mt-2 rounded-md border border-border bg-popover p-4 text-sm text-muted-foreground shadow-md">
        {S.acEmpty}
      </div>
    );
  }

  return (
    <div
      role="listbox"
      className="absolute left-0 right-0 top-full z-30 mt-2 max-h-[24rem] overflow-y-auto rounded-md border border-border bg-popover p-2 text-sm shadow-md"
    >
      {products.length > 0 && (
        <section className="space-y-1">
          <h4 className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {S.acProductsHeading}
          </h4>
          {products.map((s) => {
            if (s.kind !== "product") return null;
            const oem = s.part.oemCodes?.[0];
            return (
              <button
                key={s.part.id}
                type="button"
                role="option"
                onClick={() => {
                  void navigate({
                    to: "/loja/produto/$slug",
                    params: { slug: s.part.id },
                  });
                  onSelectProduct();
                  onClose();
                }}
                className="flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left transition-colors hover:bg-muted/60"
              >
                <PartImage part={s.part} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {s.part.name}
                  </span>
                  {oem && (
                    <span className="block truncate text-xs text-muted-foreground">
                      OEM <span className="font-mono">{oem}</span>
                    </span>
                  )}
                </span>
                <span className="text-sm font-semibold text-primary">
                  {formatBRL(s.part.unitPrice)}
                </span>
              </button>
            );
          })}
        </section>
      )}

      {categories.length > 0 && (
        <section className="space-y-1">
          <h4 className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {S.acCategoriesHeading}
          </h4>
          {categories.map((s) => {
            if (s.kind !== "category") return null;
            return (
              <button
                key={s.slug}
                type="button"
                role="option"
                onClick={() => {
                  onSelectCategory(s.slug);
                  onClose();
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left transition-colors hover:bg-muted/60"
              >
                <Icon icon={s.icon} size={16} className="text-primary" aria-hidden />
                <span className="text-sm text-foreground">{s.label}</span>
              </button>
            );
          })}
        </section>
      )}

      {brands.length > 0 && (
        <section className="space-y-1">
          <h4 className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {S.acBrandsHeading}
          </h4>
          {brands.map((s) => {
            if (s.kind !== "brand") return null;
            return (
              <button
                key={s.brand}
                type="button"
                role="option"
                onClick={() => {
                  onSelectBrand(s.brand);
                  onClose();
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left transition-colors hover:bg-muted/60"
              >
                <Icon icon="mdi:truck-outline" size={16} className="text-primary" aria-hidden />
                <span className="text-sm text-foreground">{s.brand}</span>
              </button>
            );
          })}
        </section>
      )}
    </div>
  );
}
