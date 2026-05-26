import type { DistributionMatchedCriterion, ID, IDistributionTrace } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListDistributionTracesParams extends IPaginationParams {
  storeId?: ID;
  selectedSellerId?: ID;
  criterionMatched?: DistributionMatchedCriterion;
  since?: string;
  until?: string;
}

/**
 * Contract for the routing engine's audit trace (PRD-013).
 *
 * Each row records a single distribution decision — winner + every evaluated
 * candidate — so the painel administrativo can answer "why" a conversation
 * landed on a given seller.
 */
export interface IDistributionTracesProvider {
  list(params?: IListDistributionTracesParams): Promise<IPaginatedResult<IDistributionTrace>>;
  get(id: ID): Promise<IDistributionTrace>;
  create(trace: IDistributionTrace): Promise<IDistributionTrace>;
}
