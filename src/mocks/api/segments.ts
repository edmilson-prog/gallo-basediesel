import type { ICustomerSegment, ID, SegmentScope } from "@/shared/types";
import { selectAllSegments } from "../store/selectors";
import { useMockStore } from "../store/mockStore";
import {
  MockNotFoundError,
  MockValidationError,
  paginate,
  runApi,
  type IPaginatedResult,
  type IPaginationParams,
} from "./utils";

export interface IListSegmentsParams extends IPaginationParams {
  scope?: ICustomerSegment["scope"];
  ownerId?: ID;
}

export interface ICreateSegmentApiInput {
  ownerId: ID;
  name: string;
  description?: string;
  scope: SegmentScope;
  filters: Record<string, unknown>;
}

export interface IUpdateSegmentApiInput {
  name?: string;
  description?: string;
  scope?: SegmentScope;
  filters?: Record<string, unknown>;
}

function pushSegment(segment: ICustomerSegment): void {
  useMockStore.setState((state) => ({ segments: [...state.segments, segment] }));
}

function patchSegment(id: ID, patch: IUpdateSegmentApiInput): ICustomerSegment | null {
  let result: ICustomerSegment | null = null;
  useMockStore.setState((state) => {
    const idx = state.segments.findIndex((s) => s.id === id);
    if (idx === -1) return state;
    const next = { ...state.segments[idx], ...patch } as ICustomerSegment;
    result = next;
    return { segments: state.segments.map((s, i) => (i === idx ? next : s)) };
  });
  return result;
}

function removeSegment(id: ID): boolean {
  let removed = false;
  useMockStore.setState((state) => {
    const exists = state.segments.some((s) => s.id === id);
    if (!exists) return state;
    removed = true;
    return { segments: state.segments.filter((s) => s.id !== id) };
  });
  return removed;
}

export const segmentsApi = {
  list(params: IListSegmentsParams = {}): Promise<IPaginatedResult<ICustomerSegment>> {
    return runApi(
      "segmentsApi",
      "list",
      () => {
        let all = selectAllSegments();
        if (params.scope) all = all.filter((s) => s.scope === params.scope);
        if (params.ownerId) all = all.filter((s) => s.ownerId === params.ownerId);
        return paginate(all, params);
      },
      { payload: params },
    );
  },

  async create(input: ICreateSegmentApiInput): Promise<ICustomerSegment> {
    return runApi(
      "segmentsApi",
      "create",
      () => {
        if (!input.name?.trim()) throw new MockValidationError("name is required", "name");
        const created: ICustomerSegment = {
          id: `segment-${crypto.randomUUID()}`,
          ownerId: input.ownerId,
          name: input.name.trim(),
          description: input.description,
          scope: input.scope,
          filters: input.filters,
          createdAt: new Date().toISOString(),
        };
        pushSegment(created);
        return created;
      },
      { payload: input },
    );
  },

  async update(id: ID, patch: IUpdateSegmentApiInput): Promise<ICustomerSegment> {
    return runApi(
      "segmentsApi",
      "update",
      () => {
        const updated = patchSegment(id, patch);
        if (!updated) throw new MockNotFoundError("segment", id);
        return updated;
      },
      { payload: { id, patch } },
    );
  },

  async delete(id: ID): Promise<void> {
    return runApi(
      "segmentsApi",
      "delete",
      () => {
        const removed = removeSegment(id);
        if (!removed) throw new MockNotFoundError("segment", id);
      },
      { payload: { id } },
    );
  },
};
