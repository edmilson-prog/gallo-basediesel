import type { ID, ISeller } from "@/shared/types";
import type { ICriterionOutcome, IDistributionContext, IDistributionInput } from "./types";
import { findSpecialtyMatches, getOnlineSellers, selectByLoad, selectByRoundRobin } from "./utils";

function candidate(seller: ISeller, reason: string, selected: boolean) {
  return { sellerId: seller.id, reason, selected };
}

/**
 * Criterion 1 — Carteira.
 *
 * Direct assignment to the seller already owning the customer, irrespective
 * of availability (offline sellers see the conversation waiting when they
 * come back). Leads have no carteira yet, so the criterion always misses.
 */
export function tryCarteira(
  input: IDistributionInput,
  context: IDistributionContext,
): ICriterionOutcome {
  if (input.participant.kind !== "customer") {
    return {
      matched: false,
      candidates: [],
    };
  }
  const sellerId = input.participant.customer.sellerId;
  const seller = context.sellers.find((s) => s.id === sellerId);
  if (!seller) {
    return { matched: false, candidates: [] };
  }
  return {
    matched: true,
    selectedSellerId: seller.id,
    matchedAs: "carteira",
    candidates: [candidate(seller, "carteira existente do cliente", true)],
  };
}

/**
 * Criterion 2 — Especialidade.
 *
 * Matches keywords in the first message against the per-seller specialty list
 * (when provided in the context — falls back to the global keyword catalog so
 * the criterion is useful even without per-seller specialties seeded).
 *
 * Among matching sellers that are currently online, pick the lowest carga.
 */
export function tryEspecialidade(
  input: IDistributionInput,
  context: IDistributionContext,
): ICriterionOutcome {
  const matches = findSpecialtyMatches(input.firstMessageText, context.settings.specialtyKeywords);
  if (matches.length === 0) {
    return { matched: false, candidates: [] };
  }
  const online = getOnlineSellers(context.sellers);
  const matching = online.filter((seller) => {
    const specialties = (context.specialtiesBySeller?.[seller.id] ?? []).map((k) =>
      k.toLowerCase(),
    );
    return matches.some((m) => specialties.includes(m));
  });
  const evaluated = online.map((seller) => {
    const specialties = (context.specialtiesBySeller?.[seller.id] ?? []).map((k) =>
      k.toLowerCase(),
    );
    const hits = matches.filter((m) => specialties.includes(m));
    return candidate(
      seller,
      hits.length > 0
        ? `online, especialidade(s): ${hits.join(", ")}`
        : "online, sem especialidade casando",
      false,
    );
  });
  if (matching.length === 0) {
    return { matched: false, candidates: evaluated };
  }
  const winner = selectByLoad(matching, context.loadBySeller) ?? matching[0];
  return {
    matched: true,
    selectedSellerId: winner.id,
    matchedAs: "especialidade",
    candidates: evaluated.map((c) => (c.sellerId === winner.id ? { ...c, selected: true } : c)),
  };
}

/**
 * Criterion 3 — Round-robin.
 *
 * Evenly distributes across online sellers using a persistent cursor stored in
 * `IDistributionSettings.lastAssignedSellerId`. The cursor itself is mutated by
 * the orchestrator after the engine returns — keeps this function pure.
 */
export function tryRoundRobin(
  _input: IDistributionInput,
  context: IDistributionContext,
): ICriterionOutcome {
  const online = getOnlineSellers(context.sellers);
  if (online.length === 0) return { matched: false, candidates: [] };
  const winner = selectByRoundRobin(online, context.settings.lastAssignedSellerId);
  if (!winner) return { matched: false, candidates: [] };
  const evaluated = online.map((seller) => {
    const load = context.loadBySeller[seller.id] ?? 0;
    return candidate(seller, `online, carga=${load}`, seller.id === winner.id);
  });
  return {
    matched: true,
    selectedSellerId: winner.id,
    matchedAs: "round_robin",
    candidates: evaluated,
  };
}

/**
 * Criterion 4 — Carga.
 *
 * Pure load balancer — picks the seller with the smallest open count.
 * Useful both as a standalone strategy and as a tie-breaker after round-robin.
 */
export function tryCarga(
  _input: IDistributionInput,
  context: IDistributionContext,
): ICriterionOutcome {
  const online = getOnlineSellers(context.sellers);
  if (online.length === 0) return { matched: false, candidates: [] };
  const winner = selectByLoad(online, context.loadBySeller);
  if (!winner) return { matched: false, candidates: [] };
  const evaluated = online.map((seller) => {
    const load = context.loadBySeller[seller.id] ?? 0;
    return candidate(seller, `online, carga=${load}`, seller.id === winner.id);
  });
  return {
    matched: true,
    selectedSellerId: winner.id,
    matchedAs: "carga",
    candidates: evaluated,
  };
}

/**
 * Criterion 5 — Fallback.
 *
 * Branches into `fallback_sdr` (SDR takes the conversation) or `fallback_fila`
 * (no SDR available — conversation lands in the queue with `assignedSellerId`
 * null). The decision depends only on whether the SDR is enabled at this
 * store — which on the MVP is implied by the mode (`sdr_first` / `hybrid`).
 */
export function tryFallback(
  _input: IDistributionInput,
  context: IDistributionContext,
  options: { allowSdr: boolean },
): ICriterionOutcome {
  const offlineCandidates: IDistributionInput[] = [];
  const offline = context.sellers
    .filter((s) => s.active && s.availability !== "online")
    .map((s) =>
      candidate(s, `availability=${s.availability} — não recebe distribuição automática`, false),
    );
  void offlineCandidates;
  if (options.allowSdr) {
    return {
      matched: true,
      selectedSellerId: null,
      matchedAs: "fallback_sdr",
      candidates: [
        ...offline,
        { sellerId: "sdr-agent", reason: "SDR assumiu a conversa", selected: true },
      ],
    };
  }
  return {
    matched: true,
    selectedSellerId: null,
    matchedAs: "fallback_fila",
    candidates: [
      ...offline,
      {
        sellerId: "queue",
        reason: "Nenhum vendedor disponível e SDR desativado — conversa em fila",
        selected: true,
      },
    ],
  };
}

/** Convenience used by the orchestrator when a criterion is disabled. */
export function skipped(reason: string, sellerId: ID = "skipped"): ICriterionOutcome {
  return {
    matched: false,
    candidates: [{ sellerId, reason, selected: false }],
  };
}
