import type { DistributionCriterion, IConversation } from "@/shared/types";
import {
  skipped,
  tryCarga,
  tryCarteira,
  tryEspecialidade,
  tryFallback,
  tryRoundRobin,
} from "./criteria";
import { isWithinBusinessHours } from "./utils";
import type { IDistributionContext, IDistributionInput, IDistributionResult } from "./types";

/**
 * Pure routing engine.
 *
 * Walks the configured cascade in `settings.criteriaOrder`, stopping at the
 * first criterion that produces a winner. Every evaluation — including
 * skipped or losing candidates — is appended to `candidatesEvaluated` so the
 * UI can render the full decision trace.
 *
 * The engine NEVER mutates the settings or the conversation. The orchestrator
 * (mock provider) is responsible for advancing `lastAssignedSellerId` after a
 * round-robin win.
 */
export function distributeConversation(
  input: IDistributionInput,
  context: IDistributionContext,
): IDistributionResult {
  const mode = context.settings.mode;
  const occurredAt = new Date(input.occurredAt);
  const withinHours = isWithinBusinessHours(occurredAt, context.settings.businessHours);

  // Mode shortcuts that bypass the cascade entirely.
  if (mode === "manual") {
    return {
      selectedSellerId: null,
      isSdrActive: false,
      status: "aguardando",
      criterionMatched: "fallback_fila",
      candidatesEvaluated: [
        {
          sellerId: "queue",
          reason: "Modo manual — gestor distribui depois",
          selected: true,
        },
      ],
      mode,
    };
  }

  if (mode === "sdr_first") {
    return {
      selectedSellerId: null,
      isSdrActive: true,
      status: "em_andamento",
      criterionMatched: "fallback_sdr",
      candidatesEvaluated: [
        {
          sellerId: "sdr-agent",
          reason: "Modo SDR-first — SDR atende toda conversa nova",
          selected: true,
        },
      ],
      systemMessage: withinHours ? undefined : context.settings.offHoursMessage,
      mode,
    };
  }

  // Outside business hours → engine forces SDR (carteira preservation matters
  // less when the assignee can't reply anyway).
  if (!withinHours) {
    return {
      selectedSellerId: null,
      isSdrActive: true,
      status: "em_andamento",
      criterionMatched: "fallback_sdr",
      candidatesEvaluated: [
        {
          sellerId: "sdr-agent",
          reason: "Fora do horário comercial — SDR responde automaticamente",
          selected: true,
        },
      ],
      systemMessage: context.settings.offHoursMessage,
      mode,
    };
  }

  const evaluated: IDistributionResult["candidatesEvaluated"] = [];
  // `hybrid` mode: carteira always honored, the rest delegated to the SDR.
  if (mode === "hybrid") {
    const carteiraOutcome = tryCarteira(input, context);
    evaluated.push(...carteiraOutcome.candidates);
    if (carteiraOutcome.matched && carteiraOutcome.selectedSellerId) {
      return buildAssignedResult(carteiraOutcome.selectedSellerId, "carteira", evaluated, mode);
    }
    return {
      selectedSellerId: null,
      isSdrActive: true,
      status: "em_andamento",
      criterionMatched: "fallback_sdr",
      candidatesEvaluated: [
        ...evaluated,
        {
          sellerId: "sdr-agent",
          reason: "Híbrido — sem carteira, SDR atende",
          selected: true,
        },
      ],
      mode,
    };
  }

  // `automatic` mode: full cascade following the configured order.
  for (const criterion of context.settings.criteriaOrder) {
    const enabled = context.settings.criteriaEnabled[criterion];
    if (!enabled && criterion !== "fallback") {
      evaluated.push(...skipped(`Critério "${criterion}" desativado`).candidates);
      continue;
    }
    const outcome = runCriterion(criterion, input, context);
    evaluated.push(...outcome.candidates);
    if (outcome.matched && outcome.selectedSellerId) {
      return buildAssignedResult(
        outcome.selectedSellerId,
        outcome.matchedAs ?? "carga",
        evaluated,
        mode,
      );
    }
    if (outcome.matched && outcome.matchedAs?.startsWith("fallback")) {
      return {
        selectedSellerId: null,
        isSdrActive: outcome.matchedAs === "fallback_sdr",
        status: outcome.matchedAs === "fallback_sdr" ? "em_andamento" : "aguardando",
        criterionMatched: outcome.matchedAs,
        candidatesEvaluated: evaluated,
        mode,
      };
    }
  }

  // Cascade exhausted without a match — emergency fallback ensures we never
  // return without a decision.
  return {
    selectedSellerId: null,
    isSdrActive: false,
    status: "aguardando",
    criterionMatched: "fallback_fila",
    candidatesEvaluated: [
      ...evaluated,
      {
        sellerId: "queue",
        reason: "Cascata esgotada — fila como rede final de segurança",
        selected: true,
      },
    ],
    mode,
  };
}

function runCriterion(
  criterion: DistributionCriterion,
  input: IDistributionInput,
  context: IDistributionContext,
) {
  switch (criterion) {
    case "carteira":
      return tryCarteira(input, context);
    case "especialidade":
      return tryEspecialidade(input, context);
    case "round_robin":
      return tryRoundRobin(input, context);
    case "carga":
      return tryCarga(input, context);
    case "fallback":
      return tryFallback(input, context, {
        allowSdr: context.settings.criteriaEnabled.fallback,
      });
  }
}

function buildAssignedResult(
  sellerId: string,
  matched: IDistributionResult["criterionMatched"],
  evaluated: IDistributionResult["candidatesEvaluated"],
  mode: IDistributionResult["mode"],
): IDistributionResult {
  return {
    selectedSellerId: sellerId,
    isSdrActive: false,
    status: "em_andamento" satisfies IConversation["status"],
    criterionMatched: matched,
    candidatesEvaluated: evaluated,
    mode,
  };
}
