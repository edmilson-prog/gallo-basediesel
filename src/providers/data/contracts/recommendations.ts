import type { ID, IRecommendation } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListRecommendationsParams extends IPaginationParams {
  storeId?: ID;
  sellerId?: ID;
  /** Subject (typically a customerId) the recommendation is about. */
  subjectId?: ID;
  resolved?: boolean;
  /** Single type or set of allowed types. */
  type?: IRecommendation["type"] | IRecommendation["type"][];
}

/**
 * Contract for AI-driven recommendations (next-best-action, etc.).
 *
 * @see ../../../mocks/api/recommendations.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface IRecommendationsProvider {
  list(params?: IListRecommendationsParams): Promise<IPaginatedResult<IRecommendation>>;
  resolve(id: ID): Promise<IRecommendation>;
}
