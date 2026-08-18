import type { ID } from "@/shared/types";
import type { IWalletSellerStats, IWalletStats } from "../contracts/customers";
import { WALLET_STALE_DAYS } from "../contracts/customers";

/**
 * The two facts the wallet board needs about a customer. Both providers project
 * their rows down to this shape before aggregating, so the counting rules live
 * in one place and are exercised by one test.
 */
export interface IWalletAggregateRow {
  sellerId: ID | null;
  /** Latest paid purchase. Absent/null means the customer never bought. */
  lastPurchaseAt?: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Folds raw customer rows into {@link IWalletStats}.
 *
 * `stale` counts customers with no purchase inside the last
 * {@link WALLET_STALE_DAYS} days, and a customer who never bought counts as
 * stale — a wallet entry that has never produced a sale is the extreme case of
 * the problem the board is pointing at, not an exception to it.
 *
 * `positivados` uses the calendar month (PRD-044's definition), not a rolling
 * 30-day window, so it lines up with the positivação filter on Clientes.
 *
 * Sellers are returned heaviest-wallet first; that is the order the board
 * renders, and the proportional bar reads correctly only when sorted.
 */
export function aggregateWalletStats(
  rows: readonly IWalletAggregateRow[],
  now: Date = new Date(),
): IWalletStats {
  const staleBefore = now.getTime() - WALLET_STALE_DAYS * DAY_MS;
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  let unassigned = 0;
  const bySeller = new Map<ID, IWalletSellerStats>();

  for (const row of rows) {
    if (!row.sellerId) {
      unassigned += 1;
      continue;
    }

    let entry = bySeller.get(row.sellerId);
    if (!entry) {
      entry = { sellerId: row.sellerId, customers: 0, stale: 0, positivados: 0 };
      bySeller.set(row.sellerId, entry);
    }
    entry.customers += 1;

    const purchased = row.lastPurchaseAt ? new Date(row.lastPurchaseAt) : null;
    // An unparseable timestamp is treated as "no purchase" rather than thrown:
    // a malformed row must not blank out the whole board.
    if (!purchased || Number.isNaN(purchased.getTime())) {
      entry.stale += 1;
      continue;
    }

    if (purchased.getTime() < staleBefore) entry.stale += 1;
    if (purchased.getFullYear() === currentYear && purchased.getMonth() === currentMonth) {
      entry.positivados += 1;
    }
  }

  return {
    total: rows.length,
    unassigned,
    bySeller: [...bySeller.values()].sort((a, b) => b.customers - a.customers),
  };
}
