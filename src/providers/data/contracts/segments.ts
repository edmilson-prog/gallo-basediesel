import type { ICustomerSegment, ID, SegmentScope } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListSegmentsParams extends IPaginationParams {
  scope?: ICustomerSegment["scope"];
  ownerId?: ID;
}

export interface ICreateSegmentInput {
  ownerId: ID;
  name: string;
  description?: string;
  scope: SegmentScope;
  filters: Record<string, unknown>;
}

export interface IUpdateSegmentInput {
  name?: string;
  description?: string;
  scope?: SegmentScope;
  filters?: Record<string, unknown>;
}

/**
 * Contract for saved customer segment access.
 *
 * @see ../../../mocks/api/segments.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface ISegmentsProvider {
  list(params?: IListSegmentsParams): Promise<IPaginatedResult<ICustomerSegment>>;
  create(input: ICreateSegmentInput): Promise<ICustomerSegment>;
  update(id: ID, patch: IUpdateSegmentInput): Promise<ICustomerSegment>;
  delete(id: ID): Promise<void>;
}
