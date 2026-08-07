import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { ID } from "@/shared/types";
import { recordAuditLog, useContactsProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import type { ContactBulkAction } from "../components/modals/ContactBulkActionDialog";

export interface IContactsBulkActions {
  isRunning: boolean;
  run: (action: ContactBulkAction, ids: ID[], value: string) => Promise<void>;
}

const UNASSIGN = "__unassign__";

/**
 * Runs a bulk action over the selected contacts and reports honestly.
 *
 * The important part is the partial-success path. RLS excludes rows the caller
 * may not write from the UPDATE's candidate set, so a blocked write affects
 * zero rows and raises **no error**. Treating "no exception" as success would
 * tell the user that 40 contacts were tagged when 12 were. Every action
 * compares the affected count against what was requested and says so.
 */
export function useContactsBulkActions(onDone: () => void): IContactsBulkActions {
  const provider = useContactsProvider();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const { currentStoreId } = useCurrentStore();
  const [isRunning, setIsRunning] = useState(false);

  /** Audit is best-effort: it must never swallow the action itself. */
  function audit(action: string, count: number, summary: string) {
    if (!currentUser || !currentStoreId) return;
    void recordAuditLog({
      actorId: currentUser.id,
      storeId: currentStoreId,
      action,
      resource: "contact",
      resourceId: `bulk:${count}`,
      after: { summary, count },
    });
  }

  async function run(action: ContactBulkAction, ids: ID[], value: string): Promise<void> {
    if (ids.length === 0) return;

    if (action === "export") {
      // Exporting personal data is auditable even though it changes nothing.
      audit("export", ids.length, `Exportou ${ids.length} contatos (escopo: ${value})`);
      toast.info("Exportação de contatos — disponível em breve");
      return;
    }

    setIsRunning(true);
    try {
      let affected = 0;
      let summary = "";

      switch (action) {
        case "addTag":
          affected = await provider.bulkAddTag(ids, value);
          summary = `Etiqueta “${value}” aplicada`;
          break;
        case "removeTag":
          affected = await provider.bulkRemoveTag(ids, value);
          summary = `Etiqueta “${value}” removida`;
          break;
        case "transferOwner":
          affected = await provider.bulkTransferOwner(ids, value === UNASSIGN ? null : value);
          summary = "Responsável transferido";
          break;
        case "optOut":
          affected = await provider.bulkSetOptOut(ids, true);
          summary = "Contatos marcados como opt-out";
          break;
      }

      audit(action, ids.length, `${summary} — ${affected} de ${ids.length}`);

      if (affected === 0) {
        toast.error("Nenhum contato foi alterado. Você pode não ter permissão sobre eles.");
      } else if (affected < ids.length) {
        // Not an error: some rows legitimately had nothing to change (a tag
        // they already carried), others may have been blocked by RLS. Either
        // way the user must not read this as "all done".
        toast.warning(
          `${summary}: ${affected} de ${ids.length}. Os demais não foram alterados — sem permissão ou já estavam assim.`,
        );
      } else {
        toast.success(`${summary} em ${affected} ${affected === 1 ? "contato" : "contatos"}`);
      }

      await queryClient.invalidateQueries({ queryKey: ["contacts-list"] });
      await queryClient.invalidateQueries({ queryKey: ["contacts-counts"] });
      onDone();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível concluir a ação em massa",
      );
    } finally {
      setIsRunning(false);
    }
  }

  return { isRunning, run };
}
