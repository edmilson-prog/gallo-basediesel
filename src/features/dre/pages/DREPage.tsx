import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { formatBRL } from "@/shared/utils/format";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { DREHeader } from "../components/DREHeader";
import { DRETable } from "../components/DRETable";
import { DRECoverageCard } from "../components/DRECoverageCard";
import { DREAlertsBanner } from "../components/DREAlertsBanner";
import { DRETrendChart } from "../components/DRETrendChart";
import { DREExpensesChart } from "../components/DREExpensesChart";
import { buildMonthOptions, useDREData, type DREPeriodKind } from "../hooks/useDREData";
import { useDREAlerts } from "../hooks/useDREAlerts";
import { DRE_STRINGS as S } from "../i18n/pt-BR";

const ALLOWED_ROLES = new Set(["Owner", "Gestor", "Financeiro"]);

function currentMonthKey(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * `/app/gestao/dre` — DRE Gerencial (PRD-048).
 *
 * Owner / Financeiro: full DRE + drill-downs + configurable assumptions.
 * Gestor: same screen, read-only (config link hidden in the SettingsLayout).
 * Vendedor / SDR / Cliente: bounced upstream via `requireAuth` on the route.
 */
export function DREPage() {
  const { userRole } = useAuth();
  const { currentStore } = useCurrentStore();
  const storeId = currentStore?.id ?? "00000000-0000-0000-0000-000000000001";

  const [kind, setKind] = useState<DREPeriodKind>("monthly");
  const [monthKey, setMonthKey] = useState(() => currentMonthKey());

  const monthOptions = useMemo(() => buildMonthOptions(18), []);

  const { dre, trend, isLoading, isError, refetch } = useDREData({
    storeId,
    monthKey,
    kind,
    enabled: ALLOWED_ROLES.has(userRole ?? ""),
  });

  const alerts = useDREAlerts(dre);

  if (!userRole || !ALLOWED_ROLES.has(userRole)) {
    return (
      <EmptyState
        icon="mdi:shield-lock-outline"
        title="Acesso restrito"
        description="Esta tela é visível apenas para Owner, Gestor e Financeiro."
        actionLabel="Voltar ao início"
        actionTo="/app/inicio"
      />
    );
  }

  return (
    <div className="space-y-6">
      <DREHeader
        kind={kind}
        onKindChange={(v) => setKind(v)}
        monthKey={monthKey}
        onMonthKeyChange={(v) => setMonthKey(v)}
        monthOptions={monthOptions}
        onRefresh={refetch}
      />

      {isError && (
        <Card className="border-destructive/40 bg-destructive/10 p-4 text-sm">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:alert-circle-outline" size={18} className="text-destructive" />
            <span>Não foi possível carregar os dados do DRE. Tente novamente.</span>
          </div>
        </Card>
      )}

      {isLoading || !dre ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <Skeleton className="h-96 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      ) : dre.grossRevenue === 0 && dre.returns === 0 ? (
        <Card className="p-10 text-center">
          <Icon icon="mdi:inbox-outline" size={36} className="mx-auto text-muted-foreground" />
          <h2 className="mt-3 text-base font-semibold text-foreground">{S.emptyTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{S.emptyDescription}</p>
        </Card>
      ) : (
        <>
          <DREAlertsBanner alerts={alerts} />

          <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <DRETable dre={dre} />
            <div className="space-y-4">
              <Card className="flex flex-col gap-2 p-5">
                <header className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-foreground">{dre.periodLabel}</h2>
                  <Icon icon="mdi:cash-multiple" size={20} className="text-muted-foreground" />
                </header>
                <span className="text-3xl font-semibold tabular-nums text-foreground">
                  {formatBRL(dre.netResult)}
                </span>
                <p className="text-xs text-muted-foreground">
                  Resultado líquido — {(dre.netResultPct * 100).toFixed(1)}% da receita líquida
                </p>
              </Card>
              <DRECoverageCard dre={dre} />
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <DRETrendChart data={trend} />
            <DREExpensesChart dre={dre} />
          </section>
        </>
      )}
    </div>
  );
}
