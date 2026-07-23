import type { ID, IConversation, ILead, ILeadNote } from "@/shared/types";
import { buildDigitSearchCandidates, digitsOf } from "@/shared/utils/digitSearch";
import { selectAllConversations, selectAllLeads, selectLeadById } from "../store/selectors";
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

const OPEN_CONVERSATION_STATUSES: IConversation["status"][] = [
  "aguardando",
  "em_andamento",
  "aguardando_cliente",
];

/**
 * Conversion side-effect — mirrors the DB trigger
 * `reanchor_converted_lead_conversations` (migration 20260723211000): every
 * webhook resolver checks customer BEFORE lead, so once the lead is converted
 * a lead-anchored conversation becomes invisible to the lookups and the next
 * message would mint a duplicate. Keeps at most ONE open conversation per
 * (customer, WhatsApp account) — the same guarantee the partial unique index
 * (migration 20260723210000) enforces in Supabase.
 */
function reanchorConvertedLeadConversations(leadId: ID, customerId: ID): void {
  const ofLead = selectAllConversations().filter((c) => c.leadId === leadId);
  if (ofLead.length === 0) return;
  const isOpen = (c: IConversation) => OPEN_CONVERSATION_STATUSES.includes(c.status);

  // a) Among the lead's own open conversations, only the newest per account
  //    survives open (pre-guard race leftovers).
  const newestOpenByAccount = new Map<ID, IConversation>();
  for (const conv of ofLead) {
    if (!isOpen(conv) || !conv.whatsappAccountId) continue;
    const current = newestOpenByAccount.get(conv.whatsappAccountId);
    if (!current || conv.lastMessageAt > current.lastMessageAt) {
      newestOpenByAccount.set(conv.whatsappAccountId, conv);
    }
  }

  // b) Accounts where the destination customer already has an open thread —
  //    the lead's open conversation there archives (traffic already flows to
  //    the customer's thread; history migrates with the re-anchor anyway).
  const customerOpenAccounts = new Set(
    selectAllConversations()
      .filter((c) => c.customerId === customerId && isOpen(c) && c.whatsappAccountId)
      .map((c) => c.whatsappAccountId as ID),
  );

  for (const conv of ofLead) {
    const mustArchive =
      isOpen(conv) &&
      conv.whatsappAccountId !== undefined &&
      (newestOpenByAccount.get(conv.whatsappAccountId)?.id !== conv.id ||
        customerOpenAccounts.has(conv.whatsappAccountId));
    patchById("conversations", conv.id, {
      customerId,
      leadId: undefined,
      ...(mustArchive
        ? { status: "arquivada" as const, assignedSellerId: undefined, isSdrActive: false }
        : {}),
    });
  }
}

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
      const before = selectLeadById(id);
      const updated = patchById("leads", id, { ...patch, updatedAt: new Date().toISOString() });
      if (!updated) throw new MockNotFoundError("lead", id);
      if (
        patch.convertedToCustomerId &&
        patch.convertedToCustomerId !== before?.convertedToCustomerId
      ) {
        reanchorConvertedLeadConversations(id, patch.convertedToCustomerId);
      }
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
