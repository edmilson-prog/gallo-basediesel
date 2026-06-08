import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { useCashFlowProvider } from "@/providers/data";
import { buildMonthOptions } from "@/features/expenses/utils/period";
import { CASHFLOW_STRINGS as S } from "../i18n/pt-BR";
import { useCashFlowFilters } from "../hooks/useCashFlowFilters";
import { useCashFlowData } from "../hooks/useCashFlowData";
import { useCashFlowAlerts } from "../hooks/useCashFlowAlerts";
import { CashFlowFilters } from "../components/CashFlowFilters";
import { CashFlowKpis } from "../components/CashFlowKpis";
import { CashFlowChart } from "../components/CashFlowChart";
import { CashFlowTable } from "../components/CashFlowTable";
import { BalanceAlerts } from "../components/BalanceAlerts";
import { ManualEntryDialog, type IManualEntrySubmit } from "../components/ManualEntryDialog";

/**
 * Cash flow page (`/app/gestao/caixa`) — PRD-055. Owner / Financeiro can add
 * manual entries; Gestor is read-only. The route guard blocks everyone else.
 */
export function CashFlowPage() {
  const { userRole, currentUser } = useAuth();
  const { currentStore } = useCurrentStore();
  const storeId = currentStore?.id ?? "00000000-0000-0000-0000-000000000001";
  const canWrite = userRole === "Owner" || userRole === "Financeiro";
  const createdBy = currentUser?.id ?? "system";

  const ctl = useCashFlowFilters();
  const { summary, entries, minBalanceAlert, isLoading, refetch } = useCashFlowData({
    storeId,
    monthKey: ctl.filters.monthKey,
    kind: ctl.filters.kind,
  });
  const alerts = useCashFlowAlerts(summary, minBalanceAlert);

  const cashflowProvider = useCashFlowProvider();
  const queryClient = useQueryClient();
  const [manualOpen, setManualOpen] = useState(false);

  const monthOptions = useMemo(() => buildMonthOptions(12), []);

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (ctl.filters.direction !== "ambos" && e.type !== ctl.filters.direction) return false;
      if (ctl.filters.status !== "ambos" && e.status !== ctl.filters.status) return false;
      if (ctl.filters.sources.length > 0 && !ctl.filters.sources.includes(e.source)) return false;
      return true;
    });
  }, [entries, ctl.filters]);

  const handleManualEntry = async (input: IManualEntrySubmit) => {
    await cashflowProvider.create({
      type: input.type,
      amount: input.amount,
      date: input.date,
      description: input.description,
      storeId,
      createdBy,
    });
    void queryClient.invalidateQueries({ queryKey: ["cashflow"] });
    refetch();
  };

  return (
    <div className="space-y-6">
      <CashFlowFilters
        ctl={ctl}
        monthOptions={monthOptions}
        canCreate={canWrite}
        onNew={() => setManualOpen(true)}
      />

      <div className="flex items-center gap-2 rounded-md border border-info/40 bg-info/10 px-3 py-2 text-xs text-foreground">
        <Icon icon="mdi:information-outline" size={14} />
        {S.regimeBanner}
      </div>

      {!canWrite && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Icon icon="mdi:eye-outline" size={14} />
          {S.readOnlyBanner}
        </div>
      )}

      {isLoading || !summary ? (
        <>
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-72 w-full" />
        </>
      ) : (
        <>
          <BalanceAlerts alerts={alerts} />
          <CashFlowKpis summary={summary} />
          <CashFlowChart summary={summary} minBalance={minBalanceAlert} />
          {filteredEntries.length === 0 ? (
            <Card className="p-12 text-center">
              <Icon
                icon="mdi:cash-clock"
                size={36}
                className="mx-auto mb-3 text-muted-foreground"
              />
              <p className="text-sm text-muted-foreground">{S.empty}</p>
            </Card>
          ) : (
            <CashFlowTable entries={filteredEntries} />
          )}
        </>
      )}

      {canWrite && (
        <ManualEntryDialog
          open={manualOpen}
          onOpenChange={setManualOpen}
          onConfirm={handleManualEntry}
        />
      )}
    </div>
  );
}
