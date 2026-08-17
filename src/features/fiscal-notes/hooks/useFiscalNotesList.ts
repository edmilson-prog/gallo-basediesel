import { useQuery } from "@tanstack/react-query";
import { useFiscalNotesProvider } from "@/providers/data";
import type { FiscalNoteStatus, ID } from "@/shared/types";

export interface IUseFiscalNotesListParams {
  storeId: ID | null;
  status?: FiscalNoteStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Lista de notas de entrada (PRD-216).
 *
 * A chave inclui cada filtro — sem isso o cache devolve a página do filtro
 * anterior ao alternar entre "Todas" e "Lançadas". `storeId` entra na chave
 * pelo id, nunca pelo objeto: chave por referência quebra o cache a cada
 * render e já causou problema neste projeto.
 */
export function useFiscalNotesList(params: IUseFiscalNotesListParams) {
  const provider = useFiscalNotesProvider();
  const { storeId, status, search, page = 1, pageSize = 50 } = params;

  const query = useQuery({
    queryKey: ["fiscal-notes", "list", storeId, status ?? "all", search ?? "", page, pageSize],
    queryFn: () => provider.list({ storeId: storeId ?? undefined, status, search, page, pageSize }),
    // Sem loja resolvida não há o que listar — o provider filtraria por
    // undefined e devolveria as notas de todas as lojas.
    enabled: storeId !== null,
  });

  return {
    notes: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isPending && storeId !== null,
    isError: query.isError,
    refetch: query.refetch,
  };
}
