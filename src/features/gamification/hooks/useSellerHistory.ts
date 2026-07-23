import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IGamificationRules, IRankingEntry } from "@/shared/types";
import {
  FETCH_ALL_PAGE_SIZE,
  useCustomersProvider,
  useGoalsProvider,
  useOrdersProvider,
  useSellersProvider,
  useSettingsProvider,
} from "@/providers/data";
import { calculateSellerScore } from "../engine";
import { resolvePeriod } from "../utils/periods";
import { useBadges } from "./useBadges";

const STALE_MS = 60_000;

interface IUseSellerHistoryParams {
  sellerId: ID;
  storeId?: ID;
  months?: number;
  enabled?: boolean;
}

interface IUseSellerHistoryResult {
  isLoading: boolean;
  hasError: boolean;
  history: { label: string; score: number; periodRef: string; entry: IRankingEntry }[];
  refetch: () => void;
}

function buildMonthlyAnchors(months: number, base: Date = new Date()): Date[] {
  const out: Date[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1));
    out.push(d);
  }
  return out;
}

const MONTH_LABELS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

function labelForDate(d: Date): string {
  return `${MONTH_LABELS[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`;
}

/**
 * Builds a per-month score series for the seller drill-down (PRD-043). Loads
 * a wide window of paid orders, customers, goals and badges once and then
 * scores each of the last `months` monthly periods via the pure engine.
 */
export function useSellerHistory(params: IUseSellerHistoryParams): IUseSellerHistoryResult {
  const { sellerId, storeId = "00000000-0000-0000-0000-000000000001", months = 6, enabled = true } = params;

  const sellersProvider = useSellersProvider();
  const goalsProvider = useGoalsProvider();
  const ordersProvider = useOrdersProvider();
  const customersProvider = useCustomersProvider();
  const settingsProvider = useSettingsProvider();

  const anchors = useMemo(() => buildMonthlyAnchors(months), [months]);
  const earliestIso = useMemo(() => anchors[0].toISOString(), [anchors]);
  const latestEnd = useMemo(() => {
    const end = new Date(
      Date.UTC(
        anchors[anchors.length - 1].getUTCFullYear(),
        anchors[anchors.length - 1].getUTCMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      ),
    );
    return end.toISOString();
  }, [anchors]);

  const sellersQuery = useQuery({
    queryKey: ["gamification", "seller-history", "sellers", storeId],
    queryFn: () => sellersProvider.list({ storeId }),
    staleTime: STALE_MS,
    enabled,
  });

  const settingsQuery = useQuery({
    queryKey: ["gamification", "seller-history", "settings", storeId],
    queryFn: () => settingsProvider.get(storeId),
    staleTime: 5 * 60_000,
    enabled,
  });

  const ordersQuery = useQuery({
    queryKey: [
      "gamification",
      "seller-history",
      "orders",
      storeId,
      sellerId,
      earliestIso,
      latestEnd,
    ],
    queryFn: () =>
      ordersProvider.list({
        storeId,
        sellerId,
        paymentStatus: "pago",
        since: earliestIso,
        until: latestEnd,
        pageSize: 5000,
      }),
    staleTime: STALE_MS,
    enabled,
  });

  const customersQuery = useQuery({
    queryKey: ["gamification", "seller-history", "customers", storeId, sellerId],
    queryFn: () =>
      customersProvider.list({
        storeId,
        sellerIds: [sellerId],
        pageSize: FETCH_ALL_PAGE_SIZE,
      }),
    staleTime: STALE_MS,
    enabled,
  });

  const goalsQuery = useQuery({
    queryKey: ["gamification", "seller-history", "goals", storeId, sellerId],
    queryFn: () => goalsProvider.list({ storeId, targetId: sellerId, pageSize: 500 }),
    staleTime: STALE_MS,
    enabled,
  });

  const badgesQuery = useBadges({ sellerId, enabled });

  const isLoading =
    sellersQuery.isLoading ||
    settingsQuery.isLoading ||
    ordersQuery.isLoading ||
    customersQuery.isLoading ||
    goalsQuery.isLoading ||
    badgesQuery.isLoading;

  const hasError =
    sellersQuery.isError ||
    settingsQuery.isError ||
    ordersQuery.isError ||
    customersQuery.isError ||
    goalsQuery.isError ||
    badgesQuery.hasError;

  const refetch = () => {
    void sellersQuery.refetch();
    void settingsQuery.refetch();
    void ordersQuery.refetch();
    void customersQuery.refetch();
    void goalsQuery.refetch();
    badgesQuery.refetch();
  };

  const history = useMemo(() => {
    if (isLoading || hasError) return [];
    const rules: IGamificationRules | undefined = settingsQuery.data?.gamificationRules;
    if (!rules) return [];
    const sellers = sellersQuery.data ?? [];
    const orders = ordersQuery.data?.data ?? [];
    const customers = customersQuery.data?.data ?? [];
    const goals = goalsQuery.data?.data ?? [];
    const badges = badgesQuery.badges;

    return anchors.map((anchor) => {
      const period = resolvePeriod("mensal", anchor);
      const entry = calculateSellerScore(sellerId, period, {
        rules,
        sellers,
        goals,
        paidOrders: orders,
        customers,
        badges,
      });
      return {
        label: labelForDate(anchor),
        score: entry.score,
        periodRef: period.ref,
        entry,
      };
    });
  }, [
    isLoading,
    hasError,
    anchors,
    sellerId,
    settingsQuery.data,
    sellersQuery.data,
    ordersQuery.data,
    customersQuery.data,
    goalsQuery.data,
    badgesQuery.badges,
  ]);

  return { isLoading, hasError, history, refetch };
}
