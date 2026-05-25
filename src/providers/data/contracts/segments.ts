import type { ICustomerSegment, ID } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListSegmentsParams extends IPaginationParams {
  scope?: ICustomerSegment["scope"];
  ownerId?: ID;
}

/**
 * Contract for saved customer segment access.
 *
 * @see ../../../mocks/api/segments.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface ISegmentsProvider {
  list(params?: IListSegmentsParams): Promise<IPaginatedResult<ICustomerSegment>>;
}
