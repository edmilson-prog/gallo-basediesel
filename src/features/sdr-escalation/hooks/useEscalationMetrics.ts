import { useEffect, useMemo, useRef, useState } from "react";
import type { ID, ISdrEscalation, SdrEscalationMode } from "@/shared/types";
import { useSdrEscalationsProvider } from "@/providers/data";
import { ESCALATION_QUEUE_EVENT } from "./useUrgentBroadcastQueue";

export interface IEscalationMetricsFilters {
  storeId?: ID;
  fromDate?: string;
  toDate?: string;
  sellerId?: ID;
}

export interface IEscalationMetrics {
  total: number;
  byMode: Record<SdrEscalationMode, number>;
  /** Average time to first human response (seconds). */
  averageTimeToFirstResponseSeconds: number;
  /** Percent (0..1) of escalations whose status is `abandoned`. */
  abandonRate: number;
  /** Percent (0..1) of escalations where the chosen seller had a specialty match. */
  specialtyHitRate: number;
  /** Percent (0..1) of escalations whose status is `answered`. */
  answerRate: number;
  /** Raw list backing the metrics (filtered). */
  items: ISdrEscalation[];
}

const EMPTY_METRICS: IEscalationMetrics = {
  total: 0,
  byMode: { urgent: 0, normal: 0, standard: 0 },
  averageTimeToFirstResponseSeconds: 0,
  abandonRate: 0,
  specialtyHitRate: 0,
  answerRate: 0,
  items: [],
};

/**
 * Compute escalation metrics on top of the persisted records. Recomputes
 * whenever the escalation event stream fires (PRD-023 RF-021).
 */
export function useEscalationMetrics(filters: IEscalationMetricsFilters = {}): IEscalationMetrics {
  const provider = useSdrEscalationsProvider();
  const [items, setItems] = useState<ISdrEscalation[]>([]);
  const debounceRef = useRef<number | null>(null);
  const REFETCH_DEBOUNCE_MS = 1_000;

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      try {
        const list = await provider.list({
          storeId: filters.storeId,
          fromDate: filters.fromDate,
          toDate: filters.toDate,
          assignedSellerId: filters.sellerId,
        });
        if (!cancelled) setItems(list);
      } catch {
        if (!cancelled) setItems([]);
      }
    }
    void fetchAll();
    const handler = () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        void fetchAll();
      }, REFETCH_DEBOUNCE_MS);
    };
    if (typeof window !== "undefined") {
      window.addEventListener(ESCALATION_QUEUE_EVENT, handler);
      return () => {
        cancelled = true;
        if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
        window.removeEventListener(ESCALATION_QUEUE_EVENT, handler);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [provider, filters.storeId, filters.fromDate, filters.toDate, filters.sellerId]);

  return useMemo(() => {
    if (items.length === 0) return EMPTY_METRICS;
    const byMode: Record<SdrEscalationMode, number> = { urgent: 0, normal: 0, standard: 0 };
    let answered = 0;
    let abandoned = 0;
    let specialtyHits = 0;
    let totalTtfrSeconds = 0;
    let ttfrSamples = 0;
    for (const e of items) {
      byMode[e.mode] += 1;
      if (e.status === "answered") answered += 1;
      if (e.status === "abandoned") abandoned += 1;
      if (e.specialtyMatched) specialtyHits += 1;
      if (e.firstHumanResponseAt && e.assignedAt) {
        const dt =
          (new Date(e.firstHumanResponseAt).getTime() - new Date(e.assignedAt).getTime()) / 1000;
        if (Number.isFinite(dt) && dt >= 0) {
          totalTtfrSeconds += dt;
          ttfrSamples += 1;
        }
      }
    }
    return {
      total: items.length,
      byMode,
      averageTimeToFirstResponseSeconds:
        ttfrSamples > 0 ? Math.round(totalTtfrSeconds / ttfrSamples) : 0,
      abandonRate: abandoned / items.length,
      specialtyHitRate: specialtyHits / items.length,
      answerRate: answered / items.length,
      items,
    };
  }, [items]);
}
