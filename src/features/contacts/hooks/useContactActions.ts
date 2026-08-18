import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { IContact, ID } from "@/shared/types";
import { recordAuditLog, useContactsProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";

export interface IContactActions {
  linkToCustomer: (contact: IContact, customerId: ID | null) => Promise<void>;
  setOptOut: (contact: IContact, optOut: boolean) => Promise<void>;
  scheduleFollowUp: (contact: IContact, at: string, note: string) => Promise<void>;
  removeTag: (contact: IContact, tag: string) => Promise<void>;
}

/**
 * Single-contact mutations from the detail drawer.
 *
 * Every one of these can be blocked by RLS **without raising an error** — the
 * policy simply excludes the row from the UPDATE's candidate set. The provider
 * turns that into a throw via `.single()`, so anything that resolves here
 * genuinely changed a row. What this layer adds is a message the user can act
 * on instead of PostgREST's wording.
 */
export function useContactActions(): IContactActions {
  const provider = useContactsProvider();
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
      before: { customerId: contact.customerId, optOut: contact.optOut, tags: contact.tags },
      after,
    });
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["contacts-list"] });
    await queryClient.invalidateQueries({ queryKey: ["contacts-counts"] });
  }

  /** Shared failure path: RLS blocks read as "não foi possível", never silence. */
  async function mutate(label: string, run: () => Promise<unknown>, success: string) {
    try {
      await run();
      toast.success(success);
      await refresh();
    } catch {
      toast.error(`Não foi possível ${label}. Você pode não ter permissão sobre este contato.`);
    }
  }

  return {
    linkToCustomer: (contact, customerId) =>
      mutate(
        customerId ? "vincular o contato" : "desvincular o contato",
        async () => {
          await provider.linkToCustomer(contact.id, customerId);
          audit(customerId ? "link" : "unlink", contact, { customerId });
        },
        customerId ? "Contato vinculado ao cliente" : "Contato desvinculado do cliente",
      ),

    setOptOut: (contact, optOut) =>
      mutate(
        "alterar o opt-out",
        async () => {
          await provider.setOptOut(contact.id, optOut);
          audit("optOut", contact, { optOut });
        },
        optOut
          ? "Contato marcado como opt-out"
          : "Opt-out removido — contato volta a receber envios",
      ),

    scheduleFollowUp: (contact, at, note) =>
      mutate(
        "agendar o retorno",
        async () => {
          await provider.scheduleFollowUp(contact.id, at, note || undefined);
          audit("scheduleFollowUp", contact, { nextContactAt: at, note });
        },
        `Retorno agendado para ${contact.name}`,
      ),

    removeTag: (contact, tag) =>
      mutate(
        "remover a etiqueta",
        async () => {
          await provider.update(contact.id, { tags: contact.tags.filter((t) => t !== tag) });
          audit("removeTag", contact, { tag });
        },
        `Etiqueta “${tag}” removida`,
      ),
  };
}
