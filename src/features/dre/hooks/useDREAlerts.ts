import { useMemo } from "react";
import type { IDREAlert, IDREPeriod } from "@/shared/types";

/**
 * Derive the actionable alert list from a `IDREPeriod`. Pure transformation —
 * lives in a hook so consumers benefit from referential stability via
 * `useMemo`.
 */
export function useDREAlerts(dre: IDREPeriod | null): IDREAlert[] {
  return useMemo<IDREAlert[]>(() => {
    if (!dre) return [];
    const alerts: IDREAlert[] = [];

    if (dre.cmvCoverage < 0.9 && dre.cmvMissingItemsCount > 0) {
      alerts.push({
        id: "cmv-coverage",
        severity: dre.cmvCoverage < 0.6 ? "critical" : "warning",
        icon: "mdi:database-alert-outline",
        title: `Cobertura de CMV em ${(dre.cmvCoverage * 100).toFixed(0)}%`,
        description: `${dre.cmvMissingItemsCount} itens de pedidos pagos no período usam peças sem custo cadastrado (${dre.cmvMissingPartsCount} peças distintas). A margem bruta está superestimada.`,
      });
    }

    if (dre.operatingResult < 0) {
      alerts.push({
        id: "operating-loss",
        severity: "critical",
        icon: "mdi:alert-octagon-outline",
        title: "Resultado operacional negativo",
        description: "Despesas operacionais superaram a margem bruta neste período.",
      });
    } else if (dre.grossMarginPct < 0.3 && dre.netRevenue > 0) {
      alerts.push({
        id: "low-gross-margin",
        severity: "warning",
        icon: "mdi:trending-down",
        title: `Margem bruta em ${(dre.grossMarginPct * 100).toFixed(1)}%`,
        description:
          "Margem bruta abaixo de 30%. Avalie política de preços e renegociação com fornecedores.",
      });
    }

    if (dre.vsPreviousPeriod) {
      const delta = dre.vsPreviousPeriod.deltas.netResult;
      if (delta.direction === "down" && delta.deltaPct != null && delta.deltaPct <= -0.2) {
        alerts.push({
          id: "drop-vs-previous",
          severity: "warning",
          icon: "mdi:chart-line-variant",
          title: `Resultado líquido caiu ${(delta.deltaPct * -100).toFixed(0)}% vs ${dre.vsPreviousPeriod.basePeriodLabel}`,
          description:
            "Queda relevante em relação ao período anterior. Verifique receita, devoluções e CMV.",
        });
      }
    }

    return alerts;
  }, [dre]);
}
