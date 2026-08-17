import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FETCH_ALL_PAGE_SIZE,
  recordAuditLog,
  useFiscalNotesProvider,
  usePartsProvider,
  type IUpdateFiscalNoteItemPatch,
} from "@/providers/data";
import { useCurrentStore } from "@/features/multistore";
import type { ID } from "@/shared/types";
import { autoConfirmable, computePostEffects, validateForPosting } from "../engine/postEffects";

/**
 * Estado da conferência de uma nota (PRD-216, Fase 3).
 *
 * O catálogo é buscado inteiro porque o efeito de cada item precisa do saldo e
 * do custo médio da peça de destino — e porque o provider recebe as peças por
 * parâmetro, para não acoplar as fatias entre si.
 *
 * Toda a regra vive no `engine/`, que é testado; aqui só há I/O e cache.
 */
export function useNoteReview(noteId: ID | undefined) {
  const notesProvider = useFiscalNotesProvider();
  const partsProvider = usePartsProvider();
  const { currentStoreId } = useCurrentStore();
  const queryClient = useQueryClient();
  const [isMutating, setIsMutating] = useState(false);

  const noteQuery = useQuery({
    queryKey: ["fiscal-notes", "detail", noteId],
    queryFn: () => notesProvider.get(noteId as ID),
    enabled: Boolean(noteId),
  });

  const partsQuery = useQuery({
    queryKey: ["fiscal-notes", "review-parts", currentStoreId],
    queryFn: () =>
      partsProvider.list({ pageSize: FETCH_ALL_PAGE_SIZE, active: true }).then((r) => r.data),
    enabled: Boolean(noteId),
  });

  const note = noteQuery.data;
  const parts = useMemo(() => partsQuery.data ?? [], [partsQuery.data]);
  const partsById = useMemo(() => new Map(parts.map((part) => [part.id, part])), [parts]);

  const validation = useMemo(
    () => (note ? validateForPosting(note) : { ok: false, blockers: [] }),
    [note],
  );
  const effects = useMemo(
    () => (note ? computePostEffects(note, partsById) : null),
    [note, partsById],
  );

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["fiscal-notes"] });
    // A movimentação deriva das notas lançadas — sem isto, Gestão →
    // Movimentação seguiria mostrando o ledger de antes do lançamento.
    await queryClient.invalidateQueries({ queryKey: ["inventory-movement"] });
  }

  async function run<T>(fn: () => Promise<T>): Promise<T> {
    setIsMutating(true);
    try {
      const result = await fn();
      await refresh();
      return result;
    } finally {
      setIsMutating(false);
    }
  }

  return {
    note,
    parts,
    partsById,
    effects,
    validation,
    isLoading: noteQuery.isPending || partsQuery.isPending,
    isError: noteQuery.isError,
    isMutating,

    confirmItem: (itemId: ID, patch: IUpdateFiscalNoteItemPatch) =>
      run(() => notesProvider.updateItem(itemId, { ...patch, confirmed: true })),

    /** Resolve em lote só o que veio vinculado pelo código do fornecedor. */
    confirmLinked: () =>
      run(async () => {
        if (!note) return 0;
        const ids = autoConfirmable(note);
        for (const id of ids) await notesProvider.updateItem(id, { confirmed: true });
        return ids.length;
      }),

    post: () =>
      run(async () => {
        if (!note) throw new Error("nota não carregada");
        const posted = await notesProvider.post(note.id, { parts });
        void recordAuditLog({
          actorId: posted.postedBy ?? "system",
          action: "fiscal_note.post",
          resource: "supplies",
          resourceId: posted.id,
          storeId: posted.storeId,
          after: { number: posted.number, total: posted.total, items: posted.items.length },
        });
        return posted;
      }),

    reverse: () =>
      run(async () => {
        if (!note) throw new Error("nota não carregada");
        const before = { status: note.status, postedBy: note.postedBy, postedAt: note.postedAt };
        const reversed = await notesProvider.reverse(note.id, { parts });
        void recordAuditLog({
          actorId: note.postedBy ?? "system",
          action: "fiscal_note.reverse",
          resource: "supplies",
          resourceId: reversed.id,
          storeId: reversed.storeId,
          before,
        });
        return reversed;
      }),
  };
}
