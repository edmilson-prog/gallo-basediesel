import type { ID, ILead, ILeadNote } from "@/shared/types";
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

/** In-memory notes store, keyed by lead id. */
const leadNotes = new Map<string, ILeadNote[]>();

export interface IListLeadsParams extends IPaginationParams {
  storeId?: ID;
  sellerId?: ID;
  stageId?: ID;
  temperature?: ILead["temperature"];
  search?: string;
  /** When true, excludes leads with a `lossReason` set. Mirrors the
   *  supabase impl's `.is("loss_reason", null)` filter. */
  excludeLost?: boolean;
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
        if (params.excludeLost) all = all.filter((l) => l.lossReason === undefined);
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

  async listNotes(leadId: ID): Promise<ILeadNote[]> {
    return [...(leadNotes.get(leadId) ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async addNote(leadId: ID, content: string, authorId: ID): Promise<ILeadNote> {
    const note: ILeadNote = {
      id: `lead-note-${crypto.randomUUID()}`,
      authorId,
      content,
      createdAt: new Date().toISOString(),
    };
    leadNotes.set(leadId, [...(leadNotes.get(leadId) ?? []), note]);
    return note;
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
