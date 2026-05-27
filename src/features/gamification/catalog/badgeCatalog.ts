import type { IBadgeDefinition } from "@/shared/types";

/**
 * Initial badge catalog seeded into every store (PRD-043).
 *
 * 10 badges spanning the 5 categories and the 4 rarities. Slugs are stable
 * identifiers — generators, engine and UI all key off these strings. Owner
 * can toggle a badge off and tune `bonusPoints` at `/app/configuracoes/gamificacao`,
 * but cannot add new slugs on the MVP (Phase 2 will allow custom badges).
 */
export const DEFAULT_BADGE_CATALOG: IBadgeDefinition[] = [
  {
    slug: "meta-batida",
    name: "Bate-meta",
    description: "Atingiu ao menos uma meta no mês",
    category: "metas",
    rarity: "common",
    icon: "mdi:bullseye-arrow",
    bonusPoints: 50,
    active: true,
  },
  {
    slug: "hat-trick",
    name: "Hat-trick",
    description: "Bateu três metas no mesmo mês",
    category: "metas",
    rarity: "rare",
    icon: "mdi:trophy-award",
    bonusPoints: 150,
    active: true,
  },
  {
    slug: "veterano",
    name: "Veterano",
    description: "Doze metas consecutivas (uma por mês)",
    category: "metas",
    rarity: "epic",
    icon: "mdi:medal-outline",
    bonusPoints: 300,
    active: true,
  },
  {
    slug: "recordista-tri",
    name: "Recordista do Trimestre",
    description: "Fechou o maior pedido pago do trimestre na loja",
    category: "volume",
    rarity: "rare",
    icon: "mdi:cash-100",
    bonusPoints: 200,
    active: true,
  },
  {
    slug: "maratona",
    name: "Maratona",
    description: "Dez pedidos pagos em até 24 horas",
    category: "volume",
    rarity: "rare",
    icon: "mdi:run-fast",
    bonusPoints: 150,
    active: true,
  },
  {
    slug: "cobertura",
    name: "Cobertura",
    description: "Positivou pelo menos 80% da carteira no mês",
    category: "carteira",
    rarity: "common",
    icon: "mdi:account-group-outline",
    bonusPoints: 100,
    active: true,
  },
  {
    slug: "resgatador",
    name: "Resgatador",
    description: "Recuperou três ou mais clientes dormentes no mês",
    category: "carteira",
    rarity: "rare",
    icon: "mdi:account-reactivate",
    bonusPoints: 150,
    active: true,
  },
  {
    slug: "conquistador",
    name: "Conquistador",
    description: "Dez novos clientes atribuídos no mês",
    category: "crescimento",
    rarity: "common",
    icon: "mdi:flag-checkered",
    bonusPoints: 100,
    active: true,
  },
  {
    slug: "big-ticket",
    name: "Big Ticket",
    description: "Ticket médio do mês acima do limiar configurado",
    category: "volume",
    rarity: "epic",
    icon: "mdi:diamond-stone",
    bonusPoints: 300,
    active: true,
  },
  {
    slug: "estrela-ascensao",
    name: "Estrela em Ascensão",
    description: "Subiu pelo menos três posições no ranking mensal",
    category: "ranking",
    rarity: "legendary",
    icon: "mdi:star-shooting",
    bonusPoints: 500,
    active: true,
  },
];

/** Quick `slug → definition` map for engine and UI lookups. */
export const BADGE_CATALOG_BY_SLUG: ReadonlyMap<string, IBadgeDefinition> = new Map(
  DEFAULT_BADGE_CATALOG.map((b) => [b.slug, b]),
);

export function getBadgeDefinition(
  slug: string,
  catalog: IBadgeDefinition[] = DEFAULT_BADGE_CATALOG,
): IBadgeDefinition | undefined {
  return catalog.find((b) => b.slug === slug);
}
