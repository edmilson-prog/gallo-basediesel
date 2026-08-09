import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, ISeller } from "@/shared/types";
import type { IWalletSellerStats } from "@/providers/data";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";

/** Imported contacts awaiting review are not wallet customers yet. */
const EXCLUDED_TAGS = ["pending_review"];

/** A seller joined to their slice of the wallet — what the board renders. */
export interface ISellerWalletRow extends IWalletSellerStats {
  seller: ISeller;
  /** Share of the store's assigned wallet, 0–1. */
  share: number;
  /** Share of the largest wallet, 0–1 — drives the proportional bar. */
  relative: number;
}

export interface IWalletBoard {
  rows: ISellerWalletRow[];
  /** Customers held by a seller. Excludes {@link unassigned}. */
  assigned: number;
  unassigned: number;
  /** Everything in scope, assigned or not. */
  total: number;
}

/**
 * The store's wallet composition, joined to the seller records.
 *
 * Sellers with an empty wallet still get a row: "Diego holds 0 customers" is
 * exactly the kind of thing the board should say out loud, and dropping him
 * would make the team look smaller than it is.
 */
export function useWalletStats(storeId: ID | undefined, sellers: ISeller[]) {
  const provider = useCustomersProvider();

  const query = useQuery({
    queryKey: ["carteira-wallet-stats", storeId ?? null],
    queryFn: () => provider.walletStats({ storeId, excludeTags: EXCLUDED_TAGS }),
    staleTime: 60_000,
  });

  const board = useMemo<IWalletBoard>(() => {
    const stats = query.data;
    const statsBySeller = new Map(stats?.bySeller.map((s) => [s.sellerId, s]) ?? []);
    const assigned = stats ? stats.total - stats.unassigned : 0;

    const merged = sellers.map((seller) => {
      const entry = statsBySeller.get(seller.id);
      return {
        sellerId: seller.id,
        seller,
        customers: entry?.customers ?? 0,
        stale: entry?.stale ?? 0,
        positivados: entry?.positivados ?? 0,
        share: 0,
        relative: 0,
      } satisfies ISellerWalletRow;
    });

    const max = merged.reduce((m, r) => Math.max(m, r.customers), 0);
    const rows = merged
      .map((row) => ({
        ...row,
        share: assigned > 0 ? row.customers / assigned : 0,
        relative: max > 0 ? row.customers / max : 0,
      }))
      .sort((a, b) => b.customers - a.customers);

    return { rows, assigned, unassigned: stats?.unassigned ?? 0, total: stats?.total ?? 0 };
  }, [query.data, sellers]);

  return { ...query, board };
}
