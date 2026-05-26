import { useMemo } from "react";
import type { IManagerDashboardSnapshot } from "@/providers/data";
import type { CustomerStatus } from "@/shared/types";

export interface ICarteiraHealthBucket {
  status: CustomerStatus;
  count: number;
  percent: number;
}

export interface ICarteiraHealthData {
  total: number;
  buckets: ICarteiraHealthBucket[];
}

const STATUS_ORDER: CustomerStatus[] = ["ativo", "dormente", "recuperacao", "perdido"];

export function useCarteiraHealth(snapshot: IManagerDashboardSnapshot): ICarteiraHealthData {
  return useMemo(() => {
    const total = snapshot.customers.length;
    const counts = new Map<CustomerStatus, number>();
    for (const status of STATUS_ORDER) counts.set(status, 0);
    for (const customer of snapshot.customers) {
      counts.set(customer.status, (counts.get(customer.status) ?? 0) + 1);
    }
    const buckets: ICarteiraHealthBucket[] = STATUS_ORDER.map((status) => {
      const count = counts.get(status) ?? 0;
      return {
        status,
        count,
        percent: total === 0 ? 0 : Math.round((count / total) * 100),
      };
    });
    return { total, buckets };
  }, [snapshot]);
}
