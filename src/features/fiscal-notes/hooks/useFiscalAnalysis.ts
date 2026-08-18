import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FETCH_ALL_PAGE_SIZE,
  useFiscalNotesProvider,
  usePartsProvider,
  useSuppliersProvider,
} from "@/providers/data";
import { useCurrentStore } from "@/features/multistore";
import type { ID } from "@/shared/types";
import { analyzeNote, type IAnalysisCard } from "../engine/analysis";
import { buildAnalysisInput } from "../engine/analysisInput";

export interface ILearnedRuleRow {
  supplierName: string;
  description: string;
  appliedCount: number;
  isNew: boolean;
}

/**
 * Cards da Análise (PRD-216, RS-03).
 *
 * A análise roda sobre as notas EM CONFERÊNCIA: é onde ainda dá para agir. As
 * lançadas entram só como histórico de preço, alimentando a série dos cards.
 */
export function useFiscalAnalysis() {
  const notesProvider = useFiscalNotesProvider();
  const partsProvider = usePartsProvider();
  const suppliersProvider = useSuppliersProvider();
  const { currentStoreId } = useCurrentStore();
  const enabled = currentStoreId !== null;

  const notesQuery = useQuery({
    queryKey: ["fiscal-notes", "analysis", "notes", currentStoreId],
    queryFn: () =>
      notesProvider
        .list({ storeId: currentStoreId ?? undefined, pageSize: FETCH_ALL_PAGE_SIZE })
        .then((r) => r.data),
    enabled,
  });

  const partsQuery = useQuery({
    queryKey: ["fiscal-notes", "analysis", "parts", currentStoreId],
    queryFn: () =>
      partsProvider.list({ pageSize: FETCH_ALL_PAGE_SIZE, active: true }).then((r) => r.data),
    enabled,
  });

  const suppliersQuery = useQuery({
    queryKey: ["fiscal-notes", "analysis", "suppliers", currentStoreId],
    queryFn: () =>
      suppliersProvider
        .list({ storeId: currentStoreId ?? undefined, pageSize: FETCH_ALL_PAGE_SIZE })
        .then((r) => r.data),
    enabled,
  });

  const notes = useMemo(() => notesQuery.data ?? [], [notesQuery.data]);

  const { cards, rules } = useMemo(() => {
    const partsById = new Map((partsQuery.data ?? []).map((part) => [part.id, part]));
    const suppliersById = new Map((suppliersQuery.data ?? []).map((s) => [s.id, s]));
    const posted = notes.filter((note) => note.status === "lancada");
    const inReview = notes.filter((note) => note.status === "conferencia");

    const collected: IAnalysisCard[] = [];
    for (const note of inReview) {
      collected.push(
        ...analyzeNote(
          buildAnalysisInput({
            note,
            postedNotes: posted,
            partsById,
            suppliersById,
            allNotes: notes,
          }),
        ),
      );
    }

    // As regras aprendidas ainda não têm provider próprio — a Fase 3 as grava
    // pela RPC. Até existir leitura, derivamos das notas lançadas o mesmo par
    // que a RPC gravou, para a lateral não mentir nem ficar vazia à toa.
    const ruleMap = new Map<string, ILearnedRuleRow>();
    for (const note of posted) {
      const supplierName =
        suppliersById.get(note.supplierId)?.tradeName ??
        suppliersById.get(note.supplierId)?.corporateName ??
        note.supplierId;
      for (const item of note.items) {
        if (item.conversionMode === "direto" || !item.partId || !item.conversionFactor) continue;
        const target = partsById.get(item.partId);
        const key = `${note.supplierId}:${item.partId}:${item.unit}`;
        const existing = ruleMap.get(key);
        ruleMap.set(key, {
          supplierName,
          description: `${target?.sku ?? item.supplierCode} · ${item.unit} → ${item.conversionFactor} ${item.conversionUnit ?? "UN"}`,
          appliedCount: (existing?.appliedCount ?? 0) + 1,
          isNew: existing ? existing.isNew : true,
        });
      }
    }

    return { cards: collected, rules: [...ruleMap.values()] };
  }, [notes, partsQuery.data, suppliersQuery.data]);

  return {
    cards,
    rules,
    hasNotes: notes.length > 0,
    isLoading:
      enabled && (notesQuery.isPending || partsQuery.isPending || suppliersQuery.isPending),
    isError: notesQuery.isError,
  };
}

export type { ID };
