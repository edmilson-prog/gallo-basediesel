import type { ID, ISeller, SdrEscalationMode } from "@/shared/types";

/**
 * Inputs to `chooseHumanSeller()`. Mirrors the shape used by the distribution
 * engine (PRD-013) — sellers + load + specialties + carteira hint. Kept narrow
 * so the function stays pure and easy to test.
 */
export interface IChooseSellerInput {
  storeId: ID;
  sellers: ISeller[];
  /** Open-conversation count per seller — same shape PRD-013 consumes. */
  loadBySeller: Record<ID, number>;
  /** Specialty keywords per seller, lower-cased. Mirrors PRD-013 context. */
  specialtiesBySeller?: Record<ID, string[]>;
  /** Customer's carteira owner — when set the cascade always tries this seller first. */
  carteiraSellerId?: ID;
  /** Brand identified by the SDR (e.g. `volvo`) — used by the specialty step. */
  identifiedBrand?: string;
  /** Coarse mode — `urgent` forces preference for `online` over `ausente`. */
  mode: SdrEscalationMode;
  /** Seller whose availability should be ignored (e.g. SDR agent). */
  excludeSellerIds?: ID[];
}

export interface IChooseSellerOutcome {
  selectedSellerId: ID | null;
  /** Cascade step that produced the winner (or `null` when nobody available). */
  step: "carteira" | "carteira_offline" | "especialidade" | "carga" | "online" | "queue";
  /** True when the chosen seller's specialties matched `identifiedBrand`. */
  specialtyMatched: boolean;
  /** Free-form reasoning for the audit log + inspector. */
  reason: string;
}

const AVAILABILITY_RANK: Record<ISeller["availability"], number> = {
  online: 0,
  ausente: 1,
  ocupado: 2,
  offline: 3,
};

function rankSellers(a: ISeller, b: ISeller, loadBySeller: Record<ID, number>): number {
  const availabilityDiff = AVAILABILITY_RANK[a.availability] - AVAILABILITY_RANK[b.availability];
  if (availabilityDiff !== 0) return availabilityDiff;
  const loadDiff = (loadBySeller[a.id] ?? 0) - (loadBySeller[b.id] ?? 0);
  if (loadDiff !== 0) return loadDiff;
  return a.fullName.localeCompare(b.fullName, "pt-BR");
}

/**
 * Pick the receiving seller for an SDR-initiated handoff.
 *
 * Reuses the PRD-013 cascade with three adaptations:
 *  - **Carteira** always wins on normal/standard — even when the titular seller
 *    is offline (the seller picks it back when they come online).
 *  - **Especialidade** matches the *identified brand*, not generic keyword
 *    extraction from the first message. The PRD-021 result is the single
 *    source of truth here.
 *  - **Urgent** forces preference for `online` sellers — including bypassing
 *    an offline carteira owner.
 *
 * Returns `null` selected when no seller can take the conversation. The caller
 * is responsible for putting the escalation in the queue + scheduling the
 * timeout notification.
 */
export function chooseHumanSeller(input: IChooseSellerInput): IChooseSellerOutcome {
  const excluded = new Set(input.excludeSellerIds ?? []);
  const activeSellers = input.sellers.filter(
    (s) => s.active && !excluded.has(s.id) && s.storeId === input.storeId,
  );
  const eligibleSellers = activeSellers.filter((s) => s.availability !== "offline");

  // Step 1 — carteira.
  if (input.carteiraSellerId) {
    const carteira = activeSellers.find((s) => s.id === input.carteiraSellerId);
    if (carteira) {
      const isOnline = carteira.availability === "online";
      // Urgent: substitute the carteira owner when they aren't online and we
      // have somebody who is.
      if (input.mode === "urgent" && !isOnline) {
        const onlineFallback = pickByBrandThenLoad(
          eligibleSellers.filter((s) => s.availability === "online"),
          input,
        );
        if (onlineFallback) {
          return {
            selectedSellerId: onlineFallback.seller.id,
            step: "online",
            specialtyMatched: onlineFallback.brandMatched,
            reason: `Modo urgente — titular da carteira ${carteira.fullName} está ${carteira.availability}; reatribuído a ${onlineFallback.seller.fullName}.`,
          };
        }
      }
      return {
        selectedSellerId: carteira.id,
        step: carteira.availability === "online" ? "carteira" : "carteira_offline",
        specialtyMatched: matchesBrand(
          input.specialtiesBySeller?.[carteira.id],
          input.identifiedBrand,
        ),
        reason:
          carteira.availability === "online"
            ? "Carteira existente do cliente."
            : `Carteira existente do cliente — ${carteira.fullName} está ${carteira.availability}; aguardará retorno.`,
      };
    }
  }

  if (eligibleSellers.length === 0) {
    return {
      selectedSellerId: null,
      step: "queue",
      specialtyMatched: false,
      reason: "Nenhum vendedor disponível — escalação entra em fila.",
    };
  }

  // Step 2 — especialidade (brand match).
  if (input.identifiedBrand) {
    const matchingSellers = eligibleSellers.filter((s) =>
      matchesBrand(input.specialtiesBySeller?.[s.id], input.identifiedBrand),
    );
    if (matchingSellers.length > 0) {
      const sorted = [...matchingSellers].sort((a, b) => rankSellers(a, b, input.loadBySeller));
      const winner = sorted[0];
      return {
        selectedSellerId: winner.id,
        step: "especialidade",
        specialtyMatched: true,
        reason: `Especialidade matching marca "${input.identifiedBrand}" — ${winner.fullName}.`,
      };
    }
  }

  // Step 3 — carga / availability cascade.
  const sortedByLoad = [...eligibleSellers].sort((a, b) => rankSellers(a, b, input.loadBySeller));
  const winner = sortedByLoad[0];
  return {
    selectedSellerId: winner.id,
    step: winner.availability === "online" ? "online" : "carga",
    specialtyMatched: matchesBrand(input.specialtiesBySeller?.[winner.id], input.identifiedBrand),
    reason: `Cascata de disponibilidade/carga — ${winner.fullName} (${winner.availability}, carga=${input.loadBySeller[winner.id] ?? 0}).`,
  };
}

function pickByBrandThenLoad(
  candidates: ISeller[],
  input: IChooseSellerInput,
): { seller: ISeller; brandMatched: boolean } | null {
  if (candidates.length === 0) return null;
  if (input.identifiedBrand) {
    const matching = candidates.filter((s) =>
      matchesBrand(input.specialtiesBySeller?.[s.id], input.identifiedBrand),
    );
    if (matching.length > 0) {
      const sorted = [...matching].sort((a, b) => rankSellers(a, b, input.loadBySeller));
      return { seller: sorted[0], brandMatched: true };
    }
  }
  const sorted = [...candidates].sort((a, b) => rankSellers(a, b, input.loadBySeller));
  return { seller: sorted[0], brandMatched: false };
}

function matchesBrand(specialties: string[] | undefined, brand: string | undefined): boolean {
  if (!brand || !specialties) return false;
  const needle = brand.trim().toLowerCase();
  if (needle.length === 0) return false;
  return specialties.some((s) => s.toLowerCase() === needle);
}
