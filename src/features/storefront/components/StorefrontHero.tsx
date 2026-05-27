import { useNavigate } from "@tanstack/react-router";
import type { IStorefrontConfig } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { STOREFRONT_STRINGS as S } from "../i18n/pt-BR";

export interface IStorefrontHeroProps {
  hero: IStorefrontConfig["hero"];
  /** Focuses the header search input — supplied by the page that owns the search ref. */
  onSearchFocus?: () => void;
}

/**
 * Top hero of the public home (PRD-060 RF-007). Headline + subheadline + 2 CTAs
 * plus up to 3 trust indicators. When `backgroundImageUrl` is unset, falls back
 * to a gradient + iconographic placeholder coherent with the PARTS theme.
 */
export function StorefrontHero({ hero, onSearchFocus }: IStorefrontHeroProps) {
  const navigate = useNavigate();
  return (
    <section
      className="relative isolate overflow-hidden bg-gradient-to-br from-primary/95 via-primary to-primary/80 text-primary-foreground"
      aria-label="Apresentação da GALLO PARTS"
      style={
        hero.backgroundImageUrl
          ? {
              backgroundImage: `linear-gradient(120deg, rgba(0,0,0,0.55), rgba(0,0,0,0.2)), url("${hero.backgroundImageUrl}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      {/* Decorative iconography */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-20">
        <Icon icon="mdi:engine" size={420} className="absolute -right-16 -top-10 text-white/30" />
        <Icon
          icon="mdi:car-brake-alert"
          size={220}
          className="absolute -bottom-8 left-1/3 text-white/20"
        />
      </div>

      <div className="relative mx-auto flex max-w-7xl flex-col gap-6 px-4 py-16 sm:py-20 lg:flex-row lg:items-center lg:gap-12 lg:py-24">
        <div className="max-w-2xl space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-white/90 backdrop-blur">
            <Icon icon="mdi:truck-fast" size={14} aria-hidden />
            GALLO BASE DIESEL · PARTS
          </p>
          <h1 className="font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            {hero.headline}
          </h1>
          <p className="text-base text-white/90 sm:text-lg">{hero.subheadline}</p>
          <div className="flex flex-wrap gap-3">
            <Button
              size="lg"
              variant="secondary"
              className="bg-white text-primary hover:bg-white/90"
              onClick={() => {
                if (onSearchFocus) onSearchFocus();
                else void navigate({ to: "/loja/busca" });
              }}
            >
              <Icon icon="mdi:magnify" size={18} className="mr-2" />
              {S.heroPrimaryCta}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
              onClick={() => void navigate({ to: "/loja/busca" })}
            >
              <Icon icon="mdi:view-grid-outline" size={18} className="mr-2" />
              {S.heroSecondaryCta}
            </Button>
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/90">
            {hero.indicators.slice(0, 3).map((indicator) => (
              <li key={indicator} className="flex items-center gap-1.5">
                <Icon icon="mdi:check-circle" size={16} className="text-emerald-200" aria-hidden />
                {indicator}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
