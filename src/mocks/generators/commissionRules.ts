import type { ICommissionRuleConfig, ID, ISeller } from "@/shared/types";

const SEED_NOW = "2026-01-01T00:00:00.000Z";

/**
 * Seed the configured commission rules for the store (PRD-047):
 *  - one store-wide default at 3%
 *  - one or two per-seller overrides for visual variety (e.g. seller-marina-cardoso
 *    gets 4% with a 100% goal bonus; seller-carlos-mendes gets 3.5%).
 */
export function seedCommissionRules(params: {
  storeId: ID;
  sellers: ISeller[];
  createdBy: ID;
}): ICommissionRuleConfig[] {
  const { storeId, sellers, createdBy } = params;
  const rules: ICommissionRuleConfig[] = [];
  rules.push({
    id: "rule-default-store",
    storeId,
    name: "Taxa padrão da loja",
    baseRate: 0.03,
    validFrom: SEED_NOW,
    isActive: true,
    createdBy,
    createdAt: SEED_NOW,
  });
  const internal = sellers.filter((s) => s.type === "internal" && s.storeId === storeId);
  const marina = internal.find((s) => s.id === "seller-marina-cardoso");
  if (marina) {
    rules.push({
      id: "rule-seller-marina",
      storeId,
      name: `Comissão Top — ${marina.fullName}`,
      sellerId: marina.id,
      baseRate: 0.04,
      goalBonus: {
        goalType: "revenue",
        threshold: 100,
        bonusType: "fixed",
        bonusValue: 500,
      },
      validFrom: SEED_NOW,
      isActive: true,
      createdBy,
      createdAt: SEED_NOW,
    });
  }
  const carlos = internal.find((s) => s.id === "seller-carlos-mendes");
  if (carlos) {
    rules.push({
      id: "rule-seller-carlos",
      storeId,
      name: `Comissão Pleno — ${carlos.fullName}`,
      sellerId: carlos.id,
      baseRate: 0.035,
      goalBonus: {
        goalType: "revenue",
        threshold: 100,
        bonusType: "percentage_points",
        bonusValue: 0.5,
      },
      validFrom: SEED_NOW,
      isActive: true,
      createdBy,
      createdAt: SEED_NOW,
    });
  }
  return rules;
}
