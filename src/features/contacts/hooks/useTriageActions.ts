import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { IContact, ICustomerB2C, ID } from "@/shared/types";
import { recordAuditLog, useContactsProvider, useCustomersProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";

export interface ITriageActions {
  /** Link to an existing customer — the suggestion buttons and the picker. */
  link: (contact: IContact, customerId: ID, customerName: string) => Promise<boolean>;
  /** Mint a B2C customer from the contact itself and link it. */
  createIndividual: (contact: IContact) => Promise<boolean>;
  /** Take the contact out of the Agenda with a reason. */
  ignore: (contact: IContact, reason: string) => Promise<boolean>;
  /** Put an ignored contact back. */
  unignore: (contact: IContact) => Promise<boolean>;
  /** Fold this contact into another one. */
  merge: (primary: IContact, duplicate: IContact) => Promise<boolean>;
}

/**
 * The five verdicts triage can reach, each as one call.
 *
 * Every one of them resolves to a boolean rather than throwing: the queue
 * advances only on a real success. An RLS-blocked write comes back as `false`
 * with a message the attendant can act on, and the contact stays on screen —
 * silently skipping to the next card would look exactly like a decision that
 * worked.
 */
export function useTriageActions(): ITriageActions {
  const provider = useContactsProvider();
  const customersProvider = useCustomersProvider();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const { currentStoreId } = useCurrentStore();

  function audit(action: string, contact: IContact, after: unknown) {
    if (!currentUser || !currentStoreId) return;
    void recordAuditLog({
      actorId: currentUser.id,
      storeId: currentStoreId,
      action,
      resource: "contact",
      resourceId: contact.id,
      before: {
        customerId: contact.customerId,
        ignoredAt: contact.ignoredAt,
        ignoreReason: contact.ignoreReason,
      },
      after,
    });
  }

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["contacts-triage-queue"] }),
      queryClient.invalidateQueries({ queryKey: ["contacts-triage-ignored"] }),
      queryClient.invalidateQueries({ queryKey: ["contacts-triage-duplicates"] }),
      queryClient.invalidateQueries({ queryKey: ["contacts-list"] }),
      queryClient.invalidateQueries({ queryKey: ["contacts-counts"] }),
    ]);
  }

  async function run(
    label: string,
    action: () => Promise<void>,
    success: string,
  ): Promise<boolean> {
    try {
      await action();
      toast.success(success);
      await refresh();
      return true;
    } catch {
      toast.error(`Não foi possível ${label}. Você pode não ter permissão sobre este contato.`);
      return false;
    }
  }

  return {
    link: (contact, customerId, customerName) =>
      run(
        "vincular o contato",
        async () => {
          await provider.linkToCustomer(contact.id, customerId);
          audit("triage_link", contact, { customerId });
        },
        `${contact.name} vinculado a ${customerName}`,
      ),

    createIndividual: (contact) =>
      run(
        "criar o cliente pessoa física",
        async () => {
          if (!currentStoreId) throw new Error("sem loja selecionada");
          // `cpf` starts blank on purpose: a WhatsApp contact rarely hands one
          // over, and the column is nullable. Same shape `NewConversationDialog`
          // already mints a B2C with.
          //
          // Typed as a variable rather than passed inline because the
          // contract's `Omit<ICustomer, …>` collapses the B2B|B2C union down to
          // its shared keys, so an object literal carrying `cpf` trips excess
          // property checking (the inline call site in
          // `NewConversationDialog.tsx:128` has exactly that error today).
          const input: Omit<ICustomerB2C, "id" | "createdAt" | "notes"> = {
            type: "B2C",
            storeId: currentStoreId,
            cpf: "",
            fullName: contact.name,
            phone: contact.phone ?? "",
            email: contact.email ?? undefined,
            sellerId: contact.ownerSellerId,
            status: "ativo",
            tags: [],
            whatsappStatus: contact.hasWhatsapp ? "valid" : "unknown",
          };
          const customer = await customersProvider.create(input);
          await provider.linkToCustomer(contact.id, customer.id);
          audit("triage_create_individual", contact, { customerId: customer.id });
        },
        `Cliente pessoa física criado para ${contact.name}`,
      ),

    ignore: (contact, reason) =>
      run(
        "ignorar o contato",
        async () => {
          await provider.ignore(contact.id, reason);
          audit("triage_ignore", contact, { reason });
        },
        `${contact.name} ignorado · ${reason}`,
      ),

    unignore: (contact) =>
      run(
        "devolver o contato à agenda",
        async () => {
          await provider.unignore(contact.id);
          audit("triage_unignore", contact, { ignoredAt: null });
        },
        `${contact.name} voltou para a agenda`,
      ),

    merge: (primary, duplicate) =>
      run(
        "mesclar os contatos",
        async () => {
          await provider.merge(primary.id, duplicate.id);
          audit("triage_merge", duplicate, { mergedInto: primary.id });
        },
        `“${duplicate.name}” mesclado em “${primary.name}”`,
      ),
  };
}
