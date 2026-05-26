import { useMemo, useState } from "react";
import type { ID, ISdrSession } from "@/shared/types";
import { SdrHistoryFilters } from "../SdrHistoryFilters";
import { SdrSessionsTable } from "../SdrSessionsTable";
import { SdrSessionDetailModal } from "../SdrSessionDetailModal";
import { useSdrHistoryFilters } from "../../hooks/useSdrHistoryFilters";
import type { ISdrDashboardData } from "../../hooks/useSdrDashboardData";

const PAGE_SIZE = 30;

export interface ISdrHistoryTabProps {
  data: ISdrDashboardData;
  storeId: ID;
}

export function SdrHistoryTab({ data, storeId }: ISdrHistoryTabProps) {
  const history = useSdrHistoryFilters();
  const [selectedSession, setSelectedSession] = useState<ISdrSession | null>(null);

  const filtered = useMemo(() => {
    const escalationsByConv = new Map(data.escalations.map((e) => [e.conversationId, e]));
    return data.sessions
      .filter((session) => {
        if (history.filters.finishReasons.length > 0) {
          if (
            !session.finishReason ||
            !history.filters.finishReasons.includes(session.finishReason)
          ) {
            return false;
          }
        }
        if (history.filters.escalationReason !== "all") {
          const escalation = escalationsByConv.get(session.conversationId);
          if (!escalation || escalation.reason !== history.filters.escalationReason) {
            return false;
          }
        }
        if (history.filters.sellerId !== "all") {
          const escalation = escalationsByConv.get(session.conversationId);
          if (!escalation || escalation.assignedSellerId !== history.filters.sellerId) {
            return false;
          }
        }
        if (history.filters.hasQuote === "yes" && !session.collectedData.quoteId) return false;
        if (history.filters.hasQuote === "no" && session.collectedData.quoteId) return false;
        return true;
      })
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }, [
    data.sessions,
    data.escalations,
    history.filters.finishReasons,
    history.filters.escalationReason,
    history.filters.sellerId,
    history.filters.hasQuote,
  ]);

  // storeId reserved for future store-scoped re-filtering when multi-store opens up.
  void storeId;

  return (
    <div className="space-y-4">
      <SdrHistoryFilters
        state={history.filters}
        toggleFinishReason={history.toggleFinishReason}
        setEscalationReason={history.setEscalationReason}
        setSellerId={history.setSellerId}
        setHasQuote={history.setHasQuote}
        reset={history.reset}
      />

      <SdrSessionsTable
        sessions={filtered}
        page={history.filters.page}
        pageSize={PAGE_SIZE}
        onPageChange={history.setPage}
        onOpenSession={(session) => setSelectedSession(session)}
        isLoading={data.loading}
      />

      <SdrSessionDetailModal
        session={selectedSession}
        open={selectedSession !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedSession(null);
        }}
      />
    </div>
  );
}
