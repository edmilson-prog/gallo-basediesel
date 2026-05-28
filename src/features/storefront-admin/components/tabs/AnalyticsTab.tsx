import type { ID } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { useEcommerceMetrics } from "../../hooks/useEcommerceMetrics";
import { STOREFRONT_ADMIN_STRINGS as S } from "../../i18n/pt-BR";

export interface IAnalyticsTabProps {
  storeId: ID;
}

const TOP_PAGES = [
  { page: "/loja", visits: 980 },
  { page: "/loja/categoria/filtros", visits: 612 },
  { page: "/loja/busca", visits: 488 },
  { page: "/loja/categoria/freios", visits: 351 },
  { page: "/loja/produto/...", visits: 290 },
];

const TRAFFIC_SOURCES = [
  { label: "Busca orgânica", pct: 42, icon: "mdi:google" },
  { label: "Direto", pct: 28, icon: "mdi:link-variant" },
  { label: "WhatsApp", pct: 18, icon: "mdi:whatsapp" },
  { label: "Instagram", pct: 12, icon: "mdi:instagram" },
];

const DEVICES = [
  { label: "Mobile", pct: 64, icon: "mdi:cellphone" },
  { label: "Desktop", pct: 30, icon: "mdi:monitor" },
  { label: "Tablet", pct: 6, icon: "mdi:tablet" },
];

export function AnalyticsTab({ storeId }: IAnalyticsTabProps) {
  const { data } = useEcommerceMetrics(storeId);
  const orders = data?.orderCount ?? 0;

  // Funnel — visits/product/cart are placeholders; the last step is real.
  const funnel = [
    { label: S.funnelVisits, value: 2480, kind: "mock" as const },
    { label: S.funnelProduct, value: 1340, kind: "mock" as const },
    { label: S.funnelCart, value: 320, kind: "mock" as const },
    { label: S.funnelOrder, value: orders, kind: "real" as const },
  ];
  const max = Math.max(...funnel.map((f) => f.value), 1);

  return (
    <div className="space-y-6">
      <Card className="flex items-start gap-3 border-primary/30 bg-primary/5 p-4">
        <Icon icon="mdi:information-outline" size={18} className="mt-0.5 text-primary" />
        <p className="text-xs text-muted-foreground">{S.phase2Banner}</p>
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="text-base font-semibold text-foreground">{S.funnelTitle}</h2>
        <div className="space-y-3">
          {funnel.map((step, idx) => {
            const prev = idx > 0 ? funnel[idx - 1] : null;
            // RF-018: conversion rate from the previous funnel step.
            const conversion =
              prev && prev.value > 0 ? Math.round((step.value / prev.value) * 1000) / 10 : null;
            return (
              <div key={step.label} className="space-y-1">
                {conversion !== null && (
                  <div className="flex items-center gap-1 pl-1 text-[11px] text-muted-foreground">
                    <Icon icon="mdi:arrow-down" size={12} aria-hidden />
                    <span className="tabular-nums">{conversion}%</span>
                    <span>de conversão do passo anterior</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-foreground">
                    {step.label}
                    <Badge
                      variant="outline"
                      className={
                        step.kind === "real"
                          ? "border-primary/40 bg-primary/10 text-[10px] text-primary"
                          : "border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400"
                      }
                    >
                      {step.kind === "real" ? S.badgeReal : S.badgeMock}
                    </Badge>
                  </span>
                  <span className="font-semibold tabular-nums text-foreground">{step.value}</span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max((step.value / max) * 100, 2)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-3 p-6">
          <h3 className="text-sm font-semibold text-foreground">{S.topPagesTitle}</h3>
          <ul className="space-y-2 text-sm">
            {TOP_PAGES.map((p) => (
              <li key={p.page} className="flex items-center justify-between gap-2">
                <code className="truncate font-mono text-xs text-muted-foreground">{p.page}</code>
                <span className="tabular-nums text-foreground">{p.visits}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="space-y-3 p-6">
          <h3 className="text-sm font-semibold text-foreground">{S.trafficSourcesTitle}</h3>
          <ul className="space-y-2 text-sm">
            {TRAFFIC_SOURCES.map((t) => (
              <li key={t.label} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Icon icon={t.icon} size={16} aria-hidden />
                  {t.label}
                </span>
                <span className="tabular-nums text-foreground">{t.pct}%</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="space-y-3 p-6">
          <h3 className="text-sm font-semibold text-foreground">{S.devicePerfTitle}</h3>
          <ul className="space-y-2 text-sm">
            {DEVICES.map((d) => (
              <li key={d.label} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Icon icon={d.icon} size={16} aria-hidden />
                  {d.label}
                </span>
                <span className="tabular-nums text-foreground">{d.pct}%</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
