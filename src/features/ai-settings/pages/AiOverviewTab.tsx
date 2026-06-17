import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AiUsagePeriod } from "@/shared/types";
import { useAiUsage } from "../hooks/useAiUsage";
import { KpiCard } from "../components/KpiCard";
import { ConsumptionAreaChart } from "../components/ConsumptionAreaChart";
import { ProviderShareDonut } from "../components/ProviderShareDonut";
import { CostByFeatureBars } from "../components/CostByFeatureBars";
import { AI_STRINGS } from "../i18n/pt-BR";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const int = new Intl.NumberFormat("pt-BR");

export function AiOverviewTab() {
  const [period, setPeriod] = useState<AiUsagePeriod>("current_month");
  const { summary, loading } = useAiUsage(period);

  if (loading || !summary) return <Skeleton className="h-[520px] w-full" />;
  if (summary.calls === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">{AI_STRINGS.emptyUsage}</Card>
    );
  }

  return (
    <div className="space-y-4">
      <table className="sr-only">
        <caption>Consumo por provedor no período (alternativa acessível aos gráficos)</caption>
        <tbody>
          {summary.byProvider.map((p) => (
            <tr key={p.providerId}>
              <th scope="row">{p.providerId}</th>
              <td>{p.calls} chamadas</td>
              <td>{p.costBRL.toFixed(2)} reais</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-end">
        <select
          aria-label="Período"
          value={period}
          onChange={(e) => setPeriod(e.target.value as AiUsagePeriod)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
        >
          <option value="current_month">Mês atual</option>
          <option value="last_7d">Últimos 7 dias</option>
          <option value="last_30d">Últimos 30 dias</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard icon="mdi:lightning-bolt" label="Chamadas" value={int.format(summary.calls)} />
        <KpiCard icon="mdi:circle-multiple" label="Tokens" value={int.format(summary.tokens)} />
        <KpiCard icon="mdi:cash" label="Custo est." value={brl.format(summary.costBRL)} />
        <KpiCard
          icon="mdi:gauge"
          label="Budget"
          value={`${Math.round(summary.budgetPct)}%`}
          progressPct={summary.budgetPct}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <p className="mb-3 text-sm font-semibold">Consumo no período</p>
          <ConsumptionAreaChart series={summary.series} metric="calls" />
        </Card>
        <Card className="p-4">
          <p className="mb-3 text-sm font-semibold">Por provedor</p>
          <ProviderShareDonut byProvider={summary.byProvider} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="p-4">
          <p className="mb-3 text-sm font-semibold">Custo por funcionalidade</p>
          <CostByFeatureBars byFeature={summary.byFeature} />
        </Card>
        <Card className="p-4">
          <p className="mb-3 text-sm font-semibold">Confiabilidade & projeção</p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Projeção do mês</dt>
              <dd className="font-medium">{brl.format(summary.projectionBRL)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Tokens/chamada</dt>
              <dd className="font-medium">{int.format(summary.avgTokensPerCall)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Taxa de erro</dt>
              <dd className="font-medium">{(summary.errorRate * 100).toFixed(1)}%</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Taxa de fallback</dt>
              <dd className="font-medium">{(summary.fallbackRate * 100).toFixed(1)}%</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Latência média</dt>
              <dd className="font-medium">{(summary.avgLatencyMs / 1000).toFixed(1)}s</dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
