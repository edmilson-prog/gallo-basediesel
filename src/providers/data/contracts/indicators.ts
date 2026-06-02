import type { ID, IProductIndicator } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListIndicatorsParams extends IPaginationParams {
  storeId?: ID;
  scopeLevel?: IProductIndicator["scopeLevel"];
  sellerId?: ID;
  metric?: IProductIndicator["metric"];
  status?: IProductIndicator["status"];
}

/**
 * Contract for product indicators access.
 *
 * @see ../../../mocks/api/indicators.ts
 */
export interface IIndicatorsProvider {
  list(params?: IListIndicatorsParams): Promise<IPaginatedResult<IProductIndicator>>;
  upsert(indicator: IProductIndicator): Promise<IProductIndicator>;
  update(id: ID, patch: Partial<IProductIndicator>): Promise<IProductIndicator>;
}
