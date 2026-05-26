import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ID,
  IQuote,
  ISdrEscalation,
  ISdrSession,
  SdrEscalationReason,
  SdrFinishReason,
} from "@/shared/types";
import {
  useQuotesProvider,
  useSdrEscalationsProvider,
  useSdrSessionsProvider,
} from "@/providers/data";
import { ESCALATION_QUEUE_EVENT } from "@/features/sdr-escalation";
import type { ISdrDashboardWindow } from "./useSdrDashboardFilters";

export interface ISdrDashboardDataFilters {
  storeId?: ID;
  window: ISdrDashboardWindow;
  previousWindow: ISdrDashboardWindow;
}

export interface ISdrDashboardKpi {
  current: number;
  previous: number;
  /** Percent change (integer, sign preserved) or null when comparison is invalid. */
  changePct: number | null;
}

export interface ISdrDashboardData {
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  sessions: ISdrSession[];
  previousSessions: ISdrSession[];
  escalations: ISdrEscalation[];
  previousEscalations: ISdrEscalation[];
  quotes: IQuote[];
  totalSessions: ISdrDashboardKpi;
  escalationRate: ISdrDashboardKpi;
  acceptanceRate: ISdrDashboardKpi;
  ttfrSeconds: ISdrDashboardKpi;
  finishReasonBreakdown: { reason: SdrFinishReason; count: number; pct: number }[];
  dailyVolume: { date: string; count: number }[];
  escalationReasonBreakdown: { reason: SdrEscalationReason; count: number; pct: number }[];
  ttfrByMode: { mode: "urgent" | "normal" | "standard"; seconds: number; samples: number }[];
  faqBreakdown: { category: string; resolved: number; escalated: number }[];
  heatmap: { day: number; hour: number; count: number }[];
}

function withinWindow(iso: string | undefined, window: ISdrDashboardWindow): boolean {
  if (!iso) return false;
  return iso >= window.fromIso && iso <= window.toIso;
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0 && current === 0) return 0;
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function computeFinishBreakdown(
  sessions: ISdrSession[],
): { reason: SdrFinishReason; count: number; pct: number }[] {
  const reasons: SdrFinishReason[] = ["completed", "escalated", "abandoned", "paused_by_human"];
  const total = sessions.length;
  return reasons.map((reason) => {
    const count = sessions.filter((s) => s.finishReason === reason).length;
    return { reason, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 };
  });
}

function computeDailyVolume(
  sessions: ISdrSession[],
  window: ISdrDashboardWindow,
): { date: string; count: number }[] {
  const dayMs = 24 * 3600_000;
  const from = new Date(window.fromIso).getTime();
  const to = new Date(window.toIso).getTime();
  const dayCount = Math.max(1, Math.ceil((to - from) / dayMs));
  const buckets = new Map<string, number>();
  for (let i = 0; i < dayCount; i += 1) {
    const d = new Date(from + i * dayMs);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, 0);
  }
  for (const session of sessions) {
    const key = session.startedAt.slice(0, 10);
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
  }
  return [...buckets.entries()].map(([date, count]) => ({ date, count }));
}

function computeEscalationBreakdown(
  escalations: ISdrEscalation[],
): { reason: SdrEscalationReason; count: number; pct: number }[] {
  const reasons: SdrEscalationReason[] = [
    "customer_requested",
    "negotiation_detected",
    "sdr_failed",
    "complexity",
    "out_of_scope",
  ];
  const total = escalations.length;
  return reasons.map((reason) => {
    const count = escalations.filter((e) => e.reason === reason).length;
    return { reason, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 };
  });
}

function computeTtfrByMode(
  escalations: ISdrEscalation[],
): { mode: "urgent" | "normal" | "standard"; seconds: number; samples: number }[] {
  const modes: ("urgent" | "normal" | "standard")[] = ["urgent", "normal", "standard"];
  return modes.map((mode) => {
    const items = escalations.filter((e) => e.mode === mode);
    let total = 0;
    let samples = 0;
    for (const e of items) {
      if (e.firstHumanResponseAt && e.assignedAt) {
        const dt =
          (new Date(e.firstHumanResponseAt).getTime() - new Date(e.assignedAt).getTime()) / 1000;
        if (Number.isFinite(dt) && dt >= 0) {
          total += dt;
          samples += 1;
        }
      }
    }
    return {
      mode,
      seconds: samples > 0 ? Math.round(total / samples) : 0,
      samples,
    };
  });
}

const FAQ_NEEDLE: Record<string, RegExp> = {
  horario: /\b(horário|horario|abre|aberto|fechado|fecham|24h)\b/i,
  entrega: /\b(entrega|prazo|recebe|envio|transportadora)\b/i,
  pagamento: /\b(pagamento|paga|pix|boleto|cartão|cartao|parcel)\b/i,
  garantia: /\b(garantia|devolução|devolucao|troca|defeito)\b/i,
};

function classifyNeed(needs: string | undefined): string | null {
  if (!needs) return null;
  for (const [category, re] of Object.entries(FAQ_NEEDLE)) {
    if (re.test(needs)) return category;
  }
  return null;
}

function computeFaqBreakdown(
  sessions: ISdrSession[],
): { category: string; resolved: number; escalated: number }[] {
  const categories = Object.keys(FAQ_NEEDLE);
  const result: { category: string; resolved: number; escalated: number }[] = categories.map(
    (category) => ({ category, resolved: 0, escalated: 0 }),
  );
  for (const session of sessions) {
    const category = classifyNeed(session.collectedData.needs);
    if (!category) continue;
    const bucket = result.find((r) => r.category === category);
    if (!bucket) continue;
    if (session.finishReason === "escalated") bucket.escalated += 1;
    else if (session.finishReason === "completed") bucket.resolved += 1;
  }
  return result;
}

function computeHeatmap(sessions: ISdrSession[]): { day: number; hour: number; count: number }[] {
  const cells: { day: number; hour: number; count: number }[] = [];
  for (let day = 0; day < 7; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      cells.push({ day, hour, count: 0 });
    }
  }
  for (const session of sessions) {
    const date = new Date(session.startedAt);
    const day = date.getDay();
    const hour = date.getHours();
    const cell = cells.find((c) => c.day === day && c.hour === hour);
    if (cell) cell.count += 1;
  }
  return cells;
}

function computeAcceptanceRate(quotes: IQuote[], window: ISdrDashboardWindow): number {
  const sdrQuotes = quotes.filter(
    (q) => q.origin === "sdr" && q.createdAt >= window.fromIso && q.createdAt <= window.toIso,
  );
  if (sdrQuotes.length === 0) return 0;
  const accepted = sdrQuotes.filter(
    (q) => q.status === "aceito" || q.status === "convertido",
  ).length;
  return Math.round((accepted / sdrQuotes.length) * 100);
}

function computeTtfr(escalations: ISdrEscalation[]): number {
  let total = 0;
  let samples = 0;
  for (const e of escalations) {
    if (e.firstHumanResponseAt && e.assignedAt) {
      const dt =
        (new Date(e.firstHumanResponseAt).getTime() - new Date(e.assignedAt).getTime()) / 1000;
      if (Number.isFinite(dt) && dt >= 0) {
        total += dt;
        samples += 1;
      }
    }
  }
  return samples > 0 ? Math.round(total / samples) : 0;
}

/**
 * Aggregates every metric the SDR painel needs (PRD-024). Listens to escalation
 * events so the painel is reactive when a vendor claims an urgent broadcast or
 * a session finishes, mirroring `useEscalationMetrics` semantics.
 */
export function useSdrDashboardData(filters: ISdrDashboardDataFilters): ISdrDashboardData {
  const sessionsProvider = useSdrSessionsProvider();
  const escalationsProvider = useSdrEscalationsProvider();
  const quotesProvider = useQuotesProvider();

  const [allSessions, setAllSessions] = useState<ISdrSession[]>([]);
  const [allEscalations, setAllEscalations] = useState<ISdrEscalation[]>([]);
  const [allQuotes, setAllQuotes] = useState<IQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);

  const fetchAll = useMemo(() => {
    return async () => {
      setLoading(true);
      setError(null);
      try {
        const storeId = filters.storeId;
        const fromIso = filters.previousWindow.fromIso;
        const toIso = filters.window.toIso;
        const [sessions, escalations, quotesPage] = await Promise.all([
          sessionsProvider.list({ storeId, fromDate: fromIso, toDate: toIso }),
          escalationsProvider.list({ storeId, fromDate: fromIso, toDate: toIso }),
          quotesProvider.list({ storeId, pageSize: 500 }),
        ]);
        setAllSessions(sessions);
        setAllEscalations(escalations);
        setAllQuotes(quotesPage.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao carregar dados do SDR.");
      } finally {
        setLoading(false);
      }
    };
  }, [
    sessionsProvider,
    escalationsProvider,
    quotesProvider,
    filters.storeId,
    filters.previousWindow.fromIso,
    filters.window.toIso,
  ]);

  useEffect(() => {
    void fetchAll();
    const handler = () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        void fetchAll();
      }, 1000);
    };
    if (typeof window !== "undefined") {
      window.addEventListener(ESCALATION_QUEUE_EVENT, handler);
      return () => {
        if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
        window.removeEventListener(ESCALATION_QUEUE_EVENT, handler);
      };
    }
    return undefined;
  }, [fetchAll]);

  return useMemo<ISdrDashboardData>(() => {
    const sessions = allSessions.filter((s) => withinWindow(s.startedAt, filters.window));
    const previousSessions = allSessions.filter((s) =>
      withinWindow(s.startedAt, filters.previousWindow),
    );
    const escalations = allEscalations.filter((e) => withinWindow(e.createdAt, filters.window));
    const previousEscalations = allEscalations.filter((e) =>
      withinWindow(e.createdAt, filters.previousWindow),
    );

    const totalCurrent = sessions.length;
    const totalPrevious = previousSessions.length;

    const escalatedCurrent = sessions.filter((s) => s.finishReason === "escalated").length;
    const escalatedPrevious = previousSessions.filter((s) => s.finishReason === "escalated").length;
    const escalationRateCurrent =
      totalCurrent > 0 ? Math.round((escalatedCurrent / totalCurrent) * 100) : 0;
    const escalationRatePrevious =
      totalPrevious > 0 ? Math.round((escalatedPrevious / totalPrevious) * 100) : 0;

    const acceptanceCurrent = computeAcceptanceRate(allQuotes, filters.window);
    const acceptancePrevious = computeAcceptanceRate(allQuotes, filters.previousWindow);

    const ttfrCurrent = computeTtfr(escalations);
    const ttfrPrevious = computeTtfr(previousEscalations);

    return {
      loading,
      error,
      refetch: fetchAll,
      sessions,
      previousSessions,
      escalations,
      previousEscalations,
      quotes: allQuotes,
      totalSessions: {
        current: totalCurrent,
        previous: totalPrevious,
        changePct: pctChange(totalCurrent, totalPrevious),
      },
      escalationRate: {
        current: escalationRateCurrent,
        previous: escalationRatePrevious,
        changePct: pctChange(escalationRateCurrent, escalationRatePrevious),
      },
      acceptanceRate: {
        current: acceptanceCurrent,
        previous: acceptancePrevious,
        changePct: pctChange(acceptanceCurrent, acceptancePrevious),
      },
      ttfrSeconds: {
        current: ttfrCurrent,
        previous: ttfrPrevious,
        changePct: pctChange(ttfrCurrent, ttfrPrevious),
      },
      finishReasonBreakdown: computeFinishBreakdown(sessions),
      dailyVolume: computeDailyVolume(sessions, filters.window),
      escalationReasonBreakdown: computeEscalationBreakdown(escalations),
      ttfrByMode: computeTtfrByMode(escalations),
      faqBreakdown: computeFaqBreakdown(sessions),
      heatmap: computeHeatmap(sessions),
    };
  }, [
    allSessions,
    allEscalations,
    allQuotes,
    filters.window,
    filters.previousWindow,
    loading,
    error,
    fetchAll,
  ]);
}
