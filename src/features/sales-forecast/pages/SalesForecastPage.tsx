import { useNavigate, useSearch } from "@tanstack/react-router";

import type { ForecastMetric, IForecast } from "@/shared/types/forecast";
import { DashboardLayout } from "@/features/shell/layouts";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useCurrentStore } from "@/features/multistore";

import { useStoreForecast } from "../hooks/useStoreForecast";
import { ForecastScenarioCard } from "../components/ForecastScenarioCard";
import { ForecastSellersTable } from "../components/ForecastSellersTable";
import { ForecastHowItWorks } from "../components/ForecastHowItWorks";

const ROUTE_ID = "/app/gestao/forecast" as const;

const METRIC_TABS: { value: ForecastMetric; label: string }[] = [
  { value: "revenue", label: "Faturamento" },
  { value: "tickets", label: "Pedidos" },
];

/** A forecast is "empty" when nothing was realized and the pipeline is empty too. */
function isEmptyForecast(forecast: IForecast | null): boolean {
  if (!forecast) return true;
  const provavel = forecast.scenarios.find((scenario) => scenario.type === "provavel");
  const projected = provavel?.projectedValue ?? 0;
  return forecast.realizedValue <= 0 && projected <= 0;
}

/** Keyboard- and screen-reader-friendly metric switch bound to the URL search. */
function MetricToggle({
  metric,
  onChange,
}: {
  metric: ForecastMetric;
  onChange: (next: ForecastMetric) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Métrica do forecast"
      className="inline-flex items-center gap-1 rounded-lg bg-muted/40 p-1"
    >
      {METRIC_TABS.map((tab) => {
        const active = tab.value === metric;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Closing-forecast surface (PRD-056). Projects where the current month will close
 * for the active store: realized + weighted pipeline + run-rate, across three
 * deterministic scenarios, plus a per-seller drill-down. The metric (faturamento /
 * pedidos) is persisted in the URL search so the view is shareable.
 */
export function SalesForecastPage() {
  const { currentStoreId } = useCurrentStore();
  const search = useSearch({ from: ROUTE_ID });
  const navigate = useNavigate({ from: ROUTE_ID });

  const metric = search.metric;
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";

  const { storeForecast, bySeller, isLoading, hasError } = useStoreForecast({ storeId, metric });

  const setMetric = (next: ForecastMetric) => {
    void navigate({ search: { metric: next } });
  };

  const header = (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Forecast de fechamento
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Projeção de onde o período vai fechar — realizado + pipeline ponderado + ritmo.
        </p>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
          <Icon icon="mdi:calendar-month-outline" size={14} />
          Mês atual
        </span>
      </div>
      <MetricToggle metric={metric} onChange={setMetric} />
    </header>
  );

  let body: React.ReactNode;

  if (isLoading) {
    body = (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="flex flex-col gap-3 p-5">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-9 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-2 w-full" />
            </Card>
          ))}
        </div>
        <Card className="flex flex-col gap-3 p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-32 w-full" />
        </Card>
      </div>
    );
  } else if (hasError) {
    body = (
      <Card className="flex flex-col items-start gap-3 p-6">
        <div className="flex items-center gap-2 text-foreground">
          <Icon icon="mdi:alert-circle-outline" size={20} className="text-destructive" />
          <span className="text-sm font-medium">Não foi possível carregar o forecast.</span>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <Icon icon="mdi:refresh" size={16} />
          Tentar novamente
        </button>
      </Card>
    );
  } else if (isEmptyForecast(storeForecast)) {
    body = (
      <EmptyState
        icon="mdi:chart-timeline-variant"
        title="Dados insuficientes para projetar"
        description="Ainda não há pedidos pagos nem pipeline aberto suficiente para projetar o fechamento do período."
      />
    );
  } else {
    const forecast = storeForecast as IForecast;
    const pessimista = forecast.scenarios.find((s) => s.type === "pessimista");
    const provavel = forecast.scenarios.find((s) => s.type === "provavel");
    const otimista = forecast.scenarios.find((s) => s.type === "otimista");

    body = (
      <div className="flex flex-col gap-8">
        {forecast.lowConfidence && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300"
          >
            <Icon icon="mdi:alert-circle-outline" size={18} className="mt-0.5 shrink-0" />
            <span>
              Projeção pouco confiável — poucos dias decorridos. A precisão melhora ao longo do mês.
            </span>
          </div>
        )}

        <section aria-labelledby="forecast-scenarios-heading" className="flex flex-col gap-3">
          <h2 id="forecast-scenarios-heading" className="text-lg font-semibold text-foreground">
            Cenários
          </h2>
          {/* Mobile order: Provável → Pessimista → Otimista; md+ restores Pess. / Prov. / Otim. */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {provavel && (
              <div className="order-1 md:order-2">
                <ForecastScenarioCard
                  scenario={provavel}
                  metric={metric}
                  highlighted
                  showBreakdown
                />
              </div>
            )}
            {pessimista && (
              <div className="order-2 md:order-1">
                <ForecastScenarioCard scenario={pessimista} metric={metric} />
              </div>
            )}
            {otimista && (
              <div className="order-3 md:order-3">
                <ForecastScenarioCard scenario={otimista} metric={metric} />
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby="forecast-sellers-heading" className="flex flex-col gap-3">
          <h2 id="forecast-sellers-heading" className="text-lg font-semibold text-foreground">
            Forecast por vendedor
          </h2>
          <Card className="p-5">
            <ForecastSellersTable rows={bySeller} metric={metric} />
          </Card>
        </section>
      </div>
    );
  }

  return (
    <DashboardLayout>
      {header}
      <ForecastHowItWorks />
      {body}
    </DashboardLayout>
  );
}
