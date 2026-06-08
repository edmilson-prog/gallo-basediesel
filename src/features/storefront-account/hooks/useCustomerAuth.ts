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

const DEFAULT_STORE_ID: ID = "00000000-0000-0000-0000-000000000001";
const DEFAULT_SELLER_ID: ID = "seller-carlos-santos";

const onlyDigits = (value: string): string => value.replace(/\D/g, "");

/**
 * Raised when a sign-up matches an existing guest-checkout record (PRD-067
 * RF-023) — by e-mail OR document (CPF/CNPJ). The caller is expected to ask the
 * visitor for confirmation ("Encontramos um pedido em seu nome — vincular?")
 * before calling {@link useCustomerAuth().confirmGuestMerge}.
 */
export class GuestMatchError extends Error {
  guestId: ID;
  matchedBy: "email" | "document";
  constructor(guestId: ID, matchedBy: "email" | "document") {
    super("GUEST_MATCH");
    this.name = "GuestMatchError";
    this.guestId = guestId;
    this.matchedBy = matchedBy;
  }
}

/**
 * Looks for a guest-checkout customer matching the registration input by e-mail
 * or by document (CPF for B2C / CNPJ for B2B). Returns the match + how it was
 * found, or null. Only guest records are eligible — fully registered ones are
 * treated as e-mail-taken collisions by the caller.
 */
async function findGuestMatch(
  provider: ReturnType<typeof useCustomersProvider>,
  input: CustomerRegisterInput,
): Promise<{ customer: ICustomer; matchedBy: "email" | "document" } | null> {
  const email = input.email.trim().toLowerCase();
  const byEmail = await provider.list({ search: email, pageSize: 20 });
  const emailMatch = byEmail.data.find((c) => (c.email ?? "").toLowerCase() === email);
  if (emailMatch?.isGuestCheckout) return { customer: emailMatch, matchedBy: "email" };

  const doc = onlyDigits(input.type === "B2C" ? input.cpf : input.cnpj);
  if (doc.length >= 11) {
    const byDoc = await provider.list({ search: doc, pageSize: 20 });
    const docMatch = byDoc.data.find((c) => {
      if (!c.isGuestCheckout) return false;
      if (c.type === "B2C" && input.type === "B2C") return onlyDigits(c.cpf) === doc;
      if (c.type === "B2B" && input.type === "B2B") return onlyDigits(c.cnpj) === doc;
      return false;
    });
    if (docMatch) return { customer: docMatch, matchedBy: "document" };
  }
  return null;
}

/**
 * Promote a guest-checkout customer to a registered account, merging the new
 * registration details onto the existing record (PRD-067 RF-023). Keeps the
 * order history attached and clears the `isGuestCheckout` flag.
 */
async function promoteGuestCustomer(
  provider: ReturnType<typeof useCustomersProvider>,
  customerId: ID,
  input: CustomerRegisterInput,
): Promise<ICustomer> {
  const trimmedEmail = input.email.trim().toLowerCase();
  const base: Partial<ICustomer> = {
    email: trimmedEmail,
    phone: input.phone,
    isGuestCheckout: false,
    address: input.address,
  };
  const patch: Partial<ICustomer> =
    input.type === "B2C"
      ? { ...base, type: "B2C", cpf: input.cpf, fullName: input.fullName.trim() }
      : {
          ...base,
          type: "B2B",
          cnpj: input.cnpj,
          razaoSocial: input.razaoSocial.trim(),
          nomeFantasia: input.nomeFantasia.trim(),
          contactName: input.contactName.trim(),
        };
  return provider.update(customerId, patch);
}

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

  /**
   * Completes a guest-to-account merge after the visitor confirmed the prompt
   * (PRD-067 RF-023). Promotes the record, signs in and audits the link.
   */
  const confirmGuestMerge = useCallback(
    async (guestId: ID, input: CustomerRegisterInput): Promise<ICustomer> => {
      const merged = await promoteGuestCustomer(provider, guestId, input);
      setSession(merged);
      auditLog({
        actorId: merged.id,
        action: "ecommerce_guest_merge",
        resource: "customer",
        resourceId: merged.id,
        storeId: merged.storeId,
        before: { isGuestCheckout: true },
        after: { isGuestCheckout: false, source: "storefront_register_merge" },
      });
      return merged;
    },
    [provider, setSession],
  );

  const register = useCallback(
    async (input: CustomerRegisterInput): Promise<ICustomer> => {
      const trimmedEmail = input.email.trim().toLowerCase();

      // PRD-067 RF-023 — a prior guest checkout (matched by e-mail OR document)
      // must NOT be merged silently: surface a typed error so the caller can ask
      // "Encontramos um pedido em seu nome — vincular?" before linking.
      const guestMatch = await findGuestMatch(provider, input);
      if (guestMatch) {
        throw new GuestMatchError(guestMatch.customer.id, guestMatch.matchedBy);
      }

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
    confirmGuestMerge,
    logout,
    updateProfile,
  };
}
