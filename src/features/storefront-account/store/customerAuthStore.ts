import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ICustomer, ICustomerAddress, ID } from "@/shared/types";

const STORAGE_KEY = "gallo-storefront-customer-auth";
const SESSION_TTL_DAYS = 30;

export interface ICustomerSavedAddress extends ICustomerAddress {
  id: ID;
  label?: string;
  isDefault: boolean;
}

export interface ICustomerSession {
  customerId: ID;
  loggedInAt: string;
  expiresAt: string;
}

export interface ICustomerAuthState {
  session: ICustomerSession | null;
  /** Snapshot of the customer attached to the session. Refreshed by hook on hydrate. */
  customer: ICustomer | null;
  /** Local-only multi-address store keyed by customer id. */
  savedAddresses: Record<ID, ICustomerSavedAddress[]>;
  setSession: (customer: ICustomer) => void;
  setCustomer: (customer: ICustomer | null) => void;
  clearSession: () => void;
  addSavedAddress: (
    customerId: ID,
    address: ICustomerAddress & { label?: string },
  ) => ICustomerSavedAddress;
  updateSavedAddress: (
    customerId: ID,
    addressId: ID,
    patch: Partial<ICustomerAddress> & { label?: string },
  ) => void;
  removeSavedAddress: (customerId: ID, addressId: ID) => void;
  setDefaultAddress: (customerId: ID, addressId: ID) => void;
  getSavedAddresses: (customerId: ID) => ICustomerSavedAddress[];
}

function newAddressId(): ID {
  return `addr-${Math.random().toString(36).slice(2, 10)}`;
}

function computeExpiry(): string {
  const exp = new Date();
  exp.setDate(exp.getDate() + SESSION_TTL_DAYS);
  return exp.toISOString();
}

/**
 * Customer-side auth state (PRD-065).
 *
 * Distinct from the staff `AuthProvider` (PRD-006) — this powers the public
 * storefront's `/loja/conta/*` area. Persists the session id and a snapshot
 * of the customer so route guards can render before the customers provider
 * refetches. Saved addresses are kept here as a UI-level extension of
 * `ICustomer.address`; Fase 2 will normalize this in Supabase.
 */
export const useCustomerAuthStore = create<ICustomerAuthState>()(
  persist(
    (set, get) => ({
      session: null,
      customer: null,
      savedAddresses: {},

      setSession: (customer) => {
        const session: ICustomerSession = {
          customerId: customer.id,
          loggedInAt: new Date().toISOString(),
          expiresAt: computeExpiry(),
        };

        const existing = get().savedAddresses[customer.id] ?? [];
        let nextAddresses = existing;
        if (existing.length === 0 && customer.address) {
          nextAddresses = [
            {
              id: newAddressId(),
              label: "Endereço principal",
              isDefault: true,
              ...customer.address,
            },
          ];
        }

        set({
          session,
          customer,
          savedAddresses: {
            ...get().savedAddresses,
            [customer.id]: nextAddresses,
          },
        });
      },

      setCustomer: (customer) => set({ customer }),

      clearSession: () => set({ session: null, customer: null }),

      addSavedAddress: (customerId, address) => {
        const list = get().savedAddresses[customerId] ?? [];
        const created: ICustomerSavedAddress = {
          id: newAddressId(),
          isDefault: list.length === 0,
          ...address,
        };
        set({
          savedAddresses: {
            ...get().savedAddresses,
            [customerId]: [...list, created],
          },
        });
        return created;
      },

      updateSavedAddress: (customerId, addressId, patch) => {
        const list = get().savedAddresses[customerId] ?? [];
        set({
          savedAddresses: {
            ...get().savedAddresses,
            [customerId]: list.map((a) => (a.id === addressId ? { ...a, ...patch } : a)),
          },
        });
      },

      removeSavedAddress: (customerId, addressId) => {
        const list = get().savedAddresses[customerId] ?? [];
        const filtered = list.filter((a) => a.id !== addressId);
        const wasDefault = list.find((a) => a.id === addressId)?.isDefault;
        if (wasDefault && filtered.length > 0) {
          filtered[0] = { ...filtered[0]!, isDefault: true };
        }
        set({
          savedAddresses: {
            ...get().savedAddresses,
            [customerId]: filtered,
          },
        });
      },

      setDefaultAddress: (customerId, addressId) => {
        const list = get().savedAddresses[customerId] ?? [];
        set({
          savedAddresses: {
            ...get().savedAddresses,
            [customerId]: list.map((a) => ({ ...a, isDefault: a.id === addressId })),
          },
        });
      },

      getSavedAddresses: (customerId) => get().savedAddresses[customerId] ?? [],
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        session: state.session,
        customer: state.customer,
        savedAddresses: state.savedAddresses,
      }),
    },
  ),
);

/** Selector — true when there is a non-expired session in the store. */
export function selectIsCustomerAuthenticated(state: ICustomerAuthState): boolean {
  if (!state.session) return false;
  const now = Date.now();
  const exp = Date.parse(state.session.expiresAt);
  if (!Number.isFinite(exp)) return false;
  return exp > now;
}

/** Read the persisted customer id synchronously (for route guards). */
export function readCustomerSessionSync(): ICustomerSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { session?: ICustomerSession } };
    const session = parsed.state?.session ?? null;
    if (!session) return null;
    const exp = Date.parse(session.expiresAt);
    if (!Number.isFinite(exp) || exp <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}
