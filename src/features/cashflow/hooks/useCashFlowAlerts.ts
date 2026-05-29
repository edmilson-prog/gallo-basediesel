import { useMemo } from "react";
import type { ICashFlowSummary } from "@/shared/types";
import { formatBRL, formatDateBR } from "@/shared/utils/format";
import { CASHFLOW_STRINGS as S } from "../i18n/pt-BR";

export type CashFlowAlertSeverity = "info" | "warning" | "critical";

export interface ICashFlowAlert {
  id: string;
  severity: CashFlowAlertSeverity;
  title: string;
  description: string;
}

/**
 * Derive cash flow alerts (PRD-055 RF-019/020/021): current balance below the
 * minimum, projection crossing the minimum, and projection turning negative.
 */
export function useCashFlowAlerts(
  summary: ICashFlowSummary | null,
  minBalance: number,
): ICashFlowAlert[] {
  return useMemo(() => {
    if (!summary) return [];
    const alerts: ICashFlowAlert[] = [];

    if (summary.closingBalance < minBalance) {
      alerts.push({
        id: "low-balance",
        severity: summary.closingBalance < 0 ? "critical" : "warning",
        title: S.alertLowTitle,
        description: `Saldo atual de ${formatBRL(summary.closingBalance)} está abaixo do mínimo de ${formatBRL(minBalance)}.`,
      });
    }

    const projection = summary.dailyBalances.filter((p) => p.isProjection);
    const firstNegative = projection.find((p) => p.balance < 0);
    const firstCross = projection.find((p) => p.balance >= 0 && p.balance < minBalance);

    if (firstNegative) {
      alerts.push({
        id: "projected-negative",
        severity: "critical",
        title: S.alertProjectedNegativeTitle,
        description: `O caixa projetado fica negativo em ${formatDateBR(firstNegative.date)} (${formatBRL(firstNegative.balance)}).`,
      });
    } else if (firstCross) {
      alerts.push({
        id: "projected-cross",
        severity: "warning",
        title: S.alertProjectedCrossTitle,
        description: `O caixa projetado cai abaixo de ${formatBRL(minBalance)} em ${formatDateBR(firstCross.date)}.`,
      });
    }

    return alerts;
  }, [summary, minBalance]);
}
