import { Link } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { STOREFRONT_CATEGORY_STRINGS as S } from "../i18n/pt-BR";

export interface ICategoryBreadcrumbsProps {
  /** Active category label (final crumb — not clickable). */
  label: string;
}

/**
 * "Home > [Categoria]" — desktop renders the full path; mobile collapses to a
 * single back-style row with an arrow + label (PRD-062 RF-011/012).
 */
export function CategoryBreadcrumbs({ label }: ICategoryBreadcrumbsProps) {
  return (
    <nav aria-label="Trilha de navegação" className="text-sm text-muted-foreground">
      {/* Mobile — compact back link */}
      <Link
        to="/loja"
        className="inline-flex items-center gap-1 text-primary hover:underline sm:hidden"
      >
        <Icon icon="mdi:chevron-left" size={14} aria-hidden />
        {S.breadcrumbStore}
      </Link>

      {/* Desktop — full trail */}
      <ol className="hidden items-center gap-2 sm:flex">
        <li>
          <Link to="/loja" className="text-primary hover:underline">
            {S.breadcrumbHome}
          </Link>
        </li>
        <li aria-hidden>
          <Icon icon="mdi:chevron-right" size={14} />
        </li>
        <li aria-current="page" className="font-medium text-foreground">
          {label}
        </li>
      </ol>
    </nav>
  );
}
