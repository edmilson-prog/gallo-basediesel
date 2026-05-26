import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  CarteiraTransferStatus,
  CarteiraTransferType,
  ICarteiraTransfer,
  ID,
} from "@/shared/types";
import { useTransfersProvider } from "@/providers/data/hooks/useTransfersProvider";

export interface ITransfersListFilters {
  fromSellerId?: ID;
  toSellerId?: ID;
  types?: CarteiraTransferType[];
  statuses?: CarteiraTransferStatus[];
  since?: string;
  until?: string;
}

export interface IUseTransfersListArgs {
  storeId?: ID;
  scope: "active" | "history" | "all";
  filters?: ITransfersListFilters;
  page?: number;
  pageSize?: number;
}

/**
 * Lista paginada de transferências. `scope='active'` filtra status='active' no
 * provider; `scope='history'` filtra reverted+expired; `scope='all'` retorna
 * tudo (usado pelos contadores do header).
 */
export function useTransfersList(args: IUseTransfersListArgs) {
  const provider = useTransfersProvider();

  const statuses = useMemo<CarteiraTransferStatus[] | undefined>(() => {
    if (args.filters?.statuses && args.filters.statuses.length > 0) {
      return args.filters.statuses;
    }
    if (args.scope === "active") return ["active"];
    if (args.scope === "history") return ["reverted", "expired"];
    return undefined;
  }, [args.scope, args.filters?.statuses]);

  const queryKey = useMemo(
    () => [
      "carteira-transfers",
      args.scope,
      args.storeId ?? null,
      args.filters ?? null,
      args.page ?? 1,
      args.pageSize ?? 20,
      statuses ?? null,
    ],
    [args.scope, args.storeId, args.filters, args.page, args.pageSize, statuses],
  );

  return useQuery({
    queryKey,
    queryFn: () =>
      provider.list({
        storeId: args.storeId,
        fromSellerId: args.filters?.fromSellerId,
        toSellerId: args.filters?.toSellerId,
        types:
          args.filters?.types && args.filters.types.length > 0 ? args.filters.types : undefined,
        statuses,
        since: args.filters?.since,
        until: args.filters?.until,
        page: args.page ?? 1,
        pageSize: args.pageSize ?? 20,
      }),
    staleTime: 15_000,
  });
}

export type { ICarteiraTransfer };
