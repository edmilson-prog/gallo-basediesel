import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { useAuditsProvider } from "@/providers/data/hooks/useAuditsProvider";
import { buildClosureIndex, type ITransferClosure } from "../utils/closureIndex";

/**
 * Looks up who closed each of `transferIds` (and when) from `audit_logs`,
 * since `carteira_transfers` itself only tracks who CREATED it. Used by the
 * Histórico tab's "Executado por"/"Encerrado em" columns — those used to be
 * bound to `createdBy`/`createdAt`, silently mislabeling creation info as
 * closure info.
 *
 * A transfer with no matching entry (closed before this audit trail existed,
 * or never closed) resolves to no entry in the returned map — callers show a
 * "—" fallback rather than guessing.
 */
export function useTransferClosureAudit(transferIds: ID[], storeId?: ID) {
  const provider = useAuditsProvider();

  const query = useQuery({
    queryKey: ["carteira-transfer-closure-audit", storeId ?? null, [...transferIds].sort()],
    queryFn: () =>
      provider.list({
        storeId,
        resources: ["transfer"],
        actions: ["transfer.revert", "transfer.expire"],
        resourceIds: transferIds,
        pageSize: transferIds.length,
      }),
    enabled: transferIds.length > 0,
    staleTime: 15_000,
  });

  const index: Map<ID, ITransferClosure> = query.data
    ? buildClosureIndex(query.data.data)
    : new Map();
  return { closureByTransferId: index, isLoading: transferIds.length > 0 && query.isLoading };
}
