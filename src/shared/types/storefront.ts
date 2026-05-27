import type { ID } from "./common";
import type { PartCategory } from "./part-identification";

/**
 * Configuration of the public storefront (/loja) — PRD-060.
 *
 * Owner edits this from `/app/configuracoes/storefront`. Defaults are seeded so
 * the home renders before any admin action.
 */
export interface IStorefrontConfig {
  /** Hero (top section). */
  hero: {
    headline: string;
    subheadline: string;
    /** Up to 3 trust indicators displayed under the CTAs. */
    indicators: string[];
    /** Optional background image URL — when absent, gradient placeholder. */
    backgroundImageUrl?: string;
  };
  /** Brands attended (logo placeholders). */
  brands: IStorefrontBrand[];
  /** Up to 6 featured categories shown in the home grid. */
  featuredCategories: PartCategory[];
  /** Featured-products selection mode. */
  featuredProducts: {
    mode: "manual" | "top-selling";
    /** Used when mode === 'manual'. Up to 8 part ids. */
    manualPartIds: ID[];
  };
  /** Up to 4 benefits in the "Por que comprar" section. */
  whyBuy: IStorefrontBenefit[];
  /** "Sobre nós" teaser. */
  about: {
    headline: string;
    body: string;
    /** Optional photo URL. */
    photoUrl?: string;
  };
  /** Footer content. */
  footer: {
    /** Contact channels. */
    phone: string;
    whatsapp: string;
    email: string;
    /** Free-text address. */
    address: string;
    /** Social media URLs — null/empty hides the icon. */
    social: {
      instagram?: string;
      facebook?: string;
      youtube?: string;
      linkedin?: string;
    };
    /** Static institutional links — href is required, label optional fallback. */
    institutionalLinks: Array<{ label: string; href: string }>;
  };
  /** SEO meta tags applied to the storefront pages. */
  seo: {
    title: string;
    description: string;
    /** Optional Open Graph image URL. */
    ogImageUrl?: string;
  };
}

export interface IStorefrontBrand {
  /** Stable identifier (lowercase, ASCII). */
  slug: string;
  label: string;
  /** Iconify name — placeholder logo on MVP. */
  icon: string;
}

export interface IStorefrontBenefit {
  icon: string;
  title: string;
  description: string;
}

export const DEFAULT_STOREFRONT_BRANDS: IStorefrontBrand[] = [
  { slug: "volvo", label: "Volvo", icon: "mdi:truck" },
  { slug: "scania", label: "Scania", icon: "mdi:truck-fast" },
  { slug: "mercedes-benz", label: "Mercedes-Benz", icon: "mdi:car-estate" },
  { slug: "ford-cargo", label: "Ford Cargo", icon: "mdi:truck-cargo-container" },
  { slug: "iveco", label: "Iveco", icon: "mdi:tow-truck" },
];

export const DEFAULT_STOREFRONT_BENEFITS: IStorefrontBenefit[] = [
  {
    icon: "mdi:truck-fast",
    title: "Entrega expressa",
    description: "Despacho no mesmo dia para Frederico Westphalen e região.",
  },
  {
    icon: "mdi:warehouse",
    title: "Catálogo amplo",
    description: "Mais de 5.000 itens em estoque, Volvo, Scania, Mercedes, Ford e Iveco.",
  },
  {
    icon: "mdi:whatsapp",
    title: "Atendimento 24/7",
    description: "Suporte via WhatsApp para emergências e pedidos fora de hora.",
  },
  {
    icon: "mdi:swap-horizontal-bold",
    title: "Equivalências inteligentes",
    description: "Opções alternativas e códigos OEM verificados em cada cotação.",
  },
];

export const DEFAULT_STOREFRONT_CONFIG: IStorefrontConfig = {
  hero: {
    headline: "Peças pesadas para diesel — entrega rápida em todo o Sul do Brasil",
    subheadline:
      "Volvo, Scania, Mercedes-Benz, Ford Cargo, Iveco e mais. Catálogo completo, orçamento sob medida.",
    indicators: [
      "5.000+ peças em estoque",
      "Atendimento 24/7 via WhatsApp",
      "Equivalências e códigos OEM verificados",
    ],
  },
  brands: DEFAULT_STOREFRONT_BRANDS,
  featuredCategories: ["filtro", "freio", "correia", "motor", "eletrica", "transmissao"],
  featuredProducts: {
    mode: "top-selling",
    manualPartIds: [],
  },
  whyBuy: DEFAULT_STOREFRONT_BENEFITS,
  about: {
    headline: "Especialistas em peças pesadas há mais de uma década",
    body: "A GALLO BASE DIESEL nasceu em Frederico Westphalen/RS e cresceu junto com a frota brasileira de transporte. Nosso compromisso é manter o caminhão rodando — com peças certificadas, suporte técnico e entrega que acompanha o ritmo do seu negócio.",
  },
  footer: {
    phone: "(55) 3333-0000",
    whatsapp: "(55) 99999-0000",
    email: "comercial@gallobasediesel.com.br",
    address: "Av. Brasil, 1500 — Centro, Frederico Westphalen / RS — CEP 98400-000",
    social: {
      instagram: "https://instagram.com/gallobasediesel",
      facebook: "https://facebook.com/gallobasediesel",
      youtube: "https://youtube.com/@gallobasediesel",
      linkedin: "https://linkedin.com/company/gallobasediesel",
    },
    institutionalLinks: [
      { label: "Termos de uso", href: "/loja/termos" },
      { label: "Política de privacidade", href: "/loja/privacidade" },
      { label: "FAQ", href: "/loja/faq" },
      { label: "Trocas e devoluções", href: "/loja/trocas" },
    ],
  },
  seo: {
    title: "GALLO BASE DIESEL PARTS — Peças pesadas para diesel",
    description:
      "Distribuidora de peças pesadas em Frederico Westphalen/RS. Volvo, Scania, Mercedes-Benz, Ford Cargo, Iveco. Entrega rápida e atendimento 24/7.",
  },
};
