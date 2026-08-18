import { useQuery } from "@tanstack/react-query";
import type { ICustomer, ID } from "@/shared/types";
import { FETCH_ALL_PAGE_SIZE } from "@/providers/data";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";

/**
 * Carrega clientes ativos de um vendedor (origem de transferências temporárias).
 * Reutilizado pelo modal de cobertura para construir o multi-select e o preview
 * "Todos os N clientes do titular".
 */
export function useSellerCustomers(sellerId: ID | undefined, storeId: ID | undefined) {
  const provider = useCustomersProvider();
  return useQuery({
    queryKey: ["carteira-seller-customers", sellerId ?? null, storeId ?? null],
    queryFn: () =>
      provider.list({
        storeId,
        sellerIds: sellerId ? [sellerId] : undefined,
        statuses: ["ativo", "recuperacao", "dormente"],
        pageSize: FETCH_ALL_PAGE_SIZE,
      }),
    enabled: Boolean(sellerId),
    staleTime: 30_000,
  });
}

export type SellerCustomers = ICustomer[];
