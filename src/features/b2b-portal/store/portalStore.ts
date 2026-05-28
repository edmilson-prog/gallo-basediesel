import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ICustomer, ID, IPortalRequest, IPortalUser } from "@/shared/types";

const STORAGE_KEY = "gallo-portal-b2b-data";
const PORTAL_COMPANY_COUNT = 2;

interface IPortalState {
  users: IPortalUser[];
  requests: IPortalRequest[];
  seeded: boolean;
  seedFromCustomers: (customers: ICustomer[]) => void;
  addUser: (input: Omit<IPortalUser, "id" | "createdAt">) => IPortalUser;
  updateUser: (id: ID, patch: Partial<IPortalUser>) => void;
  removeUser: (id: ID) => void;
  addRequest: (input: Omit<IPortalRequest, "id" | "createdAt" | "status">) => IPortalRequest;
  updateRequest: (id: ID, patch: Partial<IPortalRequest>) => void;
}

function uid(prefix: string): ID {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function companyLabel(c: ICustomer): string {
  return c.type === "B2B" ? c.nomeFantasia || c.razaoSocial : c.fullName;
}

function emailSlug(c: ICustomer): string {
  return companyLabel(c)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 16) || "empresa";
}

/** Deterministic 3-user roster (admin / comprador / visualizador) per company. */
function usersForCompany(c: ICustomer): IPortalUser[] {
  const slug = emailSlug(c);
  const now = c.createdAt;
  return [
    {
      id: `pu-${c.id}-admin`,
      customerId: c.id,
      name: "Gerente de Frota",
      email: `gerente@${slug}.com.br`,
      role: "admin",
      canCreateRequests: true,
      canApproveOrders: true,
      approvalLimit: 50_000,
      canManageFleet: true,
      canViewFinancial: true,
      isActive: true,
      createdAt: now,
    },
    {
      id: `pu-${c.id}-comprador`,
      customerId: c.id,
      name: "Comprador",
      email: `compras@${slug}.com.br`,
      role: "comprador",
      canCreateRequests: true,
      canApproveOrders: false,
      approvalLimit: 5_000,
      canManageFleet: false,
      canViewFinancial: false,
      isActive: true,
      createdAt: now,
    },
    {
      id: `pu-${c.id}-viewer`,
      customerId: c.id,
      name: "Mecânico Chefe",
      email: `oficina@${slug}.com.br`,
      role: "visualizador",
      canCreateRequests: false,
      canApproveOrders: false,
      canManageFleet: false,
      canViewFinancial: false,
      isActive: true,
      createdAt: now,
    },
  ];
}

/**
 * Local-first store for the B2B portal (PRD-071). Portal users are seeded once
 * from the first B2B customers (marking them portal-enabled); requests are
 * created live. Fase 2 replaces this with real providers + Supabase.
 */
export const usePortalStore = create<IPortalState>()(
  persist(
    (set, get) => ({
      users: [],
      requests: [],
      seeded: false,

      seedFromCustomers: (customers) => {
        if (get().seeded) return;
        const companies = customers.filter((c) => c.type === "B2B").slice(0, PORTAL_COMPANY_COUNT);
        const users = companies.flatMap(usersForCompany);
        if (users.length === 0) return;
        set({ users, seeded: true });
      },

      addUser: (input) => {
        const user: IPortalUser = { ...input, id: uid("pu"), createdAt: new Date().toISOString() };
        set({ users: [...get().users, user] });
        return user;
      },
      updateUser: (id, patch) =>
        set({ users: get().users.map((u) => (u.id === id ? { ...u, ...patch } : u)) }),
      removeUser: (id) => set({ users: get().users.filter((u) => u.id !== id) }),

      addRequest: (input) => {
        const request: IPortalRequest = {
          ...input,
          id: uid("preq"),
          status: "aberta",
          createdAt: new Date().toISOString(),
        };
        set({ requests: [request, ...get().requests] });
        return request;
      },
      updateRequest: (id, patch) =>
        set({ requests: get().requests.map((r) => (r.id === id ? { ...r, ...patch } : r)) }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/** The first portal-enabled company id (used as login default). */
export function selectDefaultPortalCompanyId(state: IPortalState): ID | null {
  return state.users[0]?.customerId ?? null;
}

/**
 * Synchronous read of a persisted portal user for route guards (`beforeLoad`),
 * where React hooks are unavailable. Mirrors `readPortalSessionSync`.
 */
export function readPortalUserSync(userId: ID): IPortalUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { users?: IPortalUser[] } };
    return parsed.state?.users?.find((u) => u.id === userId) ?? null;
  } catch {
    return null;
  }
}
