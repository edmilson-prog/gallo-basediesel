import type { IBootstrappedDataset } from "../generators/bootstrap";
import type {
  IAuditLog,
  ICommission,
  IConversation,
  ICustomer,
  ICustomerNote,
  IDistributionTrace,
  IGoal,
  ILead,
  IMessage,
  IOrder,
  IPart,
  IQuote,
  IRecommendation,
  ISdrSession,
  IVehicle,
  ID,
} from "@/shared/types";
import { useMockStore } from "./mockStore";

type CollectionKey =
  | "customers"
  | "leads"
  | "vehicles"
  | "orders"
  | "quotes"
  | "conversations"
  | "messages"
  | "parts"
  | "commissions"
  | "goals"
  | "recommendations"
  | "audits"
  | "distributionTraces"
  | "sdrSessions";

type CollectionMap = {
  customers: ICustomer;
  leads: ILead;
  vehicles: IVehicle;
  orders: IOrder;
  quotes: IQuote;
  conversations: IConversation;
  messages: IMessage;
  parts: IPart;
  commissions: ICommission;
  goals: IGoal;
  recommendations: IRecommendation;
  audits: IAuditLog;
  distributionTraces: IDistributionTrace;
  sdrSessions: ISdrSession;
};

/**
 * Generic upsert (add if new id, patch otherwise) honored by the mock API
 * surface. Keeps the dataset reference stable; the Zustand `set` clones the
 * touched array so React subscribers re-render.
 */
export function upsert<K extends CollectionKey>(
  collection: K,
  item: CollectionMap[K],
): CollectionMap[K] {
  let result = item;
  useMockStore.setState((state) => {
    const list = state[collection] as CollectionMap[K][];
    const index = list.findIndex((it) => it.id === item.id);
    let next: CollectionMap[K][];
    if (index === -1) {
      next = [...list, item];
    } else {
      const merged = { ...list[index], ...item };
      result = merged;
      next = list.map((it, i) => (i === index ? merged : it));
    }
    return { [collection]: next } as unknown as Partial<IBootstrappedDataset>;
  });
  return result;
}

export function patchById<K extends CollectionKey>(
  collection: K,
  id: ID,
  patch: Partial<CollectionMap[K]>,
): CollectionMap[K] | null {
  let result: CollectionMap[K] | null = null;
  useMockStore.setState((state) => {
    const list = state[collection] as CollectionMap[K][];
    const index = list.findIndex((it) => it.id === id);
    if (index === -1) return state;
    const merged = { ...list[index], ...patch } as CollectionMap[K];
    result = merged;
    const next = list.map((it, i) => (i === index ? merged : it));
    return { [collection]: next } as unknown as Partial<IBootstrappedDataset>;
  });
  return result;
}

export function removeById<K extends CollectionKey>(collection: K, id: ID): boolean {
  let removed = false;
  useMockStore.setState((state) => {
    const list = state[collection] as CollectionMap[K][];
    const index = list.findIndex((it) => it.id === id);
    if (index === -1) return state;
    removed = true;
    const next = list.filter((_, i) => i !== index);
    return { [collection]: next } as unknown as Partial<IBootstrappedDataset>;
  });
  return removed;
}

/** Push a note into a customer's inline `notes` array AND the global index. */
export function appendCustomerNote(customerId: ID, note: ICustomerNote): ICustomerNote | null {
  let appended = false;
  useMockStore.setState((state) => {
    const customers = state.customers.map((c) => {
      if (c.id !== customerId) return c;
      appended = true;
      return { ...c, notes: [...c.notes, note] };
    });
    if (!appended) return state;
    return { customers, customerNotes: [...state.customerNotes, note] };
  });
  return appended ? note : null;
}
