import { useMemo } from "react";
import type { IDREAlert } from "@/shared/types";
import { PROFITABILITY_THRESHOLDS } from "../engine";
import type {
  IProductProfitabilityRow,
  IProfitabilityCoverage,
  ISellerProfitabilityRow,
} from "../engine";

export interface IUseProfitabilityAlertsParams {
  productRows: IProductProfitabilityRow[];
  sellerRows: ISellerProfitabilityRow[];
  coverage: IProfitabilityCoverage;
}

/**
 * Derive the alert list (PRD-049 RF-022/023) from the engine output.
 *
 * Reuses `IDREAlert` so the UI banner can be shared with PRD-048 and the same
 * severity classes apply.
 */
export function useProfitabilityAlerts(params: IUseProfitabilityAlertsParams): IDREAlert[] {
  return useMemo<IDREAlert[]>(() => {
    const alerts: IDREAlert[] = [];

    const negative = params.productRows.filter((r) => r.marginPct < 0);
    if (negative.length > 0) {
      alerts.push({
        id: "products-negative",
        severity: "critical",
        icon: "mdi:alert-octagon-outline",
        title: `${negative.length} produto${negative.length === 1 ? "" : "s"} com margem negativa`,
        description: `Margem abaixo de 0% em ${negative.length} item(s) — abra a aba Produto para revisar custos e política de preços.`,
      });
    }

    if (params.coverage.totalItems > 0 && params.coverage.pct < 0.8) {
      alerts.push({
        id: "coverage-low",
        severity: params.coverage.pct < 0.6 ? "critical" : "warning",
        icon: "mdi:database-alert-outline",
        title: `Cobertura de custo em ${(params.coverage.pct * 100).toFixed(0)}%`,
        description: `${params.coverage.missingItems} itens em ${params.coverage.missingParts} peças sem custo cadastrado. A análise está sobre dados parciais.`,
      });
    }

    if (params.sellerRows.length >= 2) {
      const avgMargin =
        params.sellerRows.reduce((sum, r) => sum + r.marginPct, 0) / params.sellerRows.length;
      const stdDev = Math.sqrt(
        params.sellerRows.reduce((acc, r) => acc + (r.marginPct - avgMargin) ** 2, 0) /
          params.sellerRows.length,
      );
      const threshold = avgMargin - stdDev;
      const flagged = params.sellerRows
        .filter((r) => r.marginPct < threshold)
        .sort((a, b) => a.marginPct - b.marginPct);
      if (flagged.length > 0) {
        const worst = flagged[0];
        alerts.push({
          id: "seller-low-margin",
          severity: "warning",
          icon: "mdi:account-alert-outline",
          title: `Vendedor com margem abaixo da média: ${worst.label}`,
          description: `Margem média de ${(worst.marginPct * 100).toFixed(1)}% — média da equipe é ${(avgMargin * 100).toFixed(1)}%. Pode indicar excesso de desconto.`,
        });
      }
    }

    return alerts;
  }, [params.productRows, params.sellerRows, params.coverage]);
}

export { PROFITABILITY_THRESHOLDS };
