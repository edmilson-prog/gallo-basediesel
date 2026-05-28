import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ICategorySlugMapping } from "../data/slugs";
import { STOREFRONT_CATEGORY_STRINGS as S } from "../i18n/pt-BR";

export interface ICategoryHeaderProps {
  mapping: ICategorySlugMapping;
  /** Human-readable label rendered as the H1. */
  label: string;
  /** Iconify name displayed on the banner. */
  icon: string;
  description: string;
  totalCount: number;
  isLoading: boolean;
  onOpenMobileFilters?: () => void;
  activeFilterCount?: number;
}

/**
 * Hero banner of the category page (PRD-062 RF-007–RF-010).
 *
 * Uses the PARTS gradient for regular categories and a contrast accent for the
 * special listings (mais-vendidas / novidades / promocoes). The gradient
 * doubles as the brand cue — no image upload on the MVP.
 */
export function CategoryHeader({
  mapping,
  label,
  icon,
  description,
  totalCount,
  isLoading,
  onOpenMobileFilters,
  activeFilterCount = 0,
}: ICategoryHeaderProps) {
  const isSpecial = mapping.kind === "special";

  // Gradient tones — PARTS primary green for regular, accents for specials.
  const gradient = isSpecial
    ? mapping.special === "promotions"
      ? "from-amber-500/25 via-amber-500/10 to-transparent"
      : mapping.special === "newest"
        ? "from-sky-500/25 via-sky-500/10 to-transparent"
        : "from-primary/25 via-primary/10 to-transparent"
    : "from-primary/25 via-primary/10 to-transparent";

  const badgeTone = isSpecial
    ? mapping.special === "promotions"
      ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
      : mapping.special === "newest"
        ? "bg-sky-500/20 text-sky-700 dark:text-sky-300"
        : "bg-primary/20 text-primary"
    : "bg-primary/20 text-primary";

  return (
    <section
      className={`relative overflow-hidden rounded-lg border border-border bg-gradient-to-br ${gradient} p-6 sm:p-8`}
      aria-label={label}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span
            className={`grid h-14 w-14 shrink-0 place-items-center rounded-full ${badgeTone} shadow-sm`}
            aria-hidden
          >
            <Icon icon={icon} size={28} />
          </span>
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {label}
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
            <div className="pt-1 text-xs font-medium text-foreground/80">
              {isLoading ? (
                <Skeleton className="h-3 w-32" />
              ) : (
                <span>{S.headerCountLabel(totalCount)}</span>
              )}
            </div>
          </div>
        </div>

        {onOpenMobileFilters && (
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenMobileFilters}
            className="self-start bg-background lg:hidden"
          >
            <Icon icon="mdi:filter-variant" size={14} className="mr-1" aria-hidden />
            {S.filtersMobileCta}
            {activeFilterCount > 0 && (
              <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>
        )}
      </div>
    </section>
  );
}
