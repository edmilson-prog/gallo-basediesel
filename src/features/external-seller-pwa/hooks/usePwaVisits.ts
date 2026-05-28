import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ICustomer, ID, IVisit } from "@/shared/types";
import { useCustomersProvider } from "@/providers/data";
import { usePwaVisitsStore } from "../store/visitsStore";

const SEED_COUNT = 12;
const STATUSES: IVisit["status"][] = ["agendada", "realizada", "agendada", "remarcada"];

function customerAddress(c: ICustomer): string {
  if (!c.address) return "Endereço não informado";
  const a = c.address;
  return `${a.street}, ${a.number} — ${a.district}, ${a.city}/${a.state}`;
}

/**
 * Deterministic seeded visits for the seller, derived from their portfolio so
 * the agenda renders without a dedicated mock dataset (PRD-070 RF-018).
 */
function seedVisits(sellerId: ID, customers: ICustomer[]): IVisit[] {
  const base = customers.slice(0, SEED_COUNT);
  const today = new Date();
  return base.map((c, idx) => {
    const offsetDays = idx - 3; // a few in the past, rest upcoming
    const d = new Date(today);
    d.setDate(today.getDate() + offsetDays);
    d.setHours(8 + (idx % 8), idx % 2 === 0 ? 0 : 30, 0, 0);
    return {
      id: `seed-visit-${c.id}`,
      customerId: c.id,
      sellerId,
      scheduledAt: d.toISOString(),
      address: customerAddress(c),
      notes: "",
      status: offsetDays < 0 ? "realizada" : STATUSES[idx % STATUSES.length]!,
      createdAt: today.toISOString(),
    };
  });
}

export interface IPwaVisitWithCustomer extends IVisit {
  customer: ICustomer | null;
}

/**
 * Field visits for the signed-in seller (PRD-070 RF-016): deterministic seeds
 * derived from the portfolio merged with locally-created visits, sorted by
 * `scheduledAt` ascending.
 */
export function usePwaVisits(sellerId: ID | undefined) {
  const provider = useCustomersProvider();
  const created = usePwaVisitsStore((s) => s.created);

  const query = useQuery({
    queryKey: ["pwa", "visits-customers", sellerId] as const,
    enabled: Boolean(sellerId),
    staleTime: 60_000,
    queryFn: async () => {
      const result = await provider.list({ sellerId, pageSize: 200 });
      return result.data;
    },
  });

  const visits = useMemo<IPwaVisitWithCustomer[]>(() => {
    if (!sellerId) return [];
    const customers = query.data ?? [];
    const byId = new Map(customers.map((c) => [c.id, c]));
    const seeded = seedVisits(sellerId, customers);
    const mineCreated = created.filter((v) => v.sellerId === sellerId);
    const merged = [...mineCreated, ...seeded];
    return merged
      .map((v) => ({ ...v, customer: byId.get(v.customerId) ?? null }))
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }, [sellerId, query.data, created]);

  return { visits, isLoading: query.isLoading };
}
