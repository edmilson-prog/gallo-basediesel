import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IGamificationRules, ID, IRankingEntry, ISeller } from "@/shared/types";
import {
  useCustomersProvider,
  useGoalsProvider,
  useOrdersProvider,
  useSellersProvider,
  useSettingsProvider,
} from "@/providers/data";
import {
  calculateRanking,
  calculateSellerScore,
  evaluateBadgesForSeller,
  type IGamificationPeriod,
} from "../engine";
import { useBadges } from "./useBadges";
import { previousPeriod } from "../utils/periods";

const STALE_MS = 30_000;

export interface IRankingScope {
  storeId?: ID;
  /** Restricts ranking computation to a single seller (drill-down). */
  sellerId?: ID;
  /** When true and user is Owner, includes all stores. Ignored for non-Owner roles. */
  allStores?: boolean;
}

export interface IUseRankingParams {
  period: IGamificationPeriod;
  scope: IRankingScope;
  /** Inject custom rules (used by the config preview). */
  rulesOverride?: Partial<IGamificationRules>;
  enabled?: boolean;
}

export interface IUseRankingResult {
  isLoading: boolean;
  hasError: boolean;
  refetch: () => void;
  rules: IGamificationRules | null;
  sellers: ISeller[];
  ranking: IRankingEntry[];
  /** Newly-evaluated badges that the engine would award now (idempotent vs current state). */
  newBadges: ReturnType<typeof evaluateBadgesForSeller>;
  period: IGamificationPeriod;
}

/**
 * Aggregator hook for the ranking screen (PRD-043).
 *
 * Loads sellers + goals + paid orders + customers + badges + platform settings,
 * computes the per-seller score and the full ranking via the pure engine. Also
 * surfaces the newly-evaluable badges so the page/widget can highlight what is
 * about to be awarded on the next recompute.
 */
export function useRanking(params: IUseRankingParams): IUseRankingResult {
  const { period, scope, rulesOverride, enabled = true } = params;

  const sellersProvider = useSellersProvider();
  const ordersProvider = useOrdersProvider();
  const customersProvider = useCustomersProvider();
  const goalsProvider = useGoalsProvider();
  const settingsProvider = useSettingsProvider();
  const badgesQuery = useBadges({ storeId: scope.storeId, enabled });

  const storeId = scope.storeId ?? "00000000-0000-0000-0000-000000000001";

  const sellersQuery = useQuery({
    queryKey: ["gamification", "sellers", storeId],
    queryFn: () => sellersProvider.list({ storeId, active: true }),
    staleTime: STALE_MS,
    enabled,
  });

  const settingsQuery = useQuery({
    queryKey: ["gamification", "settings", storeId],
    queryFn: () => settingsProvider.get(storeId),
    staleTime: 5 * 60_000,
    enabled,
  });

  const ordersCurrentQuery = useQuery({
    queryKey: ["gamification", "orders", storeId, period.startIso, period.endIso, scope.sellerId],
    queryFn: () =>
      ordersProvider.list({
        storeId,
        sellerId: scope.sellerId,
        paymentStatus: "pago",
        since: period.startIso,
        until: period.endIso,
        pageSize: 5000,
      }),
    staleTime: STALE_MS,
    enabled,
  });

  const previous = useMemo(() => previousPeriod(period), [period]);

  const ordersPreviousQuery = useQuery({
    queryKey: [
      "gamification",
      "orders",
      "prev",
      storeId,
      previous.startIso,
      previous.endIso,
      scope.sellerId,
    ],
    queryFn: () =>
      ordersProvider.list({
        storeId,
        sellerId: scope.sellerId,
        paymentStatus: "pago",
        since: previous.startIso,
        until: previous.endIso,
        pageSize: 5000,
      }),
    staleTime: STALE_MS,
    enabled,
  });

  const ordersHistoricalQuery = useQuery({
    // History is used to detect "recovery" (gap > 90 days). Pull a wide window.
    queryKey: ["gamification", "orders", "history", storeId, period.endIso],
    queryFn: () =>
      ordersProvider.list({
        storeId,
        paymentStatus: "pago",
        until: period.endIso,
        pageSize: 5000,
      }),
    staleTime: 5 * 60_000,
    enabled,
  });

  const customersQuery = useQuery({
    queryKey: ["gamification", "customers", storeId, scope.sellerId],
    queryFn: () =>
      customersProvider.list({
        storeId,
        sellerIds: scope.sellerId ? [scope.sellerId] : undefined,
        pageSize: 3000,
      }),
    staleTime: STALE_MS,
    enabled,
  });

  const goalsQuery = useQuery({
    queryKey: ["gamification", "goals", storeId, scope.sellerId],
    queryFn: () => goalsProvider.list({ storeId, pageSize: 1000 }),
    staleTime: STALE_MS,
    enabled,
  });

  const isLoading =
    sellersQuery.isLoading ||
    settingsQuery.isLoading ||
    ordersCurrentQuery.isLoading ||
    ordersPreviousQuery.isLoading ||
    ordersHistoricalQuery.isLoading ||
    customersQuery.isLoading ||
    goalsQuery.isLoading ||
    badgesQuery.isLoading;

  const hasError =
    sellersQuery.isError ||
    settingsQuery.isError ||
    ordersCurrentQuery.isError ||
    ordersPreviousQuery.isError ||
    ordersHistoricalQuery.isError ||
    customersQuery.isError ||
    goalsQuery.isError ||
    badgesQuery.hasError;

  const refetch = () => {
    void sellersQuery.refetch();
    void settingsQuery.refetch();
    void ordersCurrentQuery.refetch();
    void ordersPreviousQuery.refetch();
    void ordersHistoricalQuery.refetch();
    void customersQuery.refetch();
    void goalsQuery.refetch();
    badgesQuery.refetch();
  };

  const sellers = useMemo(
    () => (sellersQuery.data ?? []).filter((s) => s.id !== "seller-joao-gallo"),
    [sellersQuery.data],
  );

  const rules: IGamificationRules | null = useMemo(() => {
    const base = settingsQuery.data?.gamificationRules;
    if (!base) return null;
    return { ...base, ...(rulesOverride ?? {}) };
  }, [settingsQuery.data, rulesOverride]);

  const result = useMemo<{
    ranking: IRankingEntry[];
    newBadges: ReturnType<typeof evaluateBadgesForSeller>;
  }>(() => {
    if (isLoading || hasError || !rules) {
      return { ranking: [], newBadges: [] };
    }
    const ordersCurrent = ordersCurrentQuery.data?.data ?? [];
    const ordersHistorical = ordersHistoricalQuery.data?.data ?? [];
    const customers = customersQuery.data?.data ?? [];
    const goals = goalsQuery.data?.data ?? [];
    const badges = badgesQuery.badges;
    const ordersPrev = ordersPreviousQuery.data?.data ?? [];

    // Compute previous-period ranking first (no badges since they don't change history).
    const prevEntries: IRankingEntry[] = sellers.map((seller) =>
      calculateSellerScore(seller.id, previous, {
        rules,
        sellers,
        goals,
        paidOrders: ordersPrev,
        customers,
        badges,
      }),
    );
    const prevRanked = calculateRanking(prevEntries);
    const prevMap = new Map<ID, IRankingEntry>(prevRanked.map((e) => [e.sellerId, e]));

    // Current period: full context with historical orders (for recovery heuristics).
    const sellerEntries: IRankingEntry[] = sellers.map((seller) =>
      calculateSellerScore(seller.id, period, {
        rules,
        sellers,
        goals,
        paidOrders: [
          ...ordersCurrent,
          ...ordersHistorical.filter((o) => o.createdAt < period.startIso),
        ],
        customers,
        badges,
        previousPeriodEntries: prevMap,
      }),
    );
    const ranking = calculateRanking(sellerEntries);

    // Evaluate newly-earnable badges across all sellers (idempotent vs current state).
    const newBadges: ReturnType<typeof evaluateBadgesForSeller> = [];
    for (const seller of sellers) {
      const earned = evaluateBadgesForSeller({
        sellerId: seller.id,
        period,
        rankingForPeriod: ranking,
        context: {
          rules,
          sellers,
          goals,
          paidOrders: [
            ...ordersCurrent,
            ...ordersHistorical.filter((o) => o.createdAt < period.startIso),
          ],
          customers,
          badges,
        },
      });
      newBadges.push(...earned);
    }

    return { ranking, newBadges };
  }, [
    isLoading,
    hasError,
    rules,
    sellers,
    period,
    previous,
    ordersCurrentQuery.data,
    ordersPreviousQuery.data,
    ordersHistoricalQuery.data,
    customersQuery.data,
    goalsQuery.data,
    badgesQuery.badges,
  ]);

  return {
    isLoading,
    hasError,
    refetch,
    rules,
    sellers,
    ranking: result.ranking,
    newBadges: result.newBadges,
    period,
  };
}
