import type { ID, ILead } from "@/shared/types";
import { buildDigitSearchCandidates, digitsOf } from "@/shared/utils/digitSearch";
import { selectAllLeads, selectLeadById } from "../store/selectors";
import { patchById, removeById, upsert } from "../store/mutations";
import {
  MockNotFoundError,
  paginate,
  runApi,
  type IPaginatedResult,
  type IPaginationParams,
} from "./utils";

export interface IListLeadsParams extends IPaginationParams {
  storeId?: ID;
  sellerId?: ID;
  stageId?: ID;
  temperature?: ILead["temperature"];
  search?: string;
}

export const leadsApi = {
  list(params: IListLeadsParams = {}): Promise<IPaginatedResult<ILead>> {
    return runApi(
      "leadsApi",
      "list",
      () => {
        let all = selectAllLeads();
        if (params.storeId) all = all.filter((l) => l.storeId === params.storeId);
        if (params.sellerId) all = all.filter((l) => l.sellerId === params.sellerId);
        if (params.stageId) all = all.filter((l) => l.stage.id === params.stageId);
        if (params.temperature) all = all.filter((l) => l.temperature === params.temperature);
        if (params.search) {
          const q = params.search.toLowerCase();
          const candidates = buildDigitSearchCandidates(params.search);
          all = all.filter(
            (l) =>
              `${l.name} ${l.phone} ${l.email ?? ""}`.toLowerCase().includes(q) ||
              candidates.some((c) => digitsOf(l.phone).includes(c)),
          );
        }
        const sorted = [...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return paginate(sorted, params);
      },
      { payload: params },
    );
  },

  async get(id: ID): Promise<ILead> {
    return runApi("leadsApi", "get", () => {
      const found = selectLeadById(id);
      if (!found) throw new MockNotFoundError("lead", id);
      return found;
    });
  },

  async create(
    input: Omit<ILead, "id" | "createdAt" | "updatedAt" | "conversations">,
  ): Promise<ILead> {
    return runApi("leadsApi", "create", () => {
      const now = new Date().toISOString();
      const lead: ILead = {
        ...input,
        id: `lead-${crypto.randomUUID()}`,
        conversations: [],
        createdAt: now,
        updatedAt: now,
      } as ILead;
      upsert("leads", lead);
      return lead;
    });
  },

  async update(id: ID, patch: Partial<ILead>): Promise<ILead> {
    return runApi("leadsApi", "update", () => {
      const updated = patchById("leads", id, { ...patch, updatedAt: new Date().toISOString() });
      if (!updated) throw new MockNotFoundError("lead", id);
      return updated;
    });
  },

  async delete(id: ID): Promise<void> {
    return runApi("leadsApi", "delete", () => {
      const removed = removeById("leads", id);
      if (!removed) throw new MockNotFoundError("lead", id);
    });
  },
};
