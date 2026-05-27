import type { ABCClass, ID } from "@/shared/types";
import type {
  IABCMigrationsBucket,
  ICustomerABCRecord,
  ICustomerABCWithMigration,
} from "./classifyABC";

/** Numeric weight for direction comparison (A=3, B=2, C=1). */
const CLASS_WEIGHT: Record<ABCClass, number> = { A: 3, B: 2, C: 1 };

/**
 * Compare two classifications (same scope) and emit per-customer migration
 * metadata. Customers absent from the previous period are flagged `"novo"`;
 * customers present before but missing now are flagged `"saiu"` only when
 * `includeDropouts` is true (off by default to keep the lists tight).
 */
export function detectMigrations(
  current: ICustomerABCRecord[],
  previousClassByCustomerId: Map<ID, ABCClass>,
  options: { includeDropouts?: boolean } = {},
): { records: ICustomerABCWithMigration[]; buckets: IABCMigrationsBucket } {
  const records: ICustomerABCWithMigration[] = [];
  const upgradedToA: ICustomerABCWithMigration[] = [];
  const downgradedFromA: ICustomerABCWithMigration[] = [];
  const newCustomersInA: ICustomerABCWithMigration[] = [];

  const currentIds = new Set<ID>();
  for (const record of current) {
    currentIds.add(record.customerId);
    const previousClass = previousClassByCustomerId.get(record.customerId);
    let migration: ICustomerABCWithMigration["migration"];
    if (previousClass === undefined) {
      migration = "novo";
    } else if (previousClass === record.class) {
      migration = "manteve";
    } else if (CLASS_WEIGHT[record.class] > CLASS_WEIGHT[previousClass]) {
      migration = "subiu";
    } else {
      migration = "caiu";
    }
    const entry: ICustomerABCWithMigration = { ...record, previousClass, migration };
    records.push(entry);

    if (record.class === "A" && previousClass !== "A") {
      if (previousClass === undefined) newCustomersInA.push(entry);
      else upgradedToA.push(entry);
    }
    if (previousClass === "A" && record.class !== "A") {
      downgradedFromA.push(entry);
    }
  }

  if (options.includeDropouts) {
    for (const [customerId, previousClass] of previousClassByCustomerId) {
      if (currentIds.has(customerId)) continue;
      // A dropout is not in `current` so we cannot rebuild a full record; we
      // emit a synthetic minimal entry. Consumers should treat dropouts as
      // "left the curve" rather than as a class transition.
      records.push({
        customerId,
        customer: undefined as unknown as ICustomerABCWithMigration["customer"],
        class: "C",
        revenue: 0,
        cumulativeRevenuePct: 1,
        rank: Number.POSITIVE_INFINITY,
        previousClass,
        migration: "saiu",
      });
    }
  }

  return {
    records,
    buckets: { upgradedToA, downgradedFromA, newCustomersInA },
  };
}
