import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useSeoMeta } from "@/features/storefront/hooks/useSeoMeta";
import { KNOWN_CATEGORY_SLUGS, KNOWN_SPECIAL_SLUGS, iconForSlug, nameForSlug } from "../data/slugs";
import { STOREFRONT_CATEGORY_STRINGS as S } from "../i18n/pt-BR";

export interface IInvalidCategoryFallbackProps {
  /** The raw slug the user typed, for context. */
  slug: string;
}

/**
 * 404-style fallback rendered when the URL slug doesn't match any catalog
 * category or special listing (PRD-062 RF-003). Surfaces a curated list of
 * working slugs so the visitor can recover without leaving the storefront.
 */
export function InvalidCategoryFallback({ slug }: IInvalidCategoryFallbackProps) {
  useSeoMeta({
    title: "Categoria não encontrada · GALLO PARTS",
    description:
      "A categoria informada na URL não existe em nosso catálogo. Veja as categorias disponíveis na loja GALLO PARTS.",
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-12 sm:py-16">
      <Card className="flex flex-col items-center gap-4 border-dashed border-border bg-muted/30 p-10 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-primary">
          <Icon icon="mdi:map-marker-question-outline" size={32} aria-hidden />
        </span>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">{S.invalidTitle}</h1>
          <p className="max-w-md text-sm text-muted-foreground">{S.invalidDescription}</p>
          {slug.length > 0 && (
            <p className="text-xs text-muted-foreground">
              URL solicitada:{" "}
              <span className="font-mono text-foreground/80">/loja/categoria/{slug}</span>
            </p>
          )}
        </div>
        <Button asChild variant="outline">
          <Link to="/loja">
            <Icon icon="mdi:arrow-left" size={14} className="mr-1" aria-hidden />
            {S.invalidBackToStore}
          </Link>
        </Button>
      </Card>

      <SuggestionSection title={S.invalidSuggestionsTitle} slugs={KNOWN_CATEGORY_SLUGS} />
      <SuggestionSection title={S.invalidSpecialsTitle} slugs={KNOWN_SPECIAL_SLUGS} />
    </div>
  );
}

function SuggestionSection({ title, slugs }: { title: string; slugs: readonly string[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {slugs.map((slug) => (
          <li key={slug}>
            <Link
              to="/loja/categoria/$slug"
              params={{ slug }}
              className="flex items-center gap-2 rounded-md border border-border bg-card p-3 text-sm transition-colors hover:border-primary/50"
            >
              <Icon icon={iconForSlug(slug)} size={18} className="text-primary" aria-hidden />
              <span>{nameForSlug(slug)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
