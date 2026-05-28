import { useCallback, useEffect, useState } from "react";
import type { ICustomer, ICustomerAddress, ID } from "@/shared/types";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { selectIsCustomerAuthenticated, useCustomerAuthStore } from "../store/customerAuthStore";
import { getCustomerName } from "@/features/customers/utils/customerDisplay";

export interface ICustomerRegisterInputB2C {
  type: "B2C";
  fullName: string;
  cpf: string;
  email: string;
  phone: string;
  password: string;
  address?: ICustomerAddress;
}

export interface ICustomerRegisterInputB2B {
  type: "B2B";
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  contactName: string;
  email: string;
  phone: string;
  password: string;
  address?: ICustomerAddress;
}

export type CustomerRegisterInput = ICustomerRegisterInputB2C | ICustomerRegisterInputB2B;

const DEFAULT_STORE_ID: ID = "store-matriz";
const DEFAULT_SELLER_ID: ID = "seller-carlos-santos";

/**
 * Hook that exposes the customer-side session and mutations (PRD-065).
 *
 * Auth is mock — `login` looks up an `ICustomer` by e-mail in the data
 * provider and accepts any non-empty password (mirror of staff mock auth).
 * `register` mints a fresh `ICustomer` via the provider and immediately
 * signs the customer in. Designed for drop-in replacement by Supabase Auth
 * on Fase 2 — consumers never read the password from the store.
 */
export function useCustomerAuth() {
  const provider = useCustomersProvider();
  const session = useCustomerAuthStore((s) => s.session);
  const customer = useCustomerAuthStore((s) => s.customer);
  const isAuthenticated = useCustomerAuthStore(selectIsCustomerAuthenticated);
  const setSession = useCustomerAuthStore((s) => s.setSession);
  const setCustomer = useCustomerAuthStore((s) => s.setCustomer);
  const clearSession = useCustomerAuthStore((s) => s.clearSession);

  const [isHydrating, setIsHydrating] = useState(true);

  // Refresh the cached customer snapshot when a session is present.
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      if (!session) {
        setIsHydrating(false);
        return;
      }
      try {
        const fresh = await provider.get(session.customerId);
        if (!cancelled) setCustomer(fresh);
      } catch {
        if (!cancelled) clearSession();
      } finally {
        if (!cancelled) setIsHydrating(false);
      }
    }
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [session?.customerId, provider, setCustomer, clearSession]);

  const login = useCallback(
    async (
      email: string,
      // password kept in the signature so the call-site already mirrors Fase 2.
      _password: string,
    ): Promise<ICustomer | null> => {
      const trimmed = email.trim().toLowerCase();
      if (!trimmed) return null;
      const result = await provider.list({ search: trimmed, pageSize: 50 });
      const match = result.data.find((c) => (c.email ?? "").toLowerCase() === trimmed) ?? null;
      if (!match) return null;
      setSession(match);
      auditLog({
        actorId: match.id,
        action: "customer_signin",
        resource: "customer",
        resourceId: match.id,
        storeId: match.storeId,
        after: { email: match.email, type: match.type, name: getCustomerName(match) },
      });
      return match;
    },
    [provider, setSession],
  );

  const register = useCallback(
    async (input: CustomerRegisterInput): Promise<ICustomer> => {
      const trimmedEmail = input.email.trim().toLowerCase();
      const existing = await provider.list({ search: trimmedEmail, pageSize: 20 });
      const dup = existing.data.find((c) => (c.email ?? "").toLowerCase() === trimmedEmail);
      if (dup) {
        const err = new Error("EMAIL_TAKEN");
        err.name = "EmailTakenError";
        throw err;
      }

      const sharedBase = {
        storeId: DEFAULT_STORE_ID,
        sellerId: DEFAULT_SELLER_ID,
        status: "ativo" as const,
        email: trimmedEmail,
        phone: input.phone,
        tags: ["ecommerce", "auto-cadastro"],
        address: input.address,
      };

      const created =
        input.type === "B2C"
          ? await provider.create({
              ...sharedBase,
              type: "B2C",
              cpf: input.cpf,
              fullName: input.fullName.trim(),
            })
          : await provider.create({
              ...sharedBase,
              type: "B2B",
              cnpj: input.cnpj,
              razaoSocial: input.razaoSocial.trim(),
              nomeFantasia: input.nomeFantasia.trim(),
              contactName: input.contactName.trim(),
            });

      setSession(created);
      auditLog({
        actorId: created.id,
        action: "customer_register",
        resource: "customer",
        resourceId: created.id,
        storeId: created.storeId,
        after: {
          type: created.type,
          email: created.email,
          source: "storefront_register",
        },
      });
      return created;
    },
    [provider, setSession],
  );

  const logout = useCallback(() => {
    const previous = customer;
    clearSession();
    if (previous) {
      auditLog({
        actorId: previous.id,
        action: "customer_signout",
        resource: "customer",
        resourceId: previous.id,
        storeId: previous.storeId,
      });
    }
  }, [clearSession, customer]);

  const updateProfile = useCallback(
    async (patch: Partial<ICustomer>): Promise<ICustomer> => {
      if (!customer) throw new Error("No customer in session");
      const updated = await provider.update(customer.id, patch);
      setCustomer(updated);
      auditLog({
        actorId: customer.id,
        action: "customer_update",
        resource: "customer",
        resourceId: customer.id,
        storeId: customer.storeId,
        before: { name: getCustomerName(customer), email: customer.email },
        after: { name: getCustomerName(updated), email: updated.email },
      });
      return updated;
    },
    [customer, provider, setCustomer],
  );

  return {
    session,
    customer,
    isAuthenticated,
    isHydrating,
    login,
    register,
    logout,
    updateProfile,
  };
}
