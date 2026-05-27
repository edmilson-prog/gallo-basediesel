import { useStorefrontSettings } from "../hooks/useStorefrontSettings";
import { useSeoMeta } from "../hooks/useSeoMeta";
import { dispatchFocusSearch } from "../components/StorefrontHeader";
import { StorefrontHero } from "../components/StorefrontHero";
import { StorefrontBrands } from "../components/StorefrontBrands";
import { StorefrontCategories } from "../components/StorefrontCategories";
import { StorefrontFeaturedProducts } from "../components/StorefrontFeaturedProducts";
import { StorefrontWhyBuy } from "../components/StorefrontWhyBuy";
import { StorefrontAboutTeaser } from "../components/StorefrontAboutTeaser";

/**
 * Public storefront home (`/loja`) — PRD-060.
 *
 * Renders the page-specific sections (header + footer are owned by
 * `<LojaLayout>` so all `/loja/*` pages share the same shell). The PARTS
 * theme + cart store live in the layout.
 */
export function StorefrontHomePage() {
  const { config } = useStorefrontSettings();

  useSeoMeta({
    title: config.seo.title,
    description: config.seo.description,
    ogImageUrl: config.seo.ogImageUrl,
  });

  return (
    <>
      <StorefrontHero hero={config.hero} onSearchFocus={dispatchFocusSearch} />
      <StorefrontBrands brands={config.brands} />
      <StorefrontCategories categories={config.featuredCategories} />
      <StorefrontFeaturedProducts config={config.featuredProducts} />
      <StorefrontWhyBuy benefits={config.whyBuy} />
      <StorefrontAboutTeaser about={config.about} />
    </>
  );
}
